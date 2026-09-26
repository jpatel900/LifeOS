import type { Task } from "@lifeos/schemas";
import { localDayStamp } from "../reEntry/briefView";

/**
 * FR-049 (#1025) — "bring a put-off task back on a chosen day".
 *
 * This module is the one place that answers "has this day arrived": the
 * pure rule (`selectBackTodayTasks`) plus the local-day <-> stored-instant
 * conversion the editor and the accept-mapping tests both need. No ambient
 * clock anywhere here — every caller passes `now` explicitly, matching
 * `lib/compost/compostPolicy.ts`'s existing pattern for this exact shape of
 * rule (a caller-supplied `now`, no `Date.now()` inside).
 *
 * `localDayStamp` (from `lib/reEntry/briefView.ts`) is reused rather than
 * copied — it already turns a `Date` into a local `YYYY-MM-DD` stamp using
 * the same local-getter convention (`getFullYear`/`getMonth`/`getDate`),
 * which is exactly the "local calendar day" FR-049 requires. Two stamps
 * compare correctly with plain string `<=` because the format is
 * zero-padded and big-endian.
 */

/**
 * Local noon of the given local day, as an ISO instant. Chosen storage
 * convention: local noon sits 12 hours from either local midnight
 * boundary, so a DST shift (at most a couple of hours, always near a local
 * 2am transition, never near noon) can never push the stored instant into
 * the adjacent calendar day when read back with `localDayStamp`. Only a
 * `+00:00`/`Z`-suffixed round trip is required by the offset-aware
 * `TaskSchema.due_at` — `toISOString()` always produces `Z`.
 */
export function localNoonIsoForDay(dayStamp: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayStamp);
  if (!match) {
    throw new RangeError(`Expected a YYYY-MM-DD local day, got: ${dayStamp}`);
  }
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  const local = new Date(year, month - 1, day, 12, 0, 0, 0);
  // A day like 2026-02-30 rolls forward in `Date`'s constructor rather than
  // throwing; catch that here so a malformed day never silently saves a
  // different day than the one the person picked.
  if (
    local.getFullYear() !== year ||
    local.getMonth() !== month - 1 ||
    local.getDate() !== day
  ) {
    throw new RangeError(`Not a real calendar day: ${dayStamp}`);
  }

  return local.toISOString();
}

/**
 * The inverse read: the local calendar day a stored `due_at` instant falls
 * on, or `null` when there is nothing stored. Thin wrapper over
 * `localDayStamp` so callers never have to remember to construct the `Date`
 * themselves.
 */
export function localDayStampFromDueAt(dueAt: string | null): string | null {
  if (!dueAt) return null;
  const parsed = new Date(dueAt);
  if (Number.isNaN(parsed.getTime())) return null;
  return localDayStamp(parsed);
}

/**
 * FR-049's "has this day arrived" rule: every put-off (`status === "backlog"`)
 * task whose return day (`due_at`, read as a local calendar day) is today or
 * earlier, scoped to one area when `areaId` is given.
 *
 * - A non-backlog task is never included, whatever its `due_at` (a task
 *   promoted to today, finished, or dropped drops out immediately — see the
 *   FR-049 acceptance criteria).
 * - A backlog task with no `due_at` is never included — only a day the
 *   person actually set counts.
 * - `areaId: null` (or omitted) means "All areas" — no filtering. A
 *   non-null `areaId` scopes strictly to that area; there is no
 *   fall-back-to-all-areas behavior (unlike `oldestActiveTask`'s
 *   prominence fallback) — FR-049 requires a task never appear in another
 *   area's view.
 */
export function selectBackTodayTasks(
  tasks: readonly Task[],
  areaId: string | null | undefined,
  now: Date,
): Task[] {
  const todayStamp = localDayStamp(now);

  return tasks.filter((task) => {
    if (task.status !== "backlog") return false;
    if (areaId && task.area_id !== areaId) return false;

    const dueStamp = localDayStampFromDueAt(task.due_at);
    if (dueStamp === null) return false;

    return dueStamp <= todayStamp;
  });
}
