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

import { isDailyCloseConflict } from "@/lib/review/dayClose";
import {
  enqueuePendingWrite,
  listPendingWrites,
  replayPendingWrites,
  type PendingWrite,
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
 * Journal one confirmed win. THROWS when the device cannot hold it (no
 * IndexedDB — private mode, a blocking extension), exactly like the capture
 * queue's enqueue: the caller must show the failure rather than claim a save.
 */
export function journalWinWrite(
  input: JournalWinInput,
): Promise<PendingWrite<WinWritePayload>> {
  return enqueuePendingWrite<WinWritePayload>({
    entity: "win",
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

/**
 * The entity -> handler map this slice wires. Entities absent from this map
 * are reported `skipped` by the kernel and stay queued, so a later slice
 * adding an entity without a handler loses nothing — it just does not sync
 * until it is wired.
 */
export function createDurableWriteHandlers(
  ops: DurableWriteServerOps,
): PendingWriteHandlers {
  return {
    win: winHandler(ops),
    review: reviewHandler(ops),
    execution_session: executionSessionHandler(ops),
  };
}

/**
 * Drain the journal to the account, oldest write first. Safe to call on every
 * mount and every reconnect: an entry already sent is gone from the journal,
 * and one still queued is retried idempotently.
 */
export function replayDurableWrites(
  ops: DurableWriteServerOps,
): Promise<ReplaySummary> {
  return replayPendingWrites(createDurableWriteHandlers(ops));
}
