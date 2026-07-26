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
  acceptTimeBlockProposal,
  applyTaskReviewTransition,
  createCaptureItem,
  createReviewEntry,
  createTask,
  createTimeBlockProposal,
  editTimeBlockProposal,
  findOrCreatePerson,
  recordPersonLinkAcceptance,
  rejectTimeBlockProposal,
  resolveCaptureItems,
  supersedePendingTimeBlockProposalsForTask,
  unplanCalendarBlock,
  type MinimalSupabaseClient,
  type ReviewTaskTargetStatus,
} from "../data/workflow";
import { normalizePersonName } from "../data/personLinks";
import {
  hasPendingWrite,
  journalExecutionSessionWrite,
  journalReviewWrite,
} from "../durability/durableWrites";
import { savedOnThisDeviceBanner } from "../statusVocabulary";
import { createSupabaseBrowserClient } from "../supabase/browser";
import type {
  Phase2MockCalendarBlock,
  Phase2MockExecutionSession,
  Phase2MockTask,
} from "../types";
import type { WorkflowState } from "../workflow";
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

    persistedCaptureIdByLocalIdRef.current.set(
      localCapture.id,
      result.capture.id,
    );
    await syncPersistedWorkflowRows(client);
  }

  async function persistAcceptedTaskDraft(
    draft: Phase2TaskDraft,
    localTask: Phase2MockTask,
    localProposal: Phase2TimeBlockProposal | null,
    status: "active" | "backlog",
  ) {
    const client = createSupabaseBrowserClient();
    const persistedAreaId = persistedAreaIdForWorkflowId(
      draft.area_id,
      persistedAreasRef.current,
    );

    if (!client || !persistedAreaId) {
      markLocalOnly(savedOnThisDeviceBanner("Your triage decision"));
      return;
    }

    const sourceCaptureId = persistedIdForLocalId(
      draft.capture_item_id,
      persistedCaptureIdByLocalIdRef.current,
    );

    // S3 (#255): resolve the approved person links before the task insert (FK
    // ordering). A mention that survived to accept was not rejected, so it is
    // user-approved. For each such mention we find-or-create the person
    // (idempotent per normalized_name, re-checked at accept time), then write the
    // link column for its role. Multiple mentions of one role map to a single
    // column, so the first resolved id wins deterministically. role "mention" is
    // informational — it creates the person but links no column. A find/create
    // failure degrades that one link to no-link; the task still lands (NS-INV-4).
    const acceptTime = new Date().toISOString();
    let waitingOnPersonId: string | null = null;
    let committedToPersonId: string | null = null;
    const acceptedLinks: Array<{
      name: string;
      role: "waiting_on" | "committed_to" | "mention";
      personId: string | null;
    }> = [];

    for (const mention of draft.person_mentions) {
      // role "mention" is informational only (deliverable b): it links no column
      // and creates no person row — approval to create a person (FR-017) comes
      // only with a waiting_on / committed_to link. Its pending suggestion is
      // still resolved to accepted below.
      let personId: string | null = null;
      if (mention.role === "waiting_on" || mention.role === "committed_to") {
        try {
          const personResult = await findOrCreatePerson(client, {
            display_name: mention.name,
            normalized_name: normalizePersonName(mention.name),
          });
          personId = personResult.person?.id ?? null;
        } catch {
          // A person find/create failure degrades this link to no-link; never
          // block the task creation the user just approved.
          personId = null;
        }
      }

      if (personId) {
        if (mention.role === "waiting_on" && !waitingOnPersonId) {
          waitingOnPersonId = personId;
        } else if (mention.role === "committed_to" && !committedToPersonId) {
          committedToPersonId = personId;
        }
      }

      acceptedLinks.push({ name: mention.name, role: mention.role, personId });
    }

    // committed_to link OR an approved commitment draft flag both set the task as
    // a commitment (deliverable b honors draft.is_commitment without a person).
    const isCommitment = draft.is_commitment || committedToPersonId !== null;

    const taskResult = await createTask(client, {
      area_id: persistedAreaId,
      source_capture_item_id: sourceCaptureId,
      title: draft.title,
      description: draft.description,
      status,
      priority_confidence: draft.confidence,
      task_type: draft.task_type ?? "task",
      is_reversible:
        draft.task_type === "decision" ? (draft.is_reversible ?? null) : null,
      due_at: draft.due_at ?? null,
      estimated_minutes_low: draft.estimated_minutes_low,
      estimated_minutes_high: draft.estimated_minutes_high,
      first_tiny_step: draft.first_tiny_step,
      waiting_on_person_id: waitingOnPersonId,
      waiting_on_since: waitingOnPersonId ? acceptTime : null,
      is_commitment: isCommitment,
      committed_to_person_id: committedToPersonId,
    });

    if (taskResult.provider !== "supabase") {
      return;
    }

    // Resolve the pending person-link proposals to accepted (mirrors the
    // rejection path). Fire-and-forget — a learning-write failure never affects
    // the accept flow (NS-INV-3).
    for (const link of acceptedLinks) {
      recordPersonLinkAcceptance(client, {
        area_id: persistedAreaId,
        draft_id: draft.id,
        name: link.name,
        role: link.role,
        matched_person_id: link.personId,
      });
    }

    persistedTaskIdByLocalIdRef.current.set(localTask.id, taskResult.task.id);

    if (localProposal && status === "active") {
      const proposalResult = await createTimeBlockProposal(client, {
        task_id: taskResult.task.id,
        proposed_start: localProposal.proposed_start,
        proposed_end: localProposal.proposed_end,
        rationale_note: localProposal.rationale,
      });
      if (proposalResult.provider === "supabase") {
        persistedProposalIdByLocalIdRef.current.set(
          localProposal.id,
          proposalResult.proposal.id,
        );
      }
    }

    // Final UX Loop C1, Target Card 1 (audit P0#3): the local reducer already
    // moved this capture to "resolved" (lib/workflow/triage.ts). Mirror that to
    // the account, or the next session rehydrates the thought from Supabase at
    // status "new" and offers back work the user already decided.
    //
    // Ordered after the task (and its proposal) on purpose: the task is what
    // MAKES the capture resolved, so a failed insert must leave the capture
    // waiting rather than resolve a thought that produced nothing.
    //
    // NOT wrapped in try/catch — unlike the person-link writes above, which are
    // documented best-effort (NS-INV-4), a status write that fails silently is
    // exactly the bug this fixes. It propagates to `markPersistedSaveFailure`
    // in `acceptTaskDraftWithPersistence`, the house way to say a save did not
    // land. A null `sourceCaptureId` (capture never reached the account) is a
    // no-op, not an error.
    await resolveCaptureItems(client, [sourceCaptureId]);

    await syncPersistedWorkflowRows(client);
  }

  async function persistPlannedTask(
    localTaskId: string,
    localProposal: Phase2TimeBlockProposal,
    localBlock: Phase2MockCalendarBlock,
  ) {
    const client = createSupabaseBrowserClient();
    const persistedTaskId = persistedIdForLocalId(
      localTaskId,
      persistedTaskIdByLocalIdRef.current,
    );

    if (!client || !persistedTaskId) {
      markLocalOnly(savedOnThisDeviceBanner("Your plan"));
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

    persistedProposalIdByLocalIdRef.current.set(
      localProposal.id,
      proposalResult.proposal.id,
    );

    const acceptResult = await acceptTimeBlockProposal(
      client,
      proposalResult.proposal.id,
    );
    if (acceptResult.provider === "supabase") {
      persistedBlockIdByLocalIdRef.current.set(
        localBlock.id,
        acceptResult.block.id,
      );
    }

    // #580: mirror the local supersede-on-place transition so a later sync
    // cannot resurrect a pending proposal for the task just placed. Runs
    // after the accept RPC, so the accepted proposal is already settled.
    await supersedePendingTimeBlockProposalsForTask(client, persistedTaskId);

    await syncPersistedWorkflowRows(client);
  }

  async function persistCreatedLocalProposal(
    localProposal: Phase2TimeBlockProposal,
  ) {
    const client = createSupabaseBrowserClient();
    const persistedTaskId = persistedIdForLocalId(
      localProposal.task_id,
      persistedTaskIdByLocalIdRef.current,
    );

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

    persistedProposalIdByLocalIdRef.current.set(
      localProposal.id,
      proposalResult.proposal.id,
    );

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

  async function persistAcceptedLocalProposal(
    localProposal: Phase2TimeBlockProposal,
    localBlock: Phase2MockCalendarBlock | null,
  ) {
    const client = createSupabaseBrowserClient();
    let persistedProposalId = persistedIdForLocalId(
      localProposal.id,
      persistedProposalIdByLocalIdRef.current,
    );

    if (!client) {
      markLocalOnly(savedOnThisDeviceBanner("Your accepted proposal"));
      return;
    }

    if (!persistedProposalId) {
      const persistedTaskId = persistedIdForLocalId(
        localProposal.task_id,
        persistedTaskIdByLocalIdRef.current,
      );

      if (!persistedTaskId) {
        markLocalOnly(savedOnThisDeviceBanner("Your accepted proposal"));
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
      persistedProposalId = proposalResult.proposal.id;
      persistedProposalIdByLocalIdRef.current.set(
        localProposal.id,
        proposalResult.proposal.id,
      );
    }

    const acceptResult = await acceptTimeBlockProposal(
      client,
      persistedProposalId,
    );
    if (acceptResult.provider === "supabase" && localBlock) {
      persistedBlockIdByLocalIdRef.current.set(
        localBlock.id,
        acceptResult.block.id,
      );
    }

    // #580: mirror the local supersede-on-place transition (accept = place)
    // so sibling pending proposal rows for the task cannot come back as
    // active on the next sync. Runs after the accept RPC settles this one.
    const persistedTaskIdForSupersede = persistedIdForLocalId(
      localProposal.task_id,
      persistedTaskIdByLocalIdRef.current,
    );
    if (persistedTaskIdForSupersede) {
      await supersedePendingTimeBlockProposalsForTask(
        client,
        persistedTaskIdForSupersede,
      );
    }

    await syncPersistedWorkflowRows(client);
  }

  async function persistUnplannedBlock(localBlockId: string) {
    const client = createSupabaseBrowserClient();
    const persistedBlockId = persistedIdForLocalId(
      localBlockId,
      persistedBlockIdByLocalIdRef.current,
    );

    if (!client || !persistedBlockId) {
      markLocalOnly(savedOnThisDeviceBanner("Your plan change"));
      return;
    }

    await unplanCalendarBlock(client, persistedBlockId);
    await syncPersistedWorkflowRows(client);
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
  ): Promise<"persisted" | "local-only" | "device-blocked"> {
    const persistedAreaId = selectedAreaId
      ? persistedAreaIdForWorkflowId(selectedAreaId, persistedAreasRef.current)
      : null;

    // Pinned at save time: replay may not run until a later day, and a review
    // must stay filed under the day it closed.
    const today = new Date().toISOString().slice(0, 10);

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
      markLocalOnly(savedOnThisDeviceBanner("Your review"));
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
      markLocalOnly(savedOnThisDeviceBanner("Your focus session result"));
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
      markLocalOnly(savedOnThisDeviceBanner("Your focus session result"));
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
      markLocalOnly(savedOnThisDeviceBanner("Your deferral"));
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
    persistTaskReviewTransition,
    persistReviewEntry,
    persistStartedSession,
    persistMarkedSession,
    persistDeferredTaskWithSession,
  };
}

export type PersistenceSyncOps = ReturnType<typeof createPersistenceSync>;
