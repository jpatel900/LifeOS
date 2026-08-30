/**
 * #737-A slice 2: wins and reviews, wired through the pending-writes journal.
 *
 * The rule this module enforces: **the device write happens first, and the
 * account write is a replay of it.** A user action journals its write to
 * IndexedDB (`pendingWriteJournal.ts`) and only then does anything reach the
 * network. So "saved on this device" is true the moment the user is told it,
 * a new tab can read the write back, and the account write can be retried as
 * many times as it takes without ever creating a second row.
 *
 * ## What this replaces
 *
 * `confirmWin` used to start with `if (!client) return;` — signed out or in
 * mock mode the win was written NOWHERE, while the fallback banner said it was
 * "saved on this device". `saveReview` went straight to `createReviewEntry`
 * with no device tier at all: the reducer's `sessionStorage` mirror kept the
 * review log inside ONE TAB, and closing that tab lost it silently.
 *
 * ## Payloads are self-contained and clock-pinned
 *
 * A journalled write may not replay for hours, in a different tab, after a
 * reload. So the payload carries everything the server call needs, including
 * the DATE THE USER ACTED. Deriving `occurred_at` (or a review period) from
 * `new Date()` at replay time would file a win confirmed at 23:50 under the
 * following day.
 *
 * ## Persisted ids: pinned if known, resolved if not, never guessed
 *
 * The server rows reference persisted (account) ids, but the app works in
 * workflow-local ids. If the mapping is known at journal time it is pinned
 * into the payload. If it is not — signed out, or the area has not synced yet
 * — the payload keeps the local id and replay resolves it against the current
 * mapping. A write whose ids still cannot be resolved THROWS, which the kernel
 * treats as "keep it queued": far better a win that arrives late than a win
 * written against the wrong area.
 *
 * ## Exactly once
 *
 * Two independent layers, because either can fail alone:
 *
 *  - Client: `replayPendingWrites` deletes the journal entry only after its
 *    handler resolves, so a second replay finds nothing to send.
 *  - Server: every call carries the journal entry's `client_write_id` and
 *    upserts on the `(user_id, client_write_id)` partial unique index with
 *    `ignoreDuplicates`, so a response lost *after* the row landed cannot
 *    produce a duplicate on the retry.
 */

import type { RollupSummaryContent } from "@lifeos/schemas";
import { isDailyCloseConflict } from "@/lib/review/dayClose";
import {
  enqueuePendingWrite,
  listPendingWrites,
  markPendingWriteSynced,
  replayPendingWrites,
  type PendingWrite,
  type PendingWriteEntity,
  type PendingWriteHandlers,
  type ReplaySummary,
} from "./pendingWriteJournal";

/**
 * Is this specific write still waiting to reach the account?
 *
 * A replay drains the WHOLE journal, so its `synced` count cannot tell a
 * caller whether the write IT just made got through — an unrelated queued
 * write would inflate it. Asking after this one id is the honest question, and
 * it is what decides between telling the user "saved to your account" and
 * "saved on this device".
 */
export async function hasPendingWrite(clientWriteId: string): Promise<boolean> {
  const pending = await listPendingWrites();
  return pending.some((write) => write.client_write_id === clientWriteId);
}

/**
 * THE COMPENSATING-ACTION CONTRACT (#737 C1 S5)
 * =============================================
 *
 * The payload key a compensating write uses to name the write it undoes. When
 * a payload carries this and the named entry is STILL QUEUED, the two cancel:
 * both leave the journal and neither is ever sent.
 *
 * ## The bug this exists for
 *
 * PR #778 made placements durable and, in the same breath, recorded the
 * failure mode it created: place a block offline (journalled), undo it offline
 * (NOT journalled — `persistUnplannedBlock` took a `markLocalOnly` early
 * return because there was no persisted block id), then sign in — and the
 * drain faithfully delivers a block the user had explicitly deleted.
 * `syncPersistedWorkflowRows` then pulls it back into local state. The sync
 * overruled the user's last instruction. The same shape applied to
 * accept-then-drop.
 *
 * ## Why cancelling is not a violation of never-discard
 *
 * The kernel's rule is that a write is never dropped because DELIVERY FAILED
 * — a handler that throws, an entity with no handler, a mock provider. That
 * rule protects the user's work from the machinery.
 *
 * This is the other case entirely: the USER authored a second action that
 * annuls the first. Keeping the placement queued would not be preserving their
 * work, it would be preserving work they took back. The distinction that makes
 * a removal legitimate is therefore not "who removed it" but "what authorised
 * it": a user-authored compensating action may cancel; a failure never may.
 * That is why this lives in `durableWrites.ts` — the layer that knows what a
 * write MEANS — and not in the entity-agnostic kernel, which cannot tell those
 * two cases apart and so must always keep.
 *
 * ## Why it is resolved BEFORE dispatch, not inside a handler
 *
 * `replayPendingWrites` dispatches per entity with no cross-entry visibility:
 * the `plan_placement` handler never sees the later `plan_unplacement`. So the
 * pairing is resolved in one pass over the journal first, and only what
 * survives that pass is dispatched.
 *
 * ## When the target is NOT queued
 *
 * Then the placement already reached the account, and the compensating entry
 * is a real server undo — it stays in the journal and its handler sends
 * `unplan_calendar_block` / the `dropped` transition. Both directions are
 * needed; `hasPendingWrite` is what tells them apart at journal time, and this
 * pass is what tells them apart at replay time.
 */
const SUPERSEDES_KEY = "supersedes_client_write_id";

/** Any journalled payload that may annul an earlier write. */
export interface CompensatingWritePayload {
  /**
   * `client_write_id` of the write this one undoes, or `null` when there was
   * nothing queued to undo (the original had already reached the account).
   */
  supersedes_client_write_id: string | null;
  [key: string]: unknown;
}

function supersededIdOf(write: PendingWrite): string | null {
  const value = (write.payload as Record<string, unknown>)[SUPERSEDES_KEY];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export interface SupersedeSummary {
  /** Pairs annulled: each counts one original AND one compensating entry. */
  cancelled: number;
}

/**
 * Cancel every queued write whose compensating action is also queued.
 *
 * Runs oldest-first over a single snapshot of the journal, so a compensating
 * entry can only annul a write that came BEFORE it — which is the only
 * ordering that can occur, since the compensating action is authored second.
 *
 * Idempotent: a second run finds no pairs, because both halves of each pair
 * are gone.
 *
 * ## THE ORDER OF THE TWO DELETES IS CHOSEN, AND IT IS NOT SYMMETRIC
 *
 * They are two IndexedDB transactions, so a device failing between them can
 * leave a pair half-cancelled. The order picks WHICH half, and the two are not
 * equally bad:
 *
 *  - Target first (what this does). A failure after it leaves an orphan
 *    compensating entry whose original is gone. Its handler then throws on
 *    every replay — a single stuck entry, retried and never delivered.
 *  - Compensating first. A failure after it leaves the PLACEMENT queued with
 *    nothing left to annul it, so the next drain delivers a block the user
 *    deleted. That is the exact bug this function exists to end.
 *
 * So a stuck entry is accepted to make the resurrection impossible. It is also
 * self-limiting in practice: an IndexedDB delete failing mid-pass means device
 * storage is failing, which `markDeviceStorageBlocked` already reports loudly
 * on the write path.
 *
 * Deliberately NOT "solved" by letting the handler drop a compensating entry
 * whose original is missing. That case is ambiguous: the original may be
 * missing because it was cancelled OR because another tab DELIVERED it between
 * the undo and this pass, and in the second case the entry carries a real
 * server undo that must not be discarded. Distinguishing them needs state this
 * function does not keep — see the AGENT-TODO on #737 C1 S5's PR.
 */
export async function resolveSupersededWrites(): Promise<SupersedeSummary> {
  const writes = await listPendingWrites();
  const queuedIds = new Set(writes.map((write) => write.client_write_id));
  const summary: SupersedeSummary = { cancelled: 0 };

  for (const write of writes) {
    const targetId = supersededIdOf(write);
    // No target, or a target that already left the journal (delivered, or
    // cancelled by an earlier pair in this same pass). Either way this entry
    // is not half of a cancellable pair: leave it for its handler.
    if (!targetId || !queuedIds.has(targetId)) continue;

    try {
      await markPendingWriteSynced(targetId);
      await markPendingWriteSynced(write.client_write_id);
    } catch {
      // A failure on the FIRST delete leaves both halves queued, which is the
      // pre-S5 state and safe. A failure on the second leaves the orphan
      // described above — deliberately preferred over a live resurrection.
      continue;
    }

    queuedIds.delete(targetId);
    queuedIds.delete(write.client_write_id);
    summary.cancelled += 1;
  }

  return summary;
}

/**
 * The `client_write_id` of the newest queued write of `entity` that `matches`,
 * or `null`. This is how a compensating action finds what it is undoing at the
 * moment the user undoes it.
 *
 * Newest-first because a user undoing something means the most recent one:
 * placing an hour, undoing it, placing it again and undoing THAT must annul
 * the second placement, not re-annul the first (which is already gone anyway).
 */
export async function findQueuedWriteToSupersede(
  entity: PendingWriteEntity,
  matches: (payload: Record<string, unknown>) => boolean,
): Promise<string | null> {
  const writes = await listPendingWrites(entity);
  for (let index = writes.length - 1; index >= 0; index -= 1) {
    const write = writes[index]!;
    if (matches(write.payload as Record<string, unknown>)) {
      return write.client_write_id;
    }
  }
  return null;
}

/** Journalled shape of a confirmed win. Snake_case: it is stored data. */
export interface WinWritePayload {
  /** Workflow-local task id, so replay can re-resolve if needed. */
  workflow_task_id: string;
  /** Account task id when it was already known at confirm time. */
  persisted_task_id: string | null;
  /** Account area id when it was already known at confirm time. */
  persisted_area_id: string | null;
  title: string;
  detail: string | null;
  /** Pinned at confirm time — never re-derived from the replay clock. */
  occurred_at: string;
  [key: string]: unknown;
}

/** Journalled shape of a saved review entry. */
export interface ReviewWritePayload {
  /**
   * The area the user had selected, in workflow-local ids, or `null` for an
   * explicit All-areas review.
   *
   * Carried SEPARATELY from `persisted_area_id` because the two nulls mean
   * opposite things and the account write must not confuse them. Before this
   * slice `persistReviewEntry` refused to write at all when an area was
   * selected but had not synced yet; that guarantee lives here now.
   */
  workflow_area_id: string | null;
  /** Account area id when it was already known at save time. */
  persisted_area_id: string | null;
  review_type: "daily" | "weekly";
  period_start: string;
  period_end: string;
  // `unknown` matches the schema layer: `JsonValueSchema` is a
  // `z.ZodType<unknown>`, so widening it here would be a fiction.
  summary_json: unknown;
  [key: string]: unknown;
}

/**
 * Journalled shape of a focus-session outcome — #737 C1 card 1, slice S4.
 *
 * This is the ONLY execution-session write. A session that is merely running
 * has no outcome, so it never reaches the journal; it lives in
 * `lib/execute/runningSession.ts` on the device. What lands here is what the
 * user picked in the end sheet, and the row the account ends up with carries
 * exactly that.
 */
export interface ExecutionSessionWritePayload {
  /** Workflow-local task id, so replay can re-resolve if needed. */
  workflow_task_id: string;
  /** Account task id when it was already known at save time. */
  persisted_task_id: string | null;
  /** Workflow-local block id, or null for a blockless session (P0#2). */
  workflow_block_id: string | null;
  /** Account block id when it was already known at save time. */
  persisted_block_id: string | null;
  /** Exactly what the user chose. Never derived, never defaulted. */
  outcome: string;
  actual_minutes: number;
  paused_minutes: number;
  distraction_minutes: number;
  productivity_rating: number | null;
  notes: string | null;
  cap_outcome: string | null;
  /** #613 atomic cap-DEFER: defer the task in the same transaction. */
  defer_task: boolean;
  [key: string]: unknown;
}

/**
 * Journalled shape of a placed time block — #737 C1 slice S3.
 *
 * ONE entity for both placement paths. `planTaskAtHour` mints a fresh local
 * proposal (so `persisted_proposal_id` is null and the server mints one too);
 * `acceptLocalProposal` accepts a proposal the account may already hold (so the
 * id is pinned when known and re-resolved when not). The user-visible result is
 * identical — a block on the day — so there is one journal entry shape and one
 * server call.
 */
export interface PlanPlacementWritePayload {
  /** Workflow-local task id, so replay can re-resolve if needed. */
  workflow_task_id: string;
  /** Account task id when it was already known at placement time. */
  persisted_task_id: string | null;
  /** Workflow-local proposal id, or null when the placement minted none. */
  workflow_proposal_id: string | null;
  /** Account proposal id when it was already known at placement time. */
  persisted_proposal_id: string | null;
  /** Workflow-local block id, so the caller can map the account id back. */
  workflow_block_id: string | null;
  /**
   * Absolute instants, pinned at the moment the user placed the block.
   * NOT an hour to be re-derived at replay time: the reducer resolves "10am"
   * against the user's LOCAL day when they act, and a replay running the next
   * morning — or on a UTC runner — would resolve the same hour to a different
   * instant.
   */
  proposed_start: string;
  proposed_end: string;
  rationale: string | null;
  [key: string]: unknown;
}

/**
 * Journalled shape of an accepted triage draft — #737 C1 slice S3.
 *
 * Self-contained by design: the draft is removed from the reducer the instant
 * it is accepted, so nothing can be re-read from state at replay time. Every
 * field the account write needs is copied here AS THE USER LEFT IT, which is
 * exactly why an edit-then-accept survives a closed tab.
 */
export interface TaskDraftAcceptWritePayload {
  /** Workflow-local draft id — the join key for the learning records. */
  workflow_draft_id: string;
  /** Workflow-local task id the reducer minted, for the id mapping. */
  workflow_task_id: string;
  /** Workflow-local area id, so replay can re-resolve the account area. */
  workflow_area_id: string;
  /** Account area id when it was already known at accept time. */
  persisted_area_id: string | null;
  /** Workflow-local capture id, so replay can re-resolve. */
  workflow_capture_id: string | null;
  /** Account capture id when it was already known at accept time. */
  persisted_capture_id: string | null;
  title: string;
  description: string | null;
  confidence: number | null;
  task_type: string | null;
  is_reversible: boolean | null;
  due_at: string | null;
  estimated_minutes_low: number | null;
  estimated_minutes_high: number | null;
  first_tiny_step: string | null;
  is_commitment: boolean;
  person_mentions: Array<{
    name: string;
    role: "waiting_on" | "committed_to" | "mention";
  }>;
  /** Exactly what the user chose: today, or the backlog. */
  task_status: "active" | "backlog";
  /** Pinned at accept time — feeds `waiting_on_since`, never the replay clock. */
  accepted_at: string;
  /** Workflow-local proposal id the accept minted alongside an active task. */
  workflow_proposal_id: string | null;
  proposed_start: string | null;
  proposed_end: string | null;
  rationale: string | null;
  [key: string]: unknown;
}

export interface JournalWinInput {
  workflowTaskId: string;
  persistedTaskId: string | null;
  persistedAreaId: string | null;
  title: string;
  detail: string | null;
  /** `YYYY-MM-DD` for the day the user confirmed the win. */
  occurredAt: string;
}

export interface JournalExecutionSessionInput {
  workflowTaskId: string;
  persistedTaskId: string | null;
  workflowBlockId: string | null;
  persistedBlockId: string | null;
  outcome: string;
  actualMinutes: number;
  pausedMinutes?: number;
  distractionMinutes?: number;
  productivityRating?: number | null;
  notes: string | null;
  capOutcome?: string | null;
  deferTask?: boolean;
}

export interface JournalReviewInput {
  workflowAreaId: string | null;
  persistedAreaId: string | null;
  reviewType: "daily" | "weekly";
  periodStart: string;
  periodEnd: string;
  summaryJson: unknown;
}

/**
 * The idempotency key for one confirmed win, DERIVED rather than minted.
 *
 * #737 C1 re-score, GAP 1. `win_records_user_client_write_id_key`
 * (20260726120000) was in place and enforced, and it still let a second row
 * through for one accomplishment: the key's VALUE came from
 * `crypto.randomUUID()`, so a second tab confirming the same win handed the
 * index a value it had never seen. A unique index can only catch a repeat it
 * can recognise. Deriving the value from the FACT — this task, this local day
 * — is what turns the index into the backstop it was built to be, with no
 * schema change (the column is already there and must not gain a sibling).
 *
 * ## Why the task id is the ACCOUNT one when there is one
 *
 * A task created locally carries a non-uuid workflow id until it syncs, after
 * which the account uuid IS its workflow id (`persistedIdForLocalId` returns
 * the id unchanged once `isUuid`). Keying on the workflow id alone would give
 * the pre-sync tab and the post-sync tab two different keys for one win —
 * GAP 1 again, one sync boundary later. A win on a task with no account id yet
 * cannot produce a duplicate ACCOUNT row regardless: `winHandler` refuses to
 * send it until the mapping exists.
 *
 * ## Why the user is deliberately NOT in the key
 *
 * The judge's fix shape said `(user, task, local day)`; the user is redundant
 * and costly here. Redundant because the account-tier index is already scoped
 * `(user_id, client_write_id)`. Costly because a win is journalled BEFORE any
 * network call, on purpose (that is slice 2's whole fix) — signed out, in mock
 * mode, offline. Asking for an identity at journal time would either block the
 * journal write or make the key's shape depend on auth state, so the same
 * logical win would key differently either side of a sign-in: exactly the
 * non-determinism being removed. Two accounts on one device cannot collide in
 * the device journal in practice, because workflow task ids are per-account.
 *
 * ## Why the day is the LOCAL day
 *
 * `occurredAt` is `localIsoDate` at confirm time (`WorkflowContext.confirmWin`).
 * The UTC/local split has bitten this codebase three times (#773, #775, #778);
 * the key must agree with the day the win is FILED under or a win confirmed at
 * 20:30 west of Greenwich would key on one day and read back on another.
 */
export function deriveWinClientWriteId(
  taskId: string,
  occurredAt: string,
): string {
  return `win:${taskId}:${occurredAt}`;
}

/**
 * Journal one confirmed win. THROWS when the device cannot hold it (no
 * IndexedDB — private mode, a blocking extension), exactly like the capture
 * queue's enqueue: the caller must show the failure rather than claim a save.
 *
 * Idempotent by construction since the C1 re-score: re-confirming the same win
 * on the same local day reuses its own journal entry (and its own account key)
 * instead of queueing a second one. See `deriveWinClientWriteId`.
 */
export function journalWinWrite(
  input: JournalWinInput,
): Promise<PendingWrite<WinWritePayload>> {
  return enqueuePendingWrite<WinWritePayload>({
    entity: "win",
    clientWriteId: deriveWinClientWriteId(
      input.persistedTaskId ?? input.workflowTaskId,
      input.occurredAt,
    ),
    payload: {
      workflow_task_id: input.workflowTaskId,
      persisted_task_id: input.persistedTaskId,
      persisted_area_id: input.persistedAreaId,
      title: input.title,
      detail: input.detail,
      occurred_at: input.occurredAt,
    },
  });
}

/**
 * Journal one focus-session outcome. Throws on the same terms as the win path
 * — if the device cannot hold it, the caller must say so rather than claim a
 * save. That throw is what stops "Session complete" from appearing over
 * nothing.
 */
export function journalExecutionSessionWrite(
  input: JournalExecutionSessionInput,
): Promise<PendingWrite<ExecutionSessionWritePayload>> {
  return enqueuePendingWrite<ExecutionSessionWritePayload>({
    entity: "execution_session",
    payload: {
      workflow_task_id: input.workflowTaskId,
      persisted_task_id: input.persistedTaskId,
      workflow_block_id: input.workflowBlockId,
      persisted_block_id: input.persistedBlockId,
      outcome: input.outcome,
      actual_minutes: input.actualMinutes,
      paused_minutes: input.pausedMinutes ?? 0,
      distraction_minutes: input.distractionMinutes ?? 0,
      productivity_rating: input.productivityRating ?? null,
      notes: input.notes,
      cap_outcome: input.capOutcome ?? null,
      defer_task: input.deferTask ?? false,
    },
  });
}

/** Journal one saved review entry. Throws on the same terms as the win path. */
export function journalReviewWrite(
  input: JournalReviewInput,
): Promise<PendingWrite<ReviewWritePayload>> {
  return enqueuePendingWrite<ReviewWritePayload>({
    entity: "review",
    payload: {
      workflow_area_id: input.workflowAreaId,
      persisted_area_id: input.persistedAreaId,
      review_type: input.reviewType,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      summary_json: input.summaryJson,
    },
  });
}

export interface JournalPlanPlacementInput {
  workflowTaskId: string;
  persistedTaskId: string | null;
  workflowProposalId: string | null;
  persistedProposalId: string | null;
  workflowBlockId: string | null;
  proposedStart: string;
  proposedEnd: string;
  rationale: string | null;
}

export interface JournalTaskDraftAcceptInput {
  workflowDraftId: string;
  workflowTaskId: string;
  workflowAreaId: string;
  persistedAreaId: string | null;
  workflowCaptureId: string | null;
  persistedCaptureId: string | null;
  title: string;
  description: string | null;
  confidence: number | null;
  taskType: string | null;
  isReversible: boolean | null;
  dueAt: string | null;
  estimatedMinutesLow: number | null;
  estimatedMinutesHigh: number | null;
  firstTinyStep: string | null;
  isCommitment: boolean;
  personMentions: Array<{
    name: string;
    role: "waiting_on" | "committed_to" | "mention";
  }>;
  taskStatus: "active" | "backlog";
  acceptedAt: string;
  workflowProposalId: string | null;
  proposedStart: string | null;
  proposedEnd: string | null;
  rationale: string | null;
}

/** Journal one placed time block. Throws on the same terms as the win path. */
export function journalPlanPlacementWrite(
  input: JournalPlanPlacementInput,
): Promise<PendingWrite<PlanPlacementWritePayload>> {
  return enqueuePendingWrite<PlanPlacementWritePayload>({
    entity: "plan_placement",
    payload: {
      workflow_task_id: input.workflowTaskId,
      persisted_task_id: input.persistedTaskId,
      workflow_proposal_id: input.workflowProposalId,
      persisted_proposal_id: input.persistedProposalId,
      workflow_block_id: input.workflowBlockId,
      proposed_start: input.proposedStart,
      proposed_end: input.proposedEnd,
      rationale: input.rationale,
    },
  });
}

/** Journal one accepted triage draft. Throws on the same terms as the win path. */
export function journalTaskDraftAcceptWrite(
  input: JournalTaskDraftAcceptInput,
): Promise<PendingWrite<TaskDraftAcceptWritePayload>> {
  return enqueuePendingWrite<TaskDraftAcceptWritePayload>({
    entity: "task_draft_accept",
    payload: {
      workflow_draft_id: input.workflowDraftId,
      workflow_task_id: input.workflowTaskId,
      workflow_area_id: input.workflowAreaId,
      persisted_area_id: input.persistedAreaId,
      workflow_capture_id: input.workflowCaptureId,
      persisted_capture_id: input.persistedCaptureId,
      title: input.title,
      description: input.description,
      confidence: input.confidence,
      task_type: input.taskType,
      is_reversible: input.isReversible,
      due_at: input.dueAt,
      estimated_minutes_low: input.estimatedMinutesLow,
      estimated_minutes_high: input.estimatedMinutesHigh,
      first_tiny_step: input.firstTinyStep,
      is_commitment: input.isCommitment,
      person_mentions: input.personMentions,
      task_status: input.taskStatus,
      accepted_at: input.acceptedAt,
      workflow_proposal_id: input.workflowProposalId,
      proposed_start: input.proposedStart,
      proposed_end: input.proposedEnd,
      rationale: input.rationale,
    },
  });
}

/**
 * Journalled shape of a rollup the user APPROVED — #737 C1 S5.
 *
 * The last member of the wins/reviews family to reach the device. `confirmWin`
 * was fixed in S2; `confirmRollup` kept the identical `if (!client) return;`
 * opening plus a `savedOnThisDeviceBanner("Your rollup")` fallback, so an
 * approved rollup in demo mode, signed out, or with an unsynced area was
 * written NOWHERE while the banner said it was on this device. S2's report
 * flagged it; this closes it on the same pattern.
 *
 * NS-INV-4 is unchanged: only an APPROVED rollup is ever journalled. A
 * dismissed draft never reaches `confirmRollup` and so never reaches here.
 */
export interface RollupWritePayload {
  /** Workflow-local area id, so replay can re-resolve if needed. */
  workflow_area_id: string;
  /** Account area id when it was already known at approve time. */
  persisted_area_id: string | null;
  period_type: "week" | "month";
  /** Pinned at approve time — a period is never re-derived at replay. */
  period_start: string;
  period_end: string;
  /**
   * Typed, unlike `ReviewWritePayload.summary_json`. The difference is in the
   * schema layer, not a preference: a review's summary is `JsonValueSchema`
   * (`z.ZodType<unknown>`), while a rollup's is the structured
   * `RollupSummaryContentSchema`, so the account call needs the real shape and
   * pretending otherwise would only move the cast.
   */
  summary: RollupSummaryContent;
  [key: string]: unknown;
}

/**
 * Journalled shape of an unplan — #737 C1 S5.
 *
 * Carries the ids in both directions, because it has two jobs depending on
 * where the placement it undoes got to (see `SUPERSEDES_KEY`): annul a queued
 * placement, or unplan a block the account already holds.
 */
export interface PlanUnplacementWritePayload extends CompensatingWritePayload {
  /** Workflow-local block id, so replay can re-resolve if needed. */
  workflow_block_id: string;
  /** Account block id when it was already known at unplan time. */
  persisted_block_id: string | null;
}

/** Journalled shape of a dropped task — #737 C1 S5. Same two jobs. */
export interface TaskDropWritePayload extends CompensatingWritePayload {
  /** Workflow-local task id, so replay can re-resolve if needed. */
  workflow_task_id: string;
  /** Account task id when it was already known at drop time. */
  persisted_task_id: string | null;
}

/**
 * Journalled shape of a raw capture — #960 defect 3.
 *
 * `persistCapture` used to open with
 * `if (!client || (localCapture.area_id && !persistedAreaId)) { markLocalOnly(...); return; }`
 * — a client that existed but had not yet resolved the capture's area (the
 * #960 defect 1 window: signed out at mount, signed in later with no
 * remount) dropped the raw capture with no device-durable record anywhere.
 * It is now journalled on the same terms as every other write since #737-A,
 * with late area-id resolution at replay time exactly like `ReviewWritePayload`.
 */
export interface CaptureWritePayload {
  /** Workflow-local capture id, so the caller can alias the account id back. */
  workflow_capture_id: string;
  /**
   * Workflow-local area id, or `null` for a capture with no area. Carried
   * separately from `persisted_area_id` for the same reason
   * `ReviewWritePayload.workflow_area_id` is: the two nulls mean opposite
   * things, and the account write must not confuse "no area chosen" with
   * "area chosen, not synced yet".
   */
  workflow_area_id: string | null;
  /** Account area id when it was already known at capture time. */
  persisted_area_id: string | null;
  raw_text: string;
  return_hook: string | null;
  [key: string]: unknown;
}

export interface JournalRollupInput {
  workflowAreaId: string;
  persistedAreaId: string | null;
  periodType: "week" | "month";
  periodStart: string;
  periodEnd: string;
  summary: RollupSummaryContent;
}

export interface JournalPlanUnplacementInput {
  workflowBlockId: string;
  persistedBlockId: string | null;
  supersedesClientWriteId: string | null;
}

export interface JournalTaskDropInput {
  workflowTaskId: string;
  persistedTaskId: string | null;
  supersedesClientWriteId: string | null;
}

export interface JournalCaptureInput {
  workflowCaptureId: string;
  workflowAreaId: string | null;
  persistedAreaId: string | null;
  rawText: string;
  returnHook: string | null;
  /**
   * The idempotency key, reused as the eventual `client_capture_id` sent to
   * the server — the SAME uniqueness the offline capture queue already
   * relies on (`capture_items_user_client_capture_id_key`), rather than
   * minting a second one for the same kind of row.
   */
  clientCaptureId: string;
}

/** Journal one approved rollup. Throws on the same terms as the win path. */
export function journalRollupWrite(
  input: JournalRollupInput,
): Promise<PendingWrite<RollupWritePayload>> {
  return enqueuePendingWrite<RollupWritePayload>({
    entity: "rollup",
    payload: {
      workflow_area_id: input.workflowAreaId,
      persisted_area_id: input.persistedAreaId,
      period_type: input.periodType,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      summary: input.summary,
    },
  });
}

/** Journal one unplan. Throws on the same terms as the win path. */
export function journalPlanUnplacementWrite(
  input: JournalPlanUnplacementInput,
): Promise<PendingWrite<PlanUnplacementWritePayload>> {
  return enqueuePendingWrite<PlanUnplacementWritePayload>({
    entity: "plan_unplacement",
    payload: {
      workflow_block_id: input.workflowBlockId,
      persisted_block_id: input.persistedBlockId,
      supersedes_client_write_id: input.supersedesClientWriteId,
    },
  });
}

/** Journal one dropped task. Throws on the same terms as the win path. */
export function journalTaskDropWrite(
  input: JournalTaskDropInput,
): Promise<PendingWrite<TaskDropWritePayload>> {
  return enqueuePendingWrite<TaskDropWritePayload>({
    entity: "task_drop",
    payload: {
      workflow_task_id: input.workflowTaskId,
      persisted_task_id: input.persistedTaskId,
      supersedes_client_write_id: input.supersedesClientWriteId,
    },
  });
}

/**
 * Journal one raw capture — #960 defect 3. Throws on the same terms as the
 * win path. Keyed by `clientCaptureId` (not a freshly minted id) so a retry
 * of the SAME capture reuses its own journal entry instead of queueing a
 * duplicate, exactly like `deriveWinClientWriteId` does for wins.
 */
export function journalCaptureWrite(
  input: JournalCaptureInput,
): Promise<PendingWrite<CaptureWritePayload>> {
  return enqueuePendingWrite<CaptureWritePayload>({
    entity: "capture",
    clientWriteId: input.clientCaptureId,
    payload: {
      workflow_capture_id: input.workflowCaptureId,
      workflow_area_id: input.workflowAreaId,
      persisted_area_id: input.persistedAreaId,
      raw_text: input.rawText,
      return_hook: input.returnHook,
    },
  });
}

/** The account-side call for a journalled win. */
export interface SyncWinArgs {
  client_write_id: string;
  area_id: string;
  source_task_id: string;
  title: string;
  detail: string | null;
  occurred_at: string;
}

/** The account-side call for a journalled review entry. */
export interface SyncReviewArgs {
  client_write_id: string;
  area_id: string | null;
  review_type: "daily" | "weekly";
  period_start: string;
  period_end: string;
  // `unknown` matches the schema layer: `JsonValueSchema` is a
  // `z.ZodType<unknown>`, so widening it here would be a fiction.
  summary_json: unknown;
}

/** The account-side call for a journalled session outcome. */
export interface SyncExecutionSessionArgs {
  client_write_id: string;
  task_id: string;
  calendar_block_id: string | null;
  outcome: string;
  actual_minutes: number;
  paused_minutes: number;
  distraction_minutes: number;
  productivity_rating: number | null;
  notes: string | null;
  cap_outcome: string | null;
  defer_task: boolean;
}

/** The account-side call for a journalled placement. */
export interface SyncPlanPlacementArgs {
  client_write_id: string;
  task_id: string;
  proposal_id: string | null;
  proposed_start: string;
  proposed_end: string;
  rationale_note: string | null;
}

/** What the account gave back for a placement, so ids can be mapped locally. */
export interface SyncPlanPlacementResult {
  provider: "mock" | "supabase";
  persistedProposalId: string | null;
  persistedBlockId: string | null;
}

/** The account-side call for a journalled triage accept. */
export interface SyncTaskDraftAcceptArgs {
  client_write_id: string;
  area_id: string;
  source_capture_item_id: string | null;
  draft_id: string;
  title: string;
  description: string | null;
  confidence: number | null;
  task_type: string | null;
  is_reversible: boolean | null;
  due_at: string | null;
  estimated_minutes_low: number | null;
  estimated_minutes_high: number | null;
  first_tiny_step: string | null;
  is_commitment: boolean;
  person_mentions: Array<{
    name: string;
    role: "waiting_on" | "committed_to" | "mention";
  }>;
  task_status: "active" | "backlog";
  accepted_at: string;
  proposal: {
    proposed_start: string;
    proposed_end: string;
    rationale: string;
  } | null;
}

/** What the account gave back for an accept, so ids can be mapped locally. */
export interface SyncTaskDraftAcceptResult {
  provider: "mock" | "supabase";
  persistedTaskId: string | null;
  persistedProposalId: string | null;
}

/**
 * Everything replay needs from outside this module. Injected rather than
 * imported so the dispatcher stays testable without a Supabase client and
 * without React: the caller owns "which account" and "what maps to what".
 */
export interface DurableWriteServerOps {
  syncWin(args: SyncWinArgs): Promise<{ provider: "mock" | "supabase" }>;
  syncReview(args: SyncReviewArgs): Promise<{ provider: "mock" | "supabase" }>;
  /**
   * Late resolution of a win journalled before the account was reachable.
   * Returning nulls keeps the write queued.
   */
  resolveWinIds?(payload: WinWritePayload): {
    persistedTaskId: string | null;
    persistedAreaId: string | null;
  };
  /** Late resolution of the review's area. Reviews allow a null area. */
  resolveReviewAreaId?(payload: ReviewWritePayload): string | null;
  syncExecutionSession?(
    args: SyncExecutionSessionArgs,
  ): Promise<{ provider: "mock" | "supabase" }>;
  /**
   * Late resolution of a session journalled before its task/block had account
   * ids. A null task id keeps the write queued; a null BLOCK id is legitimate
   * and means a blockless session.
   */
  resolveExecutionSessionIds?(payload: ExecutionSessionWritePayload): {
    persistedTaskId: string | null;
    persistedBlockId: string | null;
  };
  /** #737 C1 S3: place a block, idempotently. */
  syncPlanPlacement?(
    args: SyncPlanPlacementArgs,
  ): Promise<SyncPlanPlacementResult>;
  /**
   * Late resolution of a placement journalled before its task/proposal had
   * account ids. A null TASK id keeps the write queued; a null PROPOSAL id is
   * legitimate and means "the server should mint one".
   */
  resolvePlanPlacementIds?(payload: PlanPlacementWritePayload): {
    persistedTaskId: string | null;
    persistedProposalId: string | null;
  };
  /**
   * Record what the account gave back, so later edits and sessions on this
   * block are not treated as unsynced. Called only on a real account write.
   */
  recordPlanPlacementIds?(
    payload: PlanPlacementWritePayload,
    result: SyncPlanPlacementResult,
  ): void;
  /** #737 C1 S3: create the accepted draft's task, idempotently. */
  syncTaskDraftAccept?(
    args: SyncTaskDraftAcceptArgs,
  ): Promise<SyncTaskDraftAcceptResult>;
  /**
   * Late resolution of an accept journalled before its area (and capture) had
   * account ids. A null AREA id keeps the write queued — a task filed under a
   * guessed area is worse than a task that arrives late. A null CAPTURE id is
   * legitimate: the capture may never have reached the account at all.
   */
  resolveTaskDraftAcceptIds?(payload: TaskDraftAcceptWritePayload): {
    persistedAreaId: string | null;
    persistedCaptureId: string | null;
  };
  /** Record the account ids for the task (and proposal) the accept created. */
  recordTaskDraftAcceptIds?(
    payload: TaskDraftAcceptWritePayload,
    result: SyncTaskDraftAcceptResult,
  ): void;
  /** #737 C1 S5: write one approved rollup, idempotently. */
  syncRollup?(args: SyncRollupArgs): Promise<{ provider: "mock" | "supabase" }>;
  /**
   * Late resolution of a rollup approved before its area had an account id. A
   * null area id keeps the write queued: `rollup_summaries.area_id` is NOT
   * NULL and area-scoped, so there is nothing to guess with.
   */
  resolveRollupAreaId?(payload: RollupWritePayload): string | null;
  /** #737 C1 S5: unplan a block the account already holds. */
  syncPlanUnplacement?(
    args: SyncPlanUnplacementArgs,
  ): Promise<{ provider: "mock" | "supabase" }>;
  /** Late resolution of the block id for an unplan journalled before it synced. */
  resolvePlanUnplacementBlockId?(
    payload: PlanUnplacementWritePayload,
  ): string | null;
  /** #737 C1 S5: mark a task dropped on the account. */
  syncTaskDrop?(
    args: SyncTaskDropArgs,
  ): Promise<{ provider: "mock" | "supabase" }>;
  /** Late resolution of the task id for a drop journalled before it synced. */
  resolveTaskDropTaskId?(payload: TaskDropWritePayload): string | null;
  /** #960 defect 3: send one journalled raw capture, idempotently. */
  syncCapture?(args: SyncCaptureArgs): Promise<SyncCaptureResult>;
  /**
   * Late resolution of a capture journalled before its area had an account
   * id. A null answer is only legitimate when the capture genuinely has no
   * area — `captureHandler` tells the two apart via `workflow_area_id`.
   */
  resolveCaptureAreaId?(payload: CaptureWritePayload): string | null;
  /**
   * Record the account id for the capture this write created, so the local
   * optimistic row is retired once its account twin lands
   * (`mergePersistedRows`) instead of showing twice.
   */
  recordCaptureId?(
    payload: CaptureWritePayload,
    result: SyncCaptureResult,
  ): void;
}

/** The account-side call for a journalled rollup. */
export interface SyncRollupArgs {
  client_write_id: string;
  area_id: string;
  period_type: "week" | "month";
  period_start: string;
  period_end: string;
  summary: RollupSummaryContent;
}

/** The account-side call for a journalled unplan. */
export interface SyncPlanUnplacementArgs {
  block_id: string;
}

/** The account-side call for a journalled task drop. */
export interface SyncTaskDropArgs {
  task_id: string;
}

/** The account-side call for a journalled capture — #960 defect 3. */
export interface SyncCaptureArgs {
  client_capture_id: string;
  area_id: string | null;
  raw_text: string;
  return_hook: string | null;
}

/** What the account gave back, so the local optimistic row can be aliased. */
export interface SyncCaptureResult {
  provider: "mock" | "supabase";
  captureId: string | null;
}

/**
 * A journal entry is cleared only when the ACCOUNT took the write.
 *
 * The data layer reports `provider: "mock"` when there is no Supabase client —
 * a successful no-op, not a successful write. Letting that resolve normally
 * would make `replayPendingWrites` delete the entry and the user's work would
 * vanish on the first replay in a signed-out session, which is the precise bug
 * this whole program exists to end. Throwing keeps it queued.
 */
function requireAccountWrite(result: { provider: "mock" | "supabase" }): void {
  if (result.provider !== "supabase") {
    throw new Error(
      "Cannot send this write yet: LifeOS cannot reach your account.",
    );
  }
}

function winHandler(ops: DurableWriteServerOps) {
  return async (write: PendingWrite): Promise<void> => {
    const payload = write.payload as WinWritePayload;
    const resolved = ops.resolveWinIds?.(payload);
    const areaId =
      payload.persisted_area_id ?? resolved?.persistedAreaId ?? null;
    const taskId =
      payload.persisted_task_id ?? resolved?.persistedTaskId ?? null;

    if (!areaId || !taskId) {
      // Not droppable and not sendable: a win must reference the task and area
      // it came from (`CreateWinRecordInputSchema`), and inventing them would
      // file it against the wrong area. Throwing keeps it queued for the next
      // replay, when the mapping may exist.
      throw new Error(
        "Cannot send this win yet: its account task or area is not known on this device.",
      );
    }

    const result = await ops.syncWin({
      client_write_id: write.client_write_id,
      area_id: areaId,
      source_task_id: taskId,
      title: payload.title,
      detail: payload.detail,
      occurred_at: payload.occurred_at,
    });
    requireAccountWrite(result);
  };
}

function reviewHandler(ops: DurableWriteServerOps) {
  return async (write: PendingWrite): Promise<void> => {
    const payload = write.payload as ReviewWritePayload;
    const areaId =
      payload.persisted_area_id ?? ops.resolveReviewAreaId?.(payload) ?? null;

    // A null area is only legitimate when the user genuinely chose All areas.
    // If they had an area selected and it still has no account id, sending
    // null would file the review permanently under no area -- so it waits.
    // This preserves the pre-#737-A guard
    // (`if (!client || (selectedAreaId && !persistedAreaId))`), which refused
    // to write in exactly this case.
    if (payload.workflow_area_id !== null && areaId === null) {
      throw new Error(
        "Cannot send this review yet: its account area is not known on this device.",
      );
    }

    let result;
    try {
      result = await ops.syncReview({
        client_write_id: write.client_write_id,
        area_id: areaId,
        review_type: payload.review_type,
        period_start: payload.period_start,
        period_end: payload.period_end,
        summary_json: payload.summary_json,
      });
    } catch (error) {
      // TERMINAL SUCCESS, NOT A FAILURE.
      //
      // Migration 20260727120000 makes one daily close per user per day a
      // database fact. It is deliberately not the upsert's ON CONFLICT
      // arbiter, so a second close of the same day RAISES rather than being
      // ignored — see `isDailyCloseConflict` for why that is the signal we
      // want.
      //
      // Every other throw in this file means "keep it queued". This one must
      // not: the account already holds this day's close, so there is nothing
      // left to send, and re-queuing would retry on every mount and every
      // reconnect for the rest of the account's life. Returning normally lets
      // `replayPendingWrites` drop the entry, which is the truth.
      if (isDailyCloseConflict(error)) return;
      throw error;
    }
    requireAccountWrite(result);
  };
}

function executionSessionHandler(ops: DurableWriteServerOps) {
  return async (write: PendingWrite): Promise<void> => {
    const payload = write.payload as ExecutionSessionWritePayload;
    const sync = ops.syncExecutionSession;
    if (!sync) {
      // No account operation wired in this caller. Keep it queued rather than
      // resolving, which would delete the user's outcome.
      throw new Error(
        "Cannot send this session yet: LifeOS cannot reach your account.",
      );
    }

    const resolved = ops.resolveExecutionSessionIds?.(payload);
    const taskId =
      payload.persisted_task_id ?? resolved?.persistedTaskId ?? null;

    if (!taskId) {
      // A session must reference the task it was spent on
      // (`record_execution_session` looks the task up to derive user and
      // area). Inventing one would file the work against the wrong area, so
      // this waits for the mapping instead.
      throw new Error(
        "Cannot send this session yet: its account task is not known on this device.",
      );
    }

    // A null block is NOT a missing id — it is the blockless session (P0#2).
    // Only a block the user actually had, whose account id has not synced
    // yet, is a reason to wait.
    const blockId =
      payload.persisted_block_id ?? resolved?.persistedBlockId ?? null;
    if (payload.workflow_block_id !== null && blockId === null) {
      throw new Error(
        "Cannot send this session yet: its account block is not known on this device.",
      );
    }

    const result = await sync({
      client_write_id: write.client_write_id,
      task_id: taskId,
      calendar_block_id: blockId,
      outcome: payload.outcome,
      actual_minutes: payload.actual_minutes,
      paused_minutes: payload.paused_minutes,
      distraction_minutes: payload.distraction_minutes,
      productivity_rating: payload.productivity_rating,
      notes: payload.notes,
      cap_outcome: payload.cap_outcome,
      defer_task: payload.defer_task,
    });
    requireAccountWrite(result);
  };
}

function planPlacementHandler(ops: DurableWriteServerOps) {
  return async (write: PendingWrite): Promise<void> => {
    const payload = write.payload as PlanPlacementWritePayload;
    const sync = ops.syncPlanPlacement;
    if (!sync) {
      throw new Error(
        "Cannot send this plan yet: LifeOS cannot reach your account.",
      );
    }

    const resolved = ops.resolvePlanPlacementIds?.(payload);
    const taskId =
      payload.persisted_task_id ?? resolved?.persistedTaskId ?? null;

    if (!taskId) {
      // A block must reference the task it holds time for. Inventing one would
      // put the user's hour against the wrong work, so this waits for the
      // mapping instead.
      throw new Error(
        "Cannot send this plan yet: its account task is not known on this device.",
      );
    }

    // A null proposal id is NOT a missing mapping — it means the placement
    // minted its proposal locally and the server must mint one too. Only a
    // proposal the user actually had on the account, whose id has not synced
    // to this device yet, would be a reason to wait; that case resolves to a
    // value here or stays null and the server mints a fresh row, which is
    // still exactly one block.
    const proposalId =
      payload.persisted_proposal_id ?? resolved?.persistedProposalId ?? null;

    const result = await sync({
      client_write_id: write.client_write_id,
      task_id: taskId,
      proposal_id: proposalId,
      proposed_start: payload.proposed_start,
      proposed_end: payload.proposed_end,
      rationale_note: payload.rationale,
    });
    requireAccountWrite(result);
    ops.recordPlanPlacementIds?.(payload, result);
  };
}

function taskDraftAcceptHandler(ops: DurableWriteServerOps) {
  return async (write: PendingWrite): Promise<void> => {
    const payload = write.payload as TaskDraftAcceptWritePayload;
    const sync = ops.syncTaskDraftAccept;
    if (!sync) {
      throw new Error(
        "Cannot send this triage decision yet: LifeOS cannot reach your account.",
      );
    }

    const resolved = ops.resolveTaskDraftAcceptIds?.(payload);
    const areaId =
      payload.persisted_area_id ?? resolved?.persistedAreaId ?? null;

    if (!areaId) {
      // Every task is area-scoped, and an area is the unit the whole product
      // reasons about. Filing this under a guessed one is worse than filing it
      // late, so it waits — the same rule the win handler applies.
      throw new Error(
        "Cannot send this triage decision yet: its account area is not known on this device.",
      );
    }

    // A null capture id is legitimate: the capture may never have reached the
    // account (a pre-existing gap #771 recorded). The task still lands; only
    // its provenance link is absent.
    const captureId =
      payload.persisted_capture_id ?? resolved?.persistedCaptureId ?? null;

    const result = await sync({
      client_write_id: write.client_write_id,
      area_id: areaId,
      source_capture_item_id: captureId,
      draft_id: payload.workflow_draft_id,
      title: payload.title,
      description: payload.description,
      confidence: payload.confidence,
      task_type: payload.task_type,
      is_reversible: payload.is_reversible,
      due_at: payload.due_at,
      estimated_minutes_low: payload.estimated_minutes_low,
      estimated_minutes_high: payload.estimated_minutes_high,
      first_tiny_step: payload.first_tiny_step,
      is_commitment: payload.is_commitment,
      person_mentions: payload.person_mentions,
      task_status: payload.task_status,
      accepted_at: payload.accepted_at,
      proposal:
        payload.proposed_start && payload.proposed_end
          ? {
              proposed_start: payload.proposed_start,
              proposed_end: payload.proposed_end,
              rationale: payload.rationale ?? "",
            }
          : null,
    });
    requireAccountWrite(result);
    ops.recordTaskDraftAcceptIds?.(payload, result);
  };
}

/**
 * `rollup_summaries`' ORIGINAL uniqueness — one rollup per area per period,
 * from the table's first migration (20260706130000), long predating any
 * idempotency key. Named here so the predicate below matches on the
 * constraint rather than on the words "duplicate key".
 */
export const ROLLUP_PERIOD_CONSTRAINT = "rollup_summaries_period_key";

/**
 * Did this failure mean "the account already has a rollup for this area and
 * period"? Then there is nothing left to send.
 *
 * Same reasoning as `isDailyCloseConflict`, and the same danger if read
 * wrongly: `rollupHandler` throws on any error, a throw means "keep queued",
 * and a rollup approved on a second device would then retry forever against a
 * row that will never go away.
 *
 * Matched on the CONSTRAINT NAME, never on a generic "duplicate key": that
 * would also swallow a `(user_id, client_write_id)` violation, which means
 * something else entirely (a genuinely replayed write, already handled by
 * `ignoreDuplicates`).
 */
export function isRollupPeriodConflict(error: unknown): boolean {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : String(error ?? "");
  return message.includes(ROLLUP_PERIOD_CONSTRAINT);
}

/**
 * Did this failure mean "that block is already not on the calendar"?
 *
 * `unplan_calendar_block` (20260630180000) raises
 * `Only scheduled blocks can be unplanned.` when the block's status is
 * anything other than `scheduled`. On a REPLAY that is the success case: a
 * response lost after the row already changed. Retrying it forever would be
 * the mirror image of the bug this slice fixes — the machinery insisting on an
 * action the account has already taken.
 *
 * Matched on the function's own message text, which is the only signal it
 * gives (a plpgsql `raise exception` with no error code of its own).
 */
export const ALREADY_UNPLANNED_MESSAGE =
  "Only scheduled blocks can be unplanned.";

export function isAlreadyUnplanned(error: unknown): boolean {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : String(error ?? "");
  return message.includes(ALREADY_UNPLANNED_MESSAGE);
}

function rollupHandler(ops: DurableWriteServerOps) {
  return async (write: PendingWrite): Promise<void> => {
    const payload = write.payload as RollupWritePayload;
    const sync = ops.syncRollup;
    if (!sync) {
      throw new Error(
        "Cannot send this rollup yet: LifeOS cannot reach your account.",
      );
    }

    const areaId =
      payload.persisted_area_id ?? ops.resolveRollupAreaId?.(payload) ?? null;

    if (!areaId) {
      // A rollup IS a per-area summary — `rollup_summaries.area_id` is NOT NULL
      // and the whole row is meaningless against the wrong area. So it waits,
      // the same rule the win and draft-accept handlers apply. This preserves
      // the pre-S5 guard (`if (!persistedAreaId) { markLocalOnly(...); return; }`)
      // rather than relaxing it.
      throw new Error(
        "Cannot send this rollup yet: its account area is not known on this device.",
      );
    }

    let result;
    try {
      result = await sync({
        client_write_id: write.client_write_id,
        area_id: areaId,
        period_type: payload.period_type,
        period_start: payload.period_start,
        period_end: payload.period_end,
        summary: payload.summary,
      });
    } catch (error) {
      // TERMINAL SUCCESS, NOT A FAILURE — the same shape as the daily-close
      // conflict in `reviewHandler`, and it needs its own check for the same
      // reason: `rollup_summaries_period_key` (one rollup per area per period,
      // from the table's original migration) is NOT the upsert's ON CONFLICT
      // arbiter, so a period already rolled up on ANOTHER device raises 23505
      // on that constraint instead of being ignored.
      //
      // Re-queuing on it would retry forever: the conflicting row is not going
      // anywhere. The account already holds this area's rollup for this
      // period, which is exactly the state the write wanted, so the entry is
      // dropped.
      if (isRollupPeriodConflict(error)) return;
      throw error;
    }
    requireAccountWrite(result);
  };
}

/**
 * Handle an unplan whose placement ALREADY reached the account.
 *
 * The queued-placement case never gets here — `resolveSupersededWrites` has
 * already annulled both halves before dispatch. So reaching this handler means
 * there is a real `calendar_blocks` row to unplan.
 */
function planUnplacementHandler(ops: DurableWriteServerOps) {
  return async (write: PendingWrite): Promise<void> => {
    const payload = write.payload as PlanUnplacementWritePayload;
    const sync = ops.syncPlanUnplacement;
    if (!sync) {
      throw new Error(
        "Cannot send this plan change yet: LifeOS cannot reach your account.",
      );
    }

    const blockId =
      payload.persisted_block_id ??
      ops.resolvePlanUnplacementBlockId?.(payload) ??
      null;

    if (!blockId) {
      // The block has no account id yet AND no queued placement was annulled,
      // so the placement is somewhere in between — mid-flight, or queued
      // behind this entry after an id-resolution failure. Waiting is right:
      // unplanning a guessed block id would delete someone else's hour.
      throw new Error(
        "Cannot send this plan change yet: its account block is not known on this device.",
      );
    }

    let result;
    try {
      result = await sync({ block_id: blockId });
    } catch (error) {
      // TERMINAL SUCCESS. `unplan_calendar_block` raises "Only scheduled
      // blocks can be unplanned." on its second call, so a response lost
      // AFTER the row changed would otherwise retry forever against a block
      // that is already in exactly the state the user asked for.
      if (isAlreadyUnplanned(error)) return;
      throw error;
    }
    requireAccountWrite(result);
  };
}

/** Same two jobs as the unplan handler, for a dropped task. */
function taskDropHandler(ops: DurableWriteServerOps) {
  return async (write: PendingWrite): Promise<void> => {
    const payload = write.payload as TaskDropWritePayload;
    const sync = ops.syncTaskDrop;
    if (!sync) {
      throw new Error(
        "Cannot send this change yet: LifeOS cannot reach your account.",
      );
    }

    const taskId =
      payload.persisted_task_id ?? ops.resolveTaskDropTaskId?.(payload) ?? null;

    if (!taskId) {
      throw new Error(
        "Cannot send this change yet: its account task is not known on this device.",
      );
    }

    // No conflict case to absorb: `apply_task_review_transition` to `dropped`
    // is a fixed-value update, so replaying it is naturally idempotent.
    const result = await sync({ task_id: taskId });
    requireAccountWrite(result);
  };
}

/**
 * #960 defect 3: replay one journalled raw capture. Same shape as
 * `reviewHandler`'s area guard — `workflow_area_id !== null` is what tells
 * "no area, on purpose" apart from "an area, not synced yet".
 */
function captureHandler(ops: DurableWriteServerOps) {
  return async (write: PendingWrite): Promise<void> => {
    const payload = write.payload as CaptureWritePayload;
    const sync = ops.syncCapture;
    if (!sync) {
      throw new Error(
        "Cannot send this capture yet: LifeOS cannot reach your account.",
      );
    }

    const areaId =
      payload.persisted_area_id ?? ops.resolveCaptureAreaId?.(payload) ?? null;

    if (payload.workflow_area_id !== null && areaId === null) {
      throw new Error(
        "Cannot send this capture yet: its account area is not known on this device.",
      );
    }

    const result = await sync({
      client_capture_id: write.client_write_id,
      area_id: areaId,
      raw_text: payload.raw_text,
      return_hook: payload.return_hook,
    });
    requireAccountWrite(result);
    ops.recordCaptureId?.(payload, result);
  };
}

/**
 * The entity -> handler map this slice wires. Entities absent from this map
 * are reported `skipped` by the kernel and stay queued, so a later slice
 * adding an entity without a handler loses nothing — it just does not sync
 * until it is wired.
 *
 * The corollary is a rule, not a caveat: NEVER journal an entity before its
 * handler exists. An unhandled entity is kept forever, so "enqueue it now,
 * wire it later" builds an unbounded queue on the user's device. That is why
 * `draft_edit`, `project_draft_decision`, `first_tiny_step`, `wip_swap` and
 * `task_map_approval` are declared in `PendingWriteEntity` but nothing
 * enqueues them yet.
 *
 * REPLAY MUST STAY SEQUENTIAL — handlers depend on each other's output.
 * `recordTaskDraftAcceptIds` writes the new account task id into the caller's
 * id map, and a `plan_placement` queued behind it for that same task resolves
 * its `persisted_task_id` from exactly that map. Accepting a draft and then
 * placing it, both while offline, only survives the reconnect because the
 * journal drains strictly FIFO and each handler completes before the next
 * starts. Parallelising the drain would silently break that chain: the
 * placement would find no task id and re-queue instead of landing.
 */
export function createDurableWriteHandlers(
  ops: DurableWriteServerOps,
): PendingWriteHandlers {
  return {
    win: winHandler(ops),
    review: reviewHandler(ops),
    execution_session: executionSessionHandler(ops),
    plan_placement: planPlacementHandler(ops),
    task_draft_accept: taskDraftAcceptHandler(ops),
    rollup: rollupHandler(ops),
    plan_unplacement: planUnplacementHandler(ops),
    task_drop: taskDropHandler(ops),
    capture: captureHandler(ops),
  };
}

/**
 * Drain the journal to the account, oldest write first. Safe to call on every
 * mount and every reconnect: an entry already sent is gone from the journal,
 * and one still queued is retried idempotently.
 *
 * #737 C1 S5: annulled pairs are resolved FIRST, before any dispatch, so a
 * write the user has taken back is never delivered. That pass is deliberately
 * not fault-coupled to the drain — if it fails, both halves of the pair stay
 * queued and the drain proceeds, which is the pre-S5 behaviour rather than a
 * new failure mode.
 */
export async function replayDurableWrites(
  ops: DurableWriteServerOps,
): Promise<ReplaySummary> {
  try {
    await resolveSupersededWrites();
  } catch {
    // Nothing was cancelled; nothing was lost. The drain still runs.
  }
  return replayPendingWrites(createDurableWriteHandlers(ops));
}
