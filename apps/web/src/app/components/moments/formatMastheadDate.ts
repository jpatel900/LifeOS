const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/**
 * D-10 (#483): the masthead's date string — "Wednesday 15 July" — grounding
 * the topbar the way the prototype's `.datestr` does (audit finding #2: the
 * live topbar had no date at all).
 *
 * Deliberately hand-rolled instead of `toLocaleDateString`: the prototype
 * (and the packet's own example) fixes the shape as "Weekday D Month" with
 * no comma, but `toLocaleDateString(undefined, {...})` shape and separators
 * vary by the runtime's locale (a CI box and a dev machine can render
 * differently, e.g. "Wednesday, July 15" in en-US) — that would make this
 * both non-deterministic for tests and inconsistent with the design intent.
 * Reads local wall-clock date parts (`getDay`/`getDate`/`getMonth`), the
 * same locality `now` is already read at throughout this file (e.g.
 * `heuristicMoment`'s `now.getHours()`).
 */
export function formatMastheadDate(now: Date): string {
  const weekday = WEEKDAYS[now.getDay()];
  const day = now.getDate();
  const month = MONTHS[now.getMonth()];
  return `${weekday} ${day} ${month}`;
}
