/**
 * Final UX Loop C1, Target Cards 1+7 — "the day is closed" as a fact the app
 * can state, once, and keep stating.
 *
 * Audit 2026-07-26 finding P0#4: pressing `Close the day` changed nothing on
 * screen, ever, and could be pressed indefinitely — `review_entries` held five
 * rows for one date. Two things were missing and both live here: a single
 * definition of WHICH DAY a close belongs to, and a single answer to "is that
 * day already closed?" that both tiers of the write can be asked.
 *
 * ## ONE date derivation, and it is the user's LOCAL calendar day
 *
 * Before this module the write path keyed the review on the UTC date
 * (`new Date().toISOString().slice(0, 10)`) while the Close moment derived its
 * counts from the LOCAL day (`isSameCalendarDay`, `toIsoDate`). Those agree
 * only for part of the world for part of the day. Concretely: the Close moment
 * is what the heuristic shows from 17:00 LOCAL onwards, and in the Americas
 * 17:00 local is already tomorrow in UTC — so a close taken at the exact hour
 * the product is designed for was filed under a day no readback would ever
 * look at. That is PR #773's failure class (a spec, then a feature, keyed on a
 * clock that means different things in different places) inside the write path
 * itself.
 *
 * Local wins because the day being closed is the USER's day: the counts, the
 * carry-forward and the wins on that screen are all "today" in the sense the
 * person sitting there means it. `localIsoDate` is now the only derivation,
 * used by the write, the readback, and the specs.
 */

/**
 * `YYYY-MM-DD` for the LOCAL calendar day of `date`.
 *
 * Deliberately built from the local field accessors rather than
 * `toISOString().slice(0, 10)`, which is the UTC day and differs from this one
 * for most of the planet for most of the evening.
 */
export function localIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * One recorded day-close, and where it actually lives.
 *
 * `savedToAccount` is not decoration: it decides which sentence the user is
 * shown. A close that is only in the device journal is real and durable (it
 * survives a reload and a new tab) but the account does not have it, and the
 * house vocabulary says so plainly rather than claiming a save that has not
 * happened.
 */
export interface DayCloseRecord {
  /** The LOCAL calendar day this close belongs to. */
  periodStart: string;
  savedToAccount: boolean;
}

/**
 * Merge the two tiers into the answer for one day.
 *
 * Both are consulted, and the ACCOUNT wins, because they answer different
 * questions and can both be true at once:
 *
 *  - `accountDays` come from the `review_entries` rows loaded for this user.
 *    They outlive the device, so they are what a second machine sees.
 *  - `journalledDays` come from the pending-write journal — a close that has
 *    been made durable on this device but has not reached the account yet.
 *    Without this tier an unsynced close would show no verdict after a reload,
 *    which is the audit finding again in a narrower case.
 *
 * Returns `null` when the day is genuinely not closed. Never guesses.
 */
export function resolveDayClose(
  accountDays: readonly string[],
  journalledDays: readonly string[],
  day: string,
): DayCloseRecord | null {
  if (accountDays.includes(day)) {
    return { periodStart: day, savedToAccount: true };
  }
  if (journalledDays.includes(day)) {
    return { periodStart: day, savedToAccount: false };
  }
  return null;
}

/**
 * The database index that makes "one close per day" true below the UI.
 * Named here so the client can recognise its violation by name rather than by
 * guessing at a message shape.
 */
export const DAILY_CLOSE_INDEX = "review_entries_user_daily_close_key";

/**
 * Did this failure mean "the account already has this day's close"?
 *
 * Migration 20260727120000 adds a partial unique index on
 * `(user_id, period_start) where review_type = 'daily'`. It is deliberately
 * NOT the upsert's ON CONFLICT arbiter, so a second close of the same day
 * raises 23505 instead of being silently ignored — which is exactly the signal
 * we want, provided it is read correctly.
 *
 * Read INCORRECTLY it is a disaster: `reviewHandler` throws on any error, and
 * a throw tells the journal "keep this queued", so a duplicate close would
 * retry on every mount and every reconnect for the rest of the account's life.
 * This predicate is what turns it into what it actually is — a terminal
 * success. The day is closed; the account has it; there is nothing left to
 * send.
 *
 * Matched on the index NAME, which PostgREST includes verbatim in the message
 * (`duplicate key value violates unique constraint
 * "review_entries_user_daily_close_key"`) and which `getSupabaseMessage`
 * passes through unchanged. A generic "duplicate key" match would also
 * swallow a violation of the client_write_id key, which means something else
 * entirely.
 */
export function isDailyCloseConflict(error: unknown): boolean {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : String(error ?? "");
  return message.includes(DAILY_CLOSE_INDEX);
}
