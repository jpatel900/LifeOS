/**
 * Final UX Loop C1 re-score, GAP 1 — "has the user already logged this win?"
 * as a fact the app reads back, rather than a memory of the current tab.
 *
 * The fresh-eyes re-score (#737) logged one win, opened a NEW TAB, was offered
 * the same win again as un-logged, took the offer, and left the account holding
 * TWO `win_records` rows for one accomplishment. That is the only defect in the
 * C1 set where the app invents a record of the user's work, which is the class
 * campaign C1 exists to end.
 *
 * Two halves fixed it and this module is the readback half. The other is the
 * idempotency key: `deriveWinClientWriteId` in `lib/durability/durableWrites.ts`
 * derives `client_write_id` from the fact instead of minting a fresh uuid, so
 * `win_records_user_client_write_id_key` finally has a repeat it can recognise.
 * A backstop cannot catch what it cannot recognise, and a screen that forgets
 * will keep asking — both had to move.
 *
 * ## Deliberately the same shape as `resolveDayClose`
 *
 * Same two tiers, same reasons, sitting beside it on purpose:
 *
 *  - the ACCOUNT tier is what a second machine sees;
 *  - the DEVICE JOURNAL tier is a win this device holds and has not sent yet
 *    — without it, a win logged offline would be re-offered on the next
 *    reload, which is the same failure one tier down.
 *
 * Unlike the day close there is no PRECEDENCE to resolve, only a union: both
 * tiers answer the single question the offer needs answered ("the user already
 * logged this"), and neither changes the sentence the user is shown. Where the
 * win lives is reported by the existing sync-status vocabulary, not here.
 *
 * ## The day is the LOCAL day, and that is not a detail
 *
 * `confirmWin` files a win under `localIsoDate(new Date())`. The UTC/local
 * split has now bitten this codebase three times (#773, #775, #778), and it
 * bites hardest exactly here: the Close moment is what the heuristic shows from
 * 17:00 LOCAL, and west of Greenwich 17:00 local is already tomorrow in UTC. A
 * UTC-keyed readback would therefore find nothing at the precise hour the
 * product is designed for, and re-offer a win logged ten minutes earlier.
 * Callers pass the local day; this module never derives one.
 */

/**
 * One win this user has already logged, as read back from a durable tier.
 *
 * `taskId` is WORKFLOW-scoped. The account row's `source_task_id` is an account
 * uuid, and a task created locally carries a non-uuid workflow id until it
 * syncs, so the provider resolves the row into the id space the Close moment's
 * candidates actually use. Keeping that resolution at the provider is what lets
 * every consumer below it compare ids without knowing two spaces exist.
 */
export interface LoggedWinRecord {
  taskId: string;
  title: string;
  /** The LOCAL calendar day the win was filed under (`occurred_at`). */
  occurredAt: string;
}

/**
 * The wins logged for ONE local day, merged across both tiers and deduped by
 * task.
 *
 * Deduped by task rather than by row because that is the question being asked:
 * a win held on the device AND already taken by the account is one win, and a
 * task earns at most one win per day. Order is account-tier first, then
 * device-only — stable, and the account tier is the one another machine would
 * also show.
 *
 * Returns `[]` when nothing was logged that day. Never guesses.
 */
export function resolveLoggedWinsForDay(
  accountWins: readonly LoggedWinRecord[],
  journalledWins: readonly LoggedWinRecord[],
  day: string,
): LoggedWinRecord[] {
  const merged: LoggedWinRecord[] = [];
  const seenTaskIds = new Set<string>();
  for (const record of [...accountWins, ...journalledWins]) {
    if (record.occurredAt !== day) continue;
    if (seenTaskIds.has(record.taskId)) continue;
    seenTaskIds.add(record.taskId);
    merged.push(record);
  }
  return merged;
}
