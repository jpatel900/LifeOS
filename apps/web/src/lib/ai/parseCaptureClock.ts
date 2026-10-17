/**
 * Bug hunt #16 — the user's local date and time zone, sent with a Sort so
 * the parse prompt can anchor relative deadlines ("by end of day Friday").
 * Without it the model could not know what day it is or the user's offset,
 * and a decision's deadline could land on the wrong local day.
 */
export interface ParseCaptureClock {
  /** Local calendar date, YYYY-MM-DD. */
  today: string;
  /** English weekday name of `today`. */
  weekday: string;
  /** IANA time zone name, or "local" when the browser does not say. */
  timeZone: string;
  /** Offset from UTC at `now`, +HH:MM or -HH:MM. */
  utcOffset: string;
}

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function buildParseCaptureClock(
  now: Date = new Date(),
): ParseCaptureClock {
  let timeZone = "local";
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "local";
  } catch {
    // Keep "local"; the offset below still anchors the day.
  }
  const offsetMinutes = -now.getTimezoneOffset();
  const sign = offsetMinutes < 0 ? "-" : "+";
  const absolute = Math.abs(offsetMinutes);
  return {
    today: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    weekday: WEEKDAYS[now.getDay()]!,
    timeZone,
    utcOffset: `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`,
  };
}

/**
 * Server-side check of an untrusted clock from the request body. Anything
 * malformed is dropped (returns null) rather than failing the Sort: the
 * clock improves deadlines, it must never block parsing.
 */
export function parseParseCaptureClock(
  value: unknown,
): ParseCaptureClock | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const { today, weekday, timeZone, utcOffset } = record;
  if (
    typeof today !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(today) ||
    typeof weekday !== "string" ||
    !(WEEKDAYS as readonly string[]).includes(weekday) ||
    typeof timeZone !== "string" ||
    !/^[A-Za-z0-9_+\-/]{1,64}$/.test(timeZone) ||
    typeof utcOffset !== "string" ||
    !/^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(utcOffset)
  ) {
    return null;
  }
  return { today, weekday, timeZone, utcOffset };
}
