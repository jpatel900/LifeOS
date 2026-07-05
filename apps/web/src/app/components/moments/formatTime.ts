/**
 * SP-7 (subtle-polish plan) — one voice for time and counts.
 *
 * Single source for the moments surfaces' time/count copy: relative
 * age/future, wall-clock display, and pluralized count labels. This is a
 * refactor to a single source, not a restyling — every helper here is
 * designed to reproduce the *exact* current output of the sites it
 * replaces, so no existing test assertion changes.
 *
 * Scope note (see PR body for the full audit): `formatClock` is wired into
 * the two moments sites that already call `toLocaleTimeString` with
 * identical options (`ScheduleBlock.tsx`, `CurrentBlockHero.tsx`) — a true
 * single-source unification. `formatRelative` and `plural` are implemented
 * and unit-tested here as the shared API per the packet spec, but are
 * intentionally left *unwired*:
 *
 * - The only genuine relative-future formatter in moments today
 *   (`formatRemaining`/`formatUntil` in `useCountdown.ts`) is explicitly
 *   out of scope for this packet (SP-2's ticking-clock domain). Reproducing
 *   its format here without deleting the original would create a *second*
 *   source, which is the opposite of this packet's goal.
 * - No `N task(s)`/`N block(s)` pluralization site exists in
 *   `components/moments/**` today. The count-ish strings that do exist
 *   (`"N days away"`, `"(N days)"`, `"~N minutes"`, `"Nd"`, `"N open"`/
 *   `"N waiting"`) are fixed-suffix or differently-shaped and are not
 *   currently pluralization bugs — routing them through `plural()` would
 *   change untested but real behavior (e.g. n=1 "1 days" -> "1 day", or
 *   "1 open" -> "1 opens", which is grammatically wrong since "open" is
 *   used as an adjective, not a countable noun). Left as follow-ups.
 */

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * Formats the relative offset between `iso` and `now` as a compact human
 * label: "in 3h 28m" for future timestamps, "8 days ago" for past ones.
 * Boundary: anything inside the same minute (|diff| < 60s) reads "just now".
 *
 * Not currently wired into any component (see file header) — provided as
 * the packet's shared API surface and unit-tested on its own.
 */
export function formatRelative(iso: string, now: Date): string {
  const diffMs = new Date(iso).getTime() - now.getTime();
  const abs = Math.abs(diffMs);

  if (abs < MINUTE_MS) return "just now";

  const future = diffMs > 0;
  const days = Math.floor(abs / DAY_MS);

  if (days > 0) {
    const label = plural(days, "day");
    return future ? `in ${label}` : `${label} ago`;
  }

  const hours = Math.floor(abs / HOUR_MS);
  const minutes = Math.floor((abs % HOUR_MS) / MINUTE_MS);

  if (hours > 0) {
    const label = minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    return future ? `in ${label}` : `${label} ago`;
  }

  const label = `${minutes}m`;
  return future ? `in ${label}` : `${label} ago`;
}

/**
 * Locale short wall-clock time ("2:05 PM" / "14:05" depending on locale),
 * matching the exact `toLocaleTimeString` call already used by
 * `ScheduleBlock.tsx` and `CurrentBlockHero.tsx` (undefined locale,
 * 2-digit hour/minute) so wiring this in changes no rendered output.
 */
export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Count copy: "1 task" / "2 tasks". Defaults the plural form to
 * `singular + "s"` when not given explicitly. n=0 uses the plural form
 * ("0 tasks"), matching standard English count-copy convention.
 *
 * Not currently wired into any component (see file header) — provided as
 * the packet's shared API surface and unit-tested on its own.
 */
export function plural(
  n: number,
  singular: string,
  pluralForm?: string,
): string {
  const word = n === 1 ? singular : (pluralForm ?? `${singular}s`);
  return `${n} ${word}`;
}
