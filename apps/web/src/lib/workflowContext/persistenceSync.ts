// WorkflowContext domain module — persistence sync.
//
// Extracted from lib/WorkflowContext.tsx (issue #590 slice 4, mechanical
// split only — no logic/behavior changes). This is the local↔persisted id
// bridge: every `persistX` action here takes the just-applied local write,
// pushes it to Supabase, records the persisted id against the local id in
// the matching ref map, and re-syncs the persisted rows. None of these are
// hooks (they were plain `function`/`async function` declarations in the
// provider body), so they are wrapped in a single factory that WorkflowContext
// calls once per render, exactly reproducing the original per-render closure
// semantics without touching hook order.
import type { MutableRefObject } from "react";
import type {
  Area,
  Phase2TaskDraft,
  Phase2TimeBlockProposal,
} from "@lifeos/schemas";
import {
  applyTaskReviewTransition,
  createCaptureItem,
  createTimeBlockProposal,
  editTimeBlockProposal,
  rejectTimeBlockProposal,
  type MinimalSupabaseClient,
  type ReviewTaskTargetStatus,
} from "../data/workflow";
import {
  findQueuedWriteToSupersede,
  hasPendingWrite,
  journalExecutionSessionWrite,
  journalPlanPlacementWrite,
  journalPlanUnplacementWrite,
  journalReviewWrite,
  journalTaskDraftAcceptWrite,
  journalTaskDropWrite,
} from "../durability/durableWrites";
import {
  savedOnThisDeviceAndSendingBanner,
  savedOnThisDeviceBanner,
} from "../statusVocabulary";
import { createSupabaseBrowserClient } from "../supabase/browser";
import type {
  Phase2MockCalendarBlock,
  Phase2MockExecutionSession,
  Phase2MockTask,
} from "../types";
import type { WorkflowState } from "../workflow";
// Direct submodule import: the workflow barrel freezes the pre-split public
// surface, and this #844 type is consumed only by the state layer.
import type { AccountIdAliasFamily } from "../workflow/shared";
import {
  persistedAreaIdForWorkflowId,
  persistedIdForLocalId,
} from "./reducerCore";

export interface PersistenceSyncDeps {
  persistedAreasRef: MutableRefObject<Area[]>;
  persistedCaptureIdByLocalIdRef: MutableRefObject<Map<string, string>>;
  persistedTaskIdByLocalIdRef: MutableRefObject<Map<string, string>>;
  persistedProposalIdByLocalIdRef: MutableRefObject<Map<string, string>>;
  persistedBlockIdByLocalIdRef: MutableRefObject<Map<string, string>>;
  persistedSessionIdByLocalIdRef: MutableRefObject<Map<string, string>>;
  selectedAreaId: string | null;
  /**
   * #844 — the ONE record point for "this local row became this account row".
   * Writes the per-mount ref AND the reducer's durable alias map, so the
   * twinship survives a reload. Every path here that learns an account id must
   * call this rather than setting a ref directly.
   */
  recordAccountAlias: (
    family: AccountIdAliasFamily,
    localId: string,
    accountId: string,
  ) => void;
  markLocalOnly: (message: string) => void;
  /** #737-A slice 2: the device journal refused the write; nothing holds it. */
  markDeviceStorageBlocked: () => void;
  /** #737-A slice 2: drain the win/review journal to the account. */
  replayJournaledWrites: () => Promise<unknown>;
  syncPersistedWorkflowRows: (
    client: MinimalSupabaseClient | null,
  ) => Promise<void>;
}

/**
 * What actually happened to a session outcome, in the user's terms.
 *
 * `not-an-outcome` is not a failure: pausing (or any non-terminal mark) makes
 * no record on purpose, and the caller must not show save copy for it.
 */
export type SessionSaveResult =
  | "persisted"
  | "local-only"
  | "device-blocked"
  | "not-an-outcome";

/**
 * The device's session status -> the outcome that may be RECORDED.
 *
 * Deliberately total and explicit: every value that reaches the table is one
 * of the six `execution_sessions_outcome_check` allows, and anything without
 * a user-chosen meaning maps to null and is never written. `in_progress`
 * cannot appear here at all — it is not a status.
 */
function recordableOutcomeForStatus(
  status: Phase2MockExecutionSession["status"],
): string | null {
  switch (status) {
    case "completed":
      return "completed";
    case "missed":
      return "skipped";
    case "skipped":
      return "skipped";
    case "partial":
      return "partial";
    case "distracted":
      return "distracted";
    case "stuck":
      return "blocked";
    case "stopped":
      return "stopped";
    default:
      return null;
  }
}

export function createPersistenceSync(deps: PersistenceSyncDeps) {
  const {
    persistedAreasRef,
    persistedCaptureIdByLocalIdRef,
    persistedTaskIdByLocalIdRef,
    persistedProposalIdByLocalIdRef,
    persistedBlockIdByLocalIdRef,
    persistedSessionIdByLocalIdRef,
    selectedAreaId,
    recordAccountAlias,
    markLocalOnly,
    markDeviceStorageBlocked,
    replayJournaledWrites,
    syncPersistedWorkflowRows,
  } = deps;

  async function persistCapture(
    localCapture: WorkflowState["captureItems"][number],
  ) {
    const client = createSupabaseBrowserClient();
    const persistedAreaId = localCapture.area_id
      ? persistedAreaIdForWorkflowId(
          localCapture.area_id,
          persistedAreasRef.current,
        )
      : null;

    if (!client || (localCapture.area_id && !persistedAreaId)) {
      markLocalOnly(savedOnThisDeviceBanner("Your capture"));
      return;
    }

    const result = await createCaptureItem(client, {
      raw_text: localCapture.raw_text,
      return_hook: localCapture.return_hook ?? null,
      area_id: persistedAreaId,
    });
    if (result.provider !== "supabase") {
      return;
    }

    recordAccountAlias("captures", localCapture.id, result.capture.id);
    await syncPersistedWorkflowRows(client);
  }

  /**
   * #737 C1 S3: the triage decision reaches the DEVICE before the network.
   *
   * What this replaces: the whole account sequence used to run inline here,
   * behind `if (!client || !persistedAreaId) { markLocalOnly(...); return; }`.
   * Signed out, offline, or in an area that had not synced yet, the accepted
   * task existed only in the reducer's per-tab `sessionStorage` mirror while
   * the banner said it was "saved on this device" — true only until the tab
   * closed. The sequence itself now lives in
   * `data/workflow/draftAccept.ts` and runs as a REPLAY of the journal entry,
   * step-by-step idempotent, so it can be retried until the account takes it.
   *
   * The payload is a snapshot of the draft AS THE USER LEFT IT, which is what
   * makes an edit-then-accept durable: the reducer drops the draft the instant
   * it is accepted, so there is nothing to re-read at replay time.
   */
  async function persistAcceptedTaskDraft(
    draft: Phase2TaskDraft,
    localTask: Phase2MockTask,
    localProposal: Phase2TimeBlockProposal | null,
    status: "active" | "backlog",
  ) {
    const persistedAreaId = persistedAreaIdForWorkflowId(
      draft.area_id,
      persistedAreasRef.current,
    );
    const persistedCaptureId = persistedIdForLocalId(
      draft.capture_item_id,
      persistedCaptureIdByLocalIdRef.current,
    );

    // Pinned at the moment the user accepted. It feeds `waiting_on_since`, and
    // a replay running tomorrow must not claim the user has been waiting on
    // someone only since the retry.
    const acceptedAt = new Date().toISOString();

    let journalled;
    try {
      journalled = await journalTaskDraftAcceptWrite({
        workflowDraftId: draft.id,
        workflowTaskId: localTask.id,
        workflowAreaId: draft.area_id,
        persistedAreaId,
        workflowCaptureId: draft.capture_item_id,
        persistedCaptureId,
        title: draft.title,
        description: draft.description,
        confidence: draft.confidence,
        taskType: draft.task_type ?? null,
        isReversible: draft.is_reversible ?? null,
        dueAt: draft.due_at ?? null,
        estimatedMinutesLow: draft.estimated_minutes_low,
        estimatedMinutesHigh: draft.estimated_minutes_high,
        firstTinyStep: draft.first_tiny_step,
        isCommitment: draft.is_commitment,
        personMentions: draft.person_mentions.map((mention) => ({
          name: mention.name,
          role: mention.role,
        })),
        taskStatus: status,
        acceptedAt,
        workflowProposalId:
          localProposal && status === "active" ? localProposal.id : null,
        proposedStart:
          localProposal && status === "active"
            ? localProposal.proposed_start
            : null,
        proposedEnd:
          localProposal && status === "active"
            ? localProposal.proposed_end
            : null,
        rationale:
          localProposal && status === "active" ? localProposal.rationale : null,
      });
    } catch {
      // The device itself refused to hold it. Nothing has the decision, and the
      // banner must name that cause rather than blaming the account.
      markDeviceStorageBlocked();
      return;
    }

    try {
      await replayJournaledWrites();
    } catch {
      // Best-effort: the decision stays journalled and the next replay retries.
    }

    if (await hasPendingWrite(journalled.client_write_id)) {
      markLocalOnly(savedOnThisDeviceAndSendingBanner("Your triage decision"));
      return;
    }

    const client = createSupabaseBrowserClient();
    if (client) await syncPersistedWorkflowRows(client);
  }

  /**
   * #737 C1 S3: a placed block reaches the DEVICE before the network.
   *
   * What this replaces: `createTimeBlockProposal` -> `accept_time_block_proposal`
   * -> `supersedePendingTimeBlockProposalsForTask`, three round trips behind
   * `if (!client || !persistedTaskId) { markLocalOnly("Your plan"); return; }`.
   * Beyond the device-durability gap, that sequence could half-land: a proposal
   * row with no block. Replay now calls `place_time_block`, which does all
   * three inside ONE transaction under the journal entry's `client_write_id`.
   */
  async function persistPlannedTask(
    localTaskId: string,
    localProposal: Phase2TimeBlockProposal,
    localBlock: Phase2MockCalendarBlock,
  ) {
    await journalAndReplayPlacement({
      workflowTaskId: localTaskId,
      persistedTaskId: persistedIdForLocalId(
        localTaskId,
        persistedTaskIdByLocalIdRef.current,
      ),
      workflowProposalId: localProposal.id,
      // Freshly minted by the reducer, so the account cannot already hold it —
      // `place_time_block` mints the row.
      persistedProposalId: null,
      workflowBlockId: localBlock.id,
      proposedStart: localProposal.proposed_start,
      proposedEnd: localProposal.proposed_end,
      rationale: localProposal.rationale,
    });
  }

  /**
   * Journal one placement and try to deliver it, shared by both placement
   * paths. Kept as one function because the two differ ONLY in whether the
   * account already holds a proposal row — everything the user sees, and every
   * truth claim made about it, is identical.
   */
  async function journalAndReplayPlacement(input: {
    workflowTaskId: string;
    persistedTaskId: string | null;
    workflowProposalId: string | null;
    persistedProposalId: string | null;
    workflowBlockId: string | null;
    proposedStart: string;
    proposedEnd: string;
    rationale: string | null;
  }) {
    let journalled;
    try {
      journalled = await journalPlanPlacementWrite(input);
    } catch {
      markDeviceStorageBlocked();
      return;
    }

    try {
      await replayJournaledWrites();
    } catch {
      // Best-effort: the placement stays journalled and the next replay retries.
    }

    if (await hasPendingWrite(journalled.client_write_id)) {
      markLocalOnly(savedOnThisDeviceAndSendingBanner("Your plan"));
      return;
    }

    const client = createSupabaseBrowserClient();
    if (client) await syncPersistedWorkflowRows(client);
  }

  async function persistCreatedLocalProposal(
    localProposal: Phase2TimeBlockProposal,
  ) {
    const client = createSupabaseBrowserClient();
    let persistedTaskId = persistedIdForLocalId(
      localProposal.task_id,
      persistedTaskIdByLocalIdRef.current,
    );

    /**
     * #840 follow-up: the drafted block that never reached the account.
     *
     * The task a draft hangs off carries a DEVICE-LOCAL id until its own
     * journalled accept is replayed — only that replay records the account id
     * (`recordTaskDraftAcceptIds`). Draft a block inside that window and the
     * lookup below answered null.
     *
     * That mattered more here than anywhere else in this file, because unlike
     * every placement path this write is NOT journalled: `markLocalOnly` was
     * the END of it. The draft stayed on the device, the account never heard
     * about it, and nothing ever retried — a silent loss, reproduced locally
     * (`persistedTaskId: null` with an empty id map while state still held
     * `task-1`).
     *
     * Draining the journal first turns the common case — the task's own write
     * is merely still in flight — into a delivered draft. If the id is still
     * unknown afterwards the honest banner below stands: nothing is claimed
     * that did not happen.
     */
    if (client && !persistedTaskId) {
      try {
        await replayJournaledWrites();
      } catch {
        // Best-effort: the re-resolve below decides what the user is told.
      }
      persistedTaskId = persistedIdForLocalId(
        localProposal.task_id,
        persistedTaskIdByLocalIdRef.current,
      );
    }

    if (!client || !persistedTaskId) {
      markLocalOnly(savedOnThisDeviceBanner("Your new proposal"));
      return;
    }

    const proposalResult = await createTimeBlockProposal(client, {
      task_id: persistedTaskId,
      proposed_start: localProposal.proposed_start,
      proposed_end: localProposal.proposed_end,
      rationale_note: localProposal.rationale,
    });
    if (proposalResult.provider !== "supabase") {
      return;
    }

    recordAccountAlias("proposals", localProposal.id, proposalResult.proposal.id);

    await syncPersistedWorkflowRows(client);
  }

  async function persistEditedLocalProposal(
    localProposal: Phase2TimeBlockProposal,
  ) {
    const client = createSupabaseBrowserClient();
    const persistedProposalId = persistedIdForLocalId(
      localProposal.id,
      persistedProposalIdByLocalIdRef.current,
    );

    if (!client || !persistedProposalId) {
      markLocalOnly(savedOnThisDeviceBanner("Your proposal edit"));
      return;
    }

    await editTimeBlockProposal(client, persistedProposalId, {
      proposed_start: localProposal.proposed_start,
      proposed_end: localProposal.proposed_end,
    });

    await syncPersistedWorkflowRows(client);
  }

  async function persistRejectedLocalProposal(
    localProposal: Phase2TimeBlockProposal,
  ) {
    const client = createSupabaseBrowserClient();
    const persistedProposalId = persistedIdForLocalId(
      localProposal.id,
      persistedProposalIdByLocalIdRef.current,
    );

    if (!client || !persistedProposalId) {
      markLocalOnly(savedOnThisDeviceBanner("Your rejected proposal"));
      return;
    }

    await rejectTimeBlockProposal(client, persistedProposalId);
    await syncPersistedWorkflowRows(client);
  }

  /**
   * #737 C1 S3: the OTHER placement path — accepting a proposal — journalled
   * on exactly the same terms.
   *
   * The one difference from `persistPlannedTask` is that the account may
   * ALREADY hold this proposal, so its id is pinned when known. Passing it
   * through matters: without it `place_time_block` would mint a second
   * proposal row for one logical block and leave the original pending. That is
   * why both paths were wired in this slice rather than one — shipping the
   * `client_write_id` column with one placement route un-stamped would leave a
   * silent duplicate-producing path behind.
   */
  async function persistAcceptedLocalProposal(
    localProposal: Phase2TimeBlockProposal,
    localBlock: Phase2MockCalendarBlock | null,
  ) {
    await journalAndReplayPlacement({
      workflowTaskId: localProposal.task_id,
      persistedTaskId: persistedIdForLocalId(
        localProposal.task_id,
        persistedTaskIdByLocalIdRef.current,
      ),
      workflowProposalId: localProposal.id,
      persistedProposalId: persistedIdForLocalId(
        localProposal.id,
        persistedProposalIdByLocalIdRef.current,
      ),
      workflowBlockId: localBlock?.id ?? null,
      proposedStart: localProposal.proposed_start,
      proposedEnd: localProposal.proposed_end,
      rationale: localProposal.rationale,
    });
  }

  /**
   * #737 C1 S5: the undo is journalled too, so the sync can never overrule it.
   *
   * What this replaces, and why it was a bug worth its own slice: the whole
   * body used to be the account call behind
   * `if (!client || !persistedBlockId) { markLocalOnly("Your plan change"); return; }`.
   * After S3 made the PLACEMENT durable, that early return became a data
   * defect rather than a harmless fallback — the placement was queued, the
   * undo was not, and the next reconnect delivered a block the user had
   * explicitly deleted (#778 disclosed the exact sequence).
   *
   * Both cases are now journalled, and the payload's
   * `supersedes_client_write_id` is what tells them apart:
   *
   *  - the placement is STILL QUEUED -> the entry names it, and
   *    `resolveSupersededWrites` annuls both before either is dispatched. No
   *    network call is made, because none is owed: the account never heard
   *    about the block in the first place.
   *  - the placement ALREADY LANDED -> the entry names nothing, survives the
   *    pass, and its handler sends the real `unplan_calendar_block`.
   */
  async function persistUnplannedBlock(localBlockId: string) {
    const persistedBlockId = persistedIdForLocalId(
      localBlockId,
      persistedBlockIdByLocalIdRef.current,
    );

    // Matched on the workflow-local block id, which both halves carry and
    // which exists whether or not the account has ever seen this block. The
    // persisted id would be null in exactly the case that matters.
    const supersedes = await findQueuedWriteToSupersede(
      "plan_placement",
      (payload) => payload.workflow_block_id === localBlockId,
    );

    let journalled;
    try {
      journalled = await journalPlanUnplacementWrite({
        workflowBlockId: localBlockId,
        persistedBlockId,
        supersedesClientWriteId: supersedes,
      });
    } catch {
      markDeviceStorageBlocked();
      return;
    }

    try {
      await replayJournaledWrites();
    } catch {
      // Best-effort: the change stays journalled and the next replay retries.
    }

    if (await hasPendingWrite(journalled.client_write_id)) {
      markLocalOnly(savedOnThisDeviceAndSendingBanner("Your plan change"));
      return;
    }

    const client = createSupabaseBrowserClient();
    if (client) await syncPersistedWorkflowRows(client);
  }

  /**
   * #737 C1 S5: the accept-then-drop half of the same fix.
   *
   * #778 named this as the second shape of the resurrection: accept a draft
   * offline (a `task_draft_accept` is queued), drop the task offline, and the
   * replay still creates it on the account as `active`. Identical mechanism to
   * `persistUnplannedBlock` — annul the queued accept, or send the real
   * `dropped` transition if the accept already landed.
   *
   * Only DROP gets this treatment, not defer or carry-forward: those move a
   * task the user still wants, so the accept must still be delivered and the
   * transition applied on top of it. Drop is the one that says "this should
   * not exist", which is the only intent an annulment can honestly represent.
   */
  async function persistDroppedTask(localTaskId: string) {
    const persistedTaskId = persistedIdForLocalId(
      localTaskId,
      persistedTaskIdByLocalIdRef.current,
    );

    const supersedes = await findQueuedWriteToSupersede(
      "task_draft_accept",
      (payload) => payload.workflow_task_id === localTaskId,
    );

    // Nothing queued to annul AND the account already knows this task: this is
    // an ordinary transition with no compensating role, so it keeps the
    // established path rather than growing a second one.
    if (!supersedes && persistedTaskId) {
      return persistTaskReviewTransition(localTaskId, "dropped");
    }

    let journalled;
    try {
      journalled = await journalTaskDropWrite({
        workflowTaskId: localTaskId,
        persistedTaskId,
        supersedesClientWriteId: supersedes,
      });
    } catch {
      markDeviceStorageBlocked();
      return;
    }

    try {
      await replayJournaledWrites();
    } catch {
      // Best-effort: the drop stays journalled and the next replay retries.
    }

    if (await hasPendingWrite(journalled.client_write_id)) {
      markLocalOnly(savedOnThisDeviceAndSendingBanner("Your change"));
      return;
    }

    const client = createSupabaseBrowserClient();
    if (client) await syncPersistedWorkflowRows(client);
  }

  async function persistTaskReviewTransition(
    localTaskId: string,
    targetStatus: ReviewTaskTargetStatus,
  ) {
    const client = createSupabaseBrowserClient();
    const persistedTaskId = persistedIdForLocalId(
      localTaskId,
      persistedTaskIdByLocalIdRef.current,
    );

    if (!client || !persistedTaskId) {
      markLocalOnly(savedOnThisDeviceBanner("Your recovery choice"));
      return;
    }

    await applyTaskReviewTransition(client, persistedTaskId, targetStatus);
    await syncPersistedWorkflowRows(client);
  }

  // #588: surfaces the real outcome so callers can gate "day closed" copy on
  // it. #737-A slice 2 made the outcomes TRUE rather than changing them:
  //
  //  - the review is written to the DEVICE JOURNAL first, so "local-only" now
  //    means a new tab can read it back, where before it meant the review
  //    lived in one tab's sessionStorage and closing that tab lost it;
  //  - the account write is a replay of the journal entry, carrying its
  //    client_write_id, so a retry can never create a second review row;
  //  - "persisted" is still claimed only when the account actually has it.
  //
  // A journal write that fails returns "device-blocked" rather than throwing.
  // Throwing would send the caller down `markPersistedSaveFailure`, whose
  // banner says "Saving to your account didn't work" — the wrong cause
  // entirely, since the account was never reached and the DEVICE is what
  // refused. The caller still maps it to its failure verdict and must not
  // claim the day closed.
  //
  // A NETWORK failure no longer fails at all: the review is safely journalled
  // and the next replay retries it, which is "local-only".
  async function persistReviewEntry(
    next: WorkflowState,
    periodStart: string,
  ): Promise<"persisted" | "local-only" | "device-blocked"> {
    const persistedAreaId = selectedAreaId
      ? persistedAreaIdForWorkflowId(selectedAreaId, persistedAreasRef.current)
      : null;

    // Pinned at save time by the CALLER, and pinned to the user's LOCAL
    // calendar day (`localIsoDate`). Two reasons it is a parameter now:
    //
    //  - replay may not run until a later day, and a review must stay filed
    //    under the day it closed (the original reason);
    //  - the caller records the same day in its own "which days are closed"
    //    state, and the two must be the SAME instant's day, not two reads of
    //    the clock either side of a network round trip.
    //
    // It used to be `new Date().toISOString().slice(0, 10)` — the UTC day —
    // while the Close moment counted its blocks over the LOCAL day. Those
    // disagree every evening west of Greenwich, which is precisely when the
    // Close moment is the surface being shown.
    const today = periodStart;

    let journalled;
    try {
      journalled = await journalReviewWrite({
        workflowAreaId: selectedAreaId,
        persistedAreaId,
        reviewType: "daily",
        periodStart: today,
        periodEnd: today,
        summaryJson: {
          verdict: "saved",
          completed_sessions: next.executionSessions.filter(
            (session) => session.status === "completed",
          ).length,
          missed_sessions: next.executionSessions.filter(
            (session) => session.status === "missed",
          ).length,
          distracted_sessions: next.executionSessions.filter(
            (session) => session.status === "distracted",
          ).length,
          open_tasks: next.tasks.filter((task) =>
            ["active", "backlog", "scheduled", "blocked"].includes(task.status),
          ).length,
          scheduled_blocks: next.calendarBlocks.filter((block) =>
            ["scheduled", "running"].includes(block.status),
          ).length,
          recent_log: next.reviewLog.slice(0, 8),
        },
      });
    } catch {
      // The device itself refused to hold the review. Nothing has it, and the
      // banner must name that cause rather than blaming the account.
      markDeviceStorageBlocked();
      return "device-blocked";
    }

    try {
      await replayJournaledWrites();
    } catch {
      // Best-effort: the review stays journalled and the next replay retries.
    }

    if (await hasPendingWrite(journalled.client_write_id)) {
      markLocalOnly(savedOnThisDeviceAndSendingBanner("Your review"));
      return "local-only";
    }

    const client = createSupabaseBrowserClient();
    if (client) await syncPersistedWorkflowRows(client);
    return "persisted";
  }

  /**
   * #737 C1 card 1: starting a session writes NOTHING to the account.
   *
   * `start_execution_session` used to insert a row here, and because
   * `execution_sessions.outcome` is `not null` over six user-facing values it
   * had to invent one — `'partial'`. That is audit P0#1: an outcome on the
   * user's record that they never chose, left behind by every session they
   * did not finish, and read back as a phantom "running" session forever.
   *
   * A running session is device state now
   * (`lib/execute/runningSession.ts`). The account row is created ONCE, from
   * the outcome the user picks in the end sheet, by `persistMarkedSession`
   * below. Nothing is claimed at start, so nothing here may say "saved".
   *
   * Kept as a named no-op rather than deleted so the start path still has an
   * explicit statement of this rule at the call site.
   */
  async function persistStartedSession(
    _localSession: Phase2MockExecutionSession,
  ): Promise<void> {
    return;
  }

  /**
   * The end sheet's chosen outcome, journalled and then replayed — the ONE
   * write a focus session ever produces.
   *
   * Device first, exactly like wins and reviews (#737-A slice 2): the outcome
   * reaches IndexedDB before any network call, so "saved on this device" is
   * true the moment the user is told it and a closed tab cannot lose it. The
   * account write is a replay of that record, deduplicated server-side on
   * `client_write_id` by `record_execution_session`.
   *
   * `paused` is not an outcome and never becomes a row: pausing is a
   * statement about the clock, not about how the work went.
   */
  async function persistMarkedSession(
    localSession: Phase2MockExecutionSession,
    status: Phase2MockExecutionSession["status"],
    actualMinutes?: number,
    notes?: string | null,
    capOutcome?: Phase2MockExecutionSession["cap_outcome"],
  ): Promise<SessionSaveResult> {
    if (status === "paused" || status === "running") {
      return "not-an-outcome";
    }

    const outcome = recordableOutcomeForStatus(status);
    if (!outcome) {
      return "not-an-outcome";
    }

    if (!localSession.task_id) {
      // Nothing to file the session against. Truthful, and the caller must
      // not claim a save.
      markLocalOnly(
        savedOnThisDeviceAndSendingBanner("Your focus session result"),
      );
      return "local-only";
    }

    const persistedTaskId = persistedIdForLocalId(
      localSession.task_id,
      persistedTaskIdByLocalIdRef.current,
    );
    const persistedBlockId = localSession.calendar_block_id
      ? persistedIdForLocalId(
          localSession.calendar_block_id,
          persistedBlockIdByLocalIdRef.current,
        )
      : null;

    let journalled;
    try {
      journalled = await journalExecutionSessionWrite({
        workflowTaskId: localSession.task_id,
        persistedTaskId,
        workflowBlockId: localSession.calendar_block_id,
        persistedBlockId,
        outcome,
        actualMinutes: actualMinutes ?? localSession.actual_minutes ?? 0,
        pausedMinutes: localSession.paused_minutes ?? 0,
        distractionMinutes: localSession.distraction_minutes ?? 0,
        productivityRating: status === "completed" ? 4 : 1,
        notes:
          notes !== undefined
            ? notes
            : status === "stuck"
              ? "Need a smaller next step."
              : null,
        capOutcome: capOutcome ?? null,
        deferTask: false,
      });
    } catch {
      // The device itself refused to hold it. Nothing has the outcome, and
      // the banner must name that cause rather than blaming the account.
      markDeviceStorageBlocked();
      return "device-blocked";
    }

    try {
      await replayJournaledWrites();
    } catch {
      // Best-effort: the outcome stays journalled and the next replay retries.
    }

    if (await hasPendingWrite(journalled.client_write_id)) {
      markLocalOnly(
        savedOnThisDeviceAndSendingBanner("Your focus session result"),
      );
      return "local-only";
    }

    const client = createSupabaseBrowserClient();
    if (client) await syncPersistedWorkflowRows(client);
    return "persisted";
  }

  // #613: atomic cap-DEFER — the session outcome AND the task deferral commit
  // as ONE transaction, so the pair can never half-land. Under #737 C1 the
  // session has no row yet at this point, so the atomic call is
  // `record_execution_session(..., p_defer_task => true)` rather than
  // `apply_execution_session_defer`; the guarantee is identical and the
  // journal adds device durability the old path never had.
  async function persistDeferredTaskWithSession(
    localSession: Phase2MockExecutionSession | undefined,
    localTaskId: string,
    actualMinutes: number,
    notes: string | null,
  ): Promise<"persisted" | "local-only"> {
    const persistedTaskId = persistedIdForLocalId(
      localTaskId,
      persistedTaskIdByLocalIdRef.current,
    );
    const persistedBlockId = localSession?.calendar_block_id
      ? persistedIdForLocalId(
          localSession.calendar_block_id,
          persistedBlockIdByLocalIdRef.current,
        )
      : null;

    let journalled;
    try {
      journalled = await journalExecutionSessionWrite({
        workflowTaskId: localTaskId,
        persistedTaskId,
        workflowBlockId: localSession?.calendar_block_id ?? null,
        persistedBlockId,
        outcome: "blocked",
        actualMinutes: actualMinutes ?? localSession?.actual_minutes ?? 0,
        pausedMinutes: localSession?.paused_minutes ?? 0,
        distractionMinutes: localSession?.distraction_minutes ?? 0,
        productivityRating: 1,
        notes: notes ?? "Need a smaller next step.",
        capOutcome: "deferred",
        deferTask: true,
      });
    } catch {
      markDeviceStorageBlocked();
      return "local-only";
    }

    try {
      await replayJournaledWrites();
    } catch {
      // Best-effort: the deferral stays journalled and the next replay retries.
    }

    if (await hasPendingWrite(journalled.client_write_id)) {
      markLocalOnly(savedOnThisDeviceAndSendingBanner("Your deferral"));
      return "local-only";
    }

    const client = createSupabaseBrowserClient();
    if (client) await syncPersistedWorkflowRows(client);
    return "persisted";
  }

  return {
    persistCapture,
    persistAcceptedTaskDraft,
    persistPlannedTask,
    persistCreatedLocalProposal,
    persistEditedLocalProposal,
    persistRejectedLocalProposal,
    persistAcceptedLocalProposal,
    persistUnplannedBlock,
    persistDroppedTask,
    persistTaskReviewTransition,
    persistReviewEntry,
    persistStartedSession,
    persistMarkedSession,
    persistDeferredTaskWithSession,
  };
}

export type PersistenceSyncOps = ReturnType<typeof createPersistenceSync>;
