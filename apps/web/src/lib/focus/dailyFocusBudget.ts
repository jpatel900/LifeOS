/**
 * Stage 1 slice S5 (issue #257) — calendar-load-aware daily focus budget.
 *
 * Dex pattern: the number of things surfaced as "today's focus" should
 * shrink on a heavy-meeting day and grow on a light day, computed
 * deterministically from calendar load — no AI, no network, no ambient
 * clock. Every function here is pure and `now`/input-injected so it stays
 * independently unit-testable.
 *
 * ## Free-hours signal (grounded, documented)
 * `checkGoogleCalendarFreeBusyForConnection` (apps/web/src/lib/googleCalendar/freebusy.ts)
 * is a server-only, per-proposal conflict check against a single candidate
 * window — it answers "does this one slot conflict," not "how many hours
 * are free today," and it is not available to this pure, synchronous
 * view-model layer. There is no existing "today's total free hours" signal
 * plumbed anywhere in the moments home.
 *
 * So this module derives free hours from `WorkflowState.calendarBlocks`:
 * today's non-cancelled blocks, clamped to a documented working window,
 * with overlapping/adjacent busy intervals unioned before summing (so a
 * double-booked hour is not double-counted as busy). Free hours = window
 * hours - unioned busy hours. If a real free/busy read is ever plumbed
 * into the moments home, it should replace `deriveFreeHoursFromBlocks` as
 * the input to `computeDailyFocusBudget` without changing the threshold
 * rule below.
 *
 * ## Working window (documented)
 * 08:00–18:00 local calendar-block time, i.e. a 10-hour reference day. This
 * mirrors the 8am-6pm window implied by the existing schedule rendering
 * (ScheduleList/ScheduleBlock render raw block times with no separate
 * "working hours" concept) and is the simplest fixed default that does not
 * require new user-configurable state for this slice.
 *
 * ## Budget thresholds (documented — the binding contract for this module)
 * - `>= 7` free hours -> 3 (light day: room for a third focus item)
 * - `>= 4` free hours -> 2 (normal day: two focus items)
 * - `<  4` free hours -> 1 (packed day: single focus item)
 * These are deliberately global (no per-area weighting): issue #257 says
 * "per-area weighting only if S0 specified it," and no S0 artifact in this
 * repo specifies per-area weighting for the focus budget, so this stays a
 * single global number.
 *
 * ## Degraded path
 * `computeDailyFocusBudget` accepts `freeHours: number | null`. `null`
 * means the free-hours signal could not be determined (e.g. calendar sync
 * unavailable) and returns `DEFAULT_FOCUS_BUDGET` — the fixed fallback
 * mirrors the repo's existing degraded-state pattern of "state the
 * fallback plainly, keep working" (see `buildTodayCockpitModel`'s
 * `dataDegraded` handling and `WorkflowContext`'s "Calendar is unavailable
 * in local-only mode" messaging) rather than blocking or guessing.
 */

export const WORKING_WINDOW_START_HOUR = 8;
export const WORKING_WINDOW_END_HOUR = 18;
export const WORKING_WINDOW_HOURS =
  WORKING_WINDOW_END_HOUR - WORKING_WINDOW_START_HOUR;

/** Degraded-path fallback: used whenever free hours cannot be determined. */
export const DEFAULT_FOCUS_BUDGET = 2;

const FOCUS_BUDGET_THRESHOLDS = [
  { minFreeHours: 7, budget: 3 },
  { minFreeHours: 4, budget: 2 },
] as const;
const MINIMUM_FOCUS_BUDGET = 1;

export interface DailyFocusBudgetInput {
  /**
   * Free hours remaining in today's working window, or `null` when the
   * free-hours signal is unavailable (degraded path -> DEFAULT_FOCUS_BUDGET).
   */
  freeHours: number | null;
}

/**
 * Compute today's focus budget (3 / 2 / 1) from free hours. Documented
 * thresholds (see module doc comment): >= 7 free hours -> 3; >= 4 -> 2;
 * else -> 1. `freeHours: null` (signal unavailable) -> DEFAULT_FOCUS_BUDGET.
 */
export function computeDailyFocusBudget(input: DailyFocusBudgetInput): number {
  const { freeHours } = input;

  if (freeHours === null || Number.isNaN(freeHours)) {
    return DEFAULT_FOCUS_BUDGET;
  }

  const clamped = Math.max(0, freeHours);

  for (const tier of FOCUS_BUDGET_THRESHOLDS) {
    if (clamped >= tier.minFreeHours) return tier.budget;
  }

  return MINIMUM_FOCUS_BUDGET;
}

export interface BusyInterval {
  startMs: number;
  endMs: number;
}

/**
 * Union overlapping/adjacent intervals so double-booked time is counted
 * once. Intervals must already be clamped to the working window and have
 * `startMs < endMs`; callers filter degenerate/zero-length spans first.
 */
export function unionIntervalHours(intervals: BusyInterval[]): number {
  if (intervals.length === 0) return 0;

  const sorted = [...intervals].sort((a, b) => a.startMs - b.startMs);
  let totalMs = 0;
  let curStart = sorted[0].startMs;
  let curEnd = sorted[0].endMs;

  for (let i = 1; i < sorted.length; i += 1) {
    const next = sorted[i];
    if (next.startMs <= curEnd) {
      curEnd = Math.max(curEnd, next.endMs);
    } else {
      totalMs += curEnd - curStart;
      curStart = next.startMs;
      curEnd = next.endMs;
    }
  }
  totalMs += curEnd - curStart;

  return totalMs / (60 * 60 * 1000);
}

export interface CalendarBlockLike {
  status: string;
  start_at: string;
  end_at: string;
}

function isSameCalendarDay(isoValue: string, reference: Date): boolean {
  const value = new Date(isoValue);
  return (
    value.getFullYear() === reference.getFullYear() &&
    value.getMonth() === reference.getMonth() &&
    value.getDate() === reference.getDate()
  );
}

function workingWindowForDay(reference: Date): {
  startMs: number;
  endMs: number;
} {
  const start = new Date(reference);
  start.setHours(WORKING_WINDOW_START_HOUR, 0, 0, 0);
  const end = new Date(reference);
  end.setHours(WORKING_WINDOW_END_HOUR, 0, 0, 0);
  return { startMs: start.getTime(), endMs: end.getTime() };
}

/**
 * Derive today's free hours from non-cancelled calendar blocks, clamped to
 * the documented working window. Returns a number in `[0, WORKING_WINDOW_HOURS]`.
 * This never returns `null` — an empty block list is a fully free day (the
 * documented degraded signal is a separate, explicit input; see module doc).
 */
export function deriveFreeHoursFromBlocks(
  blocks: CalendarBlockLike[],
  now: Date,
): number {
  const { startMs: windowStart, endMs: windowEnd } = workingWindowForDay(now);

  const busyIntervals: BusyInterval[] = blocks
    .filter(
      (block) =>
        block.status !== "cancelled" && isSameCalendarDay(block.start_at, now),
    )
    .map((block) => {
      const blockStart = new Date(block.start_at).getTime();
      const blockEnd = new Date(block.end_at).getTime();
      return {
        startMs: Math.max(blockStart, windowStart),
        endMs: Math.min(blockEnd, windowEnd),
      };
    })
    .filter((interval) => interval.endMs > interval.startMs);

  const busyHours = unionIntervalHours(busyIntervals);
  const freeHours = WORKING_WINDOW_HOURS - busyHours;

  return Math.max(0, Math.min(WORKING_WINDOW_HOURS, freeHours));
}

export interface FocusSplitResult<T> {
  focus: T[];
  deferred: T[];
}

/**
 * Split an ordered focus-item list into `{ focus, deferred }` at the
 * budget. `deferred` is the over-budget tail, preserved (never dropped) so
 * it can be rendered as a visibly-deferred, non-hidden list per #257.
 */
export function splitByFocusBudget<T>(
  orderedItems: T[],
  budget: number,
): FocusSplitResult<T> {
  const safeBudget = Math.max(0, Math.floor(budget));
  return {
    focus: orderedItems.slice(0, safeBudget),
    deferred: orderedItems.slice(safeBudget),
  };
}
