import type {
  Phase2MockCalendarBlock,
  Phase2MockExecutionSession,
  Phase2MockTask,
} from "@/lib/types";
import type { WorkflowState } from "./shared";

/**
 * Final UX Loop C2-S3 — one definition of "this still needs a decision".
 *
 * ## Why this module exists
 *
 * The third of the shared count definitions, after C1's `captureStatus.ts` and
 * C2-S2's `planStatus.ts`, and it is here for the same reason: **a count and
 * the list it points at are one deliverable.**
 *
 * The divergence was measured, not theoretical. FINDING 5 of the C2-S1
 * capability inventory (#687) found the legacy `/review` screen showing three
 * numbers for one workload at the same instant — headline **6**, stage chip
 * **3**, cards actually rendered **3** — because the headline added
 * `today.length` and `backlog.length` to `reviewQueue.length` and
 * `reviewQueue` already contains every one of those tasks.
 *
 * The derivation used to live inline in `buildCockpitViewModel`. Moving it here
 * makes the rule callable by a surface that needs the count WITHOUT building a
 * whole cockpit view model — which is exactly what the ported moments Review
 * sheet needs, and exactly the situation that produced a second, wrong copy of
 * the rule last time.
 *
 * ## The rule
 *
 * Something needs a decision when, in this area, it is:
 *
 * - an execution session that did not go to plan (`stuck`, `missed`,
 *   `stopped`, `distracted`, `partial`, `skipped`), or
 * - a calendar block the day went past (`missed`), or
 * - a task the user marked `blocked`, or
 * - a `active` (do-today) task, or
 * - a `backlog` task.
 *
 * Deduped by task id, first reason wins — so one task that both missed a block
 * and sits in the backlog is ONE decision, not two.
 *
 * ## What it deliberately does NOT cover, and why the label matters
 *
 * A `scheduled` task is open work and is **not** here: it has an hour, so
 * there is nothing to decide about it on a review surface. That is correct,
 * and it is why no surface may head this list with words claiming to cover
 * everything still open (the "carry over" half of FINDING 5). A count that
 * agrees with its list under a label that overclaims is still a lying count.
 *
 * A new surface answering "what still needs a decision?" must call this, or
 * the agreement guard in `reviewStatus.test.ts` silently stops covering it.
 */

export type ReviewQueueReason =
  | "open"
  | "backlog"
  | "stuck"
  | "missed"
  | "partial";

export interface ReviewQueueItem {
  task: Phase2MockTask;
  block: Phase2MockCalendarBlock | null;
  session: Phase2MockExecutionSession | null;
  reason: ReviewQueueReason;
}

const FAILED_SESSION_STATUSES = [
  "stuck",
  "missed",
  "stopped",
  "distracted",
  "partial",
  "skipped",
];

function dedupeByTask(items: ReviewQueueItem[]): ReviewQueueItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.task.id)) return false;
    seen.add(item.task.id);
    return true;
  });
}

/**
 * Every open item in one area that is waiting on a carry-forward / defer /
 * drop decision, deduped by task.
 */
export function selectNeedsDecision(
  state: WorkflowState,
  areaId: string | null,
): ReviewQueueItem[] {
  if (!areaId) return [];

  const fromSessions = state.executionSessions
    .filter(
      (session) =>
        session.area_id === areaId &&
        FAILED_SESSION_STATUSES.includes(session.status),
    )
    .map((session) => {
      const task = state.tasks.find((item) => item.id === session.task_id);
      if (!task) return null;
      return {
        task,
        block:
          state.calendarBlocks.find(
            (item) => item.id === session.calendar_block_id,
          ) ?? null,
        session,
        reason:
          session.status === "missed" || session.status === "skipped"
            ? ("missed" as const)
            : session.status === "partial"
              ? ("partial" as const)
              : ("stuck" as const),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const fromMissedBlocks = state.calendarBlocks
    .filter((block) => block.area_id === areaId && block.status === "missed")
    .map((block) => {
      const task = state.tasks.find((item) => item.id === block.task_id);
      if (!task) return null;
      return {
        task,
        block,
        session:
          state.executionSessions.find(
            (session) => session.calendar_block_id === block.id,
          ) ?? null,
        reason: "missed" as const,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const fromBlockedTasks = state.tasks
    .filter((task) => task.area_id === areaId && task.status === "blocked")
    .map((task) => ({
      task,
      block:
        state.calendarBlocks.find((block) => block.task_id === task.id) ?? null,
      session:
        state.executionSessions.find(
          (session) => session.task_id === task.id,
        ) ?? null,
      reason: "stuck" as const,
    }));

  const fromDoToday = state.tasks
    .filter((task) => task.area_id === areaId && task.status === "active")
    .map((task) => ({
      task,
      block: null,
      session: null,
      reason: "open" as const,
    }));

  const fromBacklog = state.tasks
    .filter((task) => task.area_id === areaId && task.status === "backlog")
    .map((task) => ({
      task,
      block: null,
      session: null,
      reason: "backlog" as const,
    }));

  return dedupeByTask([
    ...fromSessions,
    ...fromMissedBlocks,
    ...fromBlockedTasks,
    ...fromDoToday,
    ...fromBacklog,
  ]);
}

/**
 * The number a review surface may print beside that list — and the ONLY one.
 *
 * A function rather than a bare `.length` at each call site so the agreement
 * guard has a single symbol to hold every surface to, exactly as
 * `selectTasksToPlace` does for the Plan badge.
 */
export function countNeedsDecision(items: ReviewQueueItem[]): number {
  return items.length;
}

/**
 * C2-S3 — the planned-vs-actual list, with the post-sync double removed.
 *
 * ## The double is measured, not hypothetical
 *
 * `momentsViewModel/close.ts` records it in full: the merge used to drop a
 * local row only when the per-mount drop-set named it, and nothing ever
 * populated `persistedSessionIdByLocalIdRef`, so after a sync the reducer held
 * BOTH the optimistic `session-N` row and the account's uuid row for one
 * session. A probe against the real reducer returned
 * `["794b7d18-…", "session-1"]` — one finished session, two rows. `close.ts`
 * sidesteps this by counting the two DURABLE tiers instead of
 * `state.executionSessions`.
 *
 * #844 retired the double at its source — `mergePersistedSessions` applies
 * this same (task, block) rule inside the reducer, so the two rows never
 * coexist in state. This render-tier dedupe is kept as defense-in-depth: it is
 * the one claim this list makes ("no session appears twice"), and it must hold
 * even if a new seam appears upstream.
 *
 * ## The rule, and the residual it knowingly accepts
 *
 * An account row (uuid id) is always kept. A local row is dropped when an
 * account row already covers the same `(task_id, calendar_block_id)` pair —
 * which is exactly the shape the measured double takes.
 *
 * The residual: two genuine sessions on one task, one synced and one not, show
 * as one row. That is an under-report of one, and it is chosen deliberately
 * over the measured alternative — rendering one hour of work as two lines on a
 * review screen. `close.ts` names over-reporting "the worse of the two errors";
 * this list agrees with it rather than inventing a second policy.
 *
 * The provable claim, and the only one made anywhere about this list: **no
 * session appears twice.** It is NOT claimed to equal `completedToday`, which
 * is a differently-scoped number (today only, blockless only, completed only).
 */
export function dedupeSessionsForDisplay(
  sessions: readonly Phase2MockExecutionSession[],
): Phase2MockExecutionSession[] {
  const accountCovered = new Set(
    sessions
      .filter((session) => isAccountId(session.id))
      .map(
        (session) =>
          `${session.task_id ?? ""}::${session.calendar_block_id ?? ""}`,
      ),
  );
  return sessions.filter(
    (session) =>
      isAccountId(session.id) ||
      !accountCovered.has(
        `${session.task_id ?? ""}::${session.calendar_block_id ?? ""}`,
      ),
  );
}

/**
 * An id the account minted, as opposed to one the reducer minted. The same
 * discriminator `mergePersistedRows` and `close.ts` already use: local ids are
 * `session-N`, account ids are uuids.
 */
function isAccountId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    id,
  );
}

/**
 * Whether a session can be compared against a plan at all.
 *
 * A blockless session (audit P0#2's rescued path) has no `planned_minutes`, and
 * the legacy bar computed `actual / Math.max(planned ?? 1, 1)` — so it drew a
 * FULL bar against "/0m", a comparison that does not exist rendered as a
 * perfect one. Those rows show their actual time and no bar.
 */
export function hasPlanToCompare(session: Phase2MockExecutionSession): boolean {
  return (
    typeof session.planned_minutes === "number" && session.planned_minutes > 0
  );
}

/**
 * The headline that heads that list, in words the list can back.
 *
 * Never "carry over": see the module note above — that phrasing claims every
 * still-open item, and a `scheduled` task is still open and not in this list.
 *
 * It names its SET, not just its size, and that is load-bearing. The moments
 * Pipeline rail's **Review** node counts a different thing on purpose —
 * today's finished and missed blocks, captioned "how today went"
 * (`pipelineCounts.ts`, C1-ratified) — and it is the control that opens this
 * surface. So a reader can arrive from a badge reading `0 Review` and find
 * items listed here. Two numbers about one thing would be a contradiction;
 * two sentences about two clearly-named things is not, and the only way to
 * tell them apart from the strings alone is for this one to say what it counts.
 */
export function needsDecisionHeadline(count: number): string {
  if (count === 0) return "Ready to close";
  return `${count} open ${count === 1 ? "item needs" : "items need"} a decision`;
}
