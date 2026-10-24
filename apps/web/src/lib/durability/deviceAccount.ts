/**
 * W3-16 #1: which account owns the work this DEVICE is still holding.
 *
 * Two device stores hold work that has not reached the account yet: the
 * pending-writes journal (`pendingWriteJournal.ts`) and the offline capture
 * queue (`../capture/offlineQueue.ts`). Both are shared by every account that
 * signs in on this browser. Before this module, neither recorded whose work an
 * entry was, so a capture account A could not deliver was later sent through
 * account B's session after A signed out and B signed in.
 *
 * This module is the ONE owner of that rule:
 *
 * - A new entry is stamped with the account that is signed in when it is
 *   made (`ownerStampForNewEntry`).
 * - An entry may be SENT only through its own account's session
 *   (`maySendAs`). An entry with no owner was made signed out (or before the
 *   account was known) and keeps the #960 behavior: it goes to the account
 *   that signs in.
 * - An entry known to belong to another account is not shown or counted for
 *   the current one (`isHeldForAnotherAccount`). Nothing is deleted: the work
 *   waits on the device until its own account signs in again.
 *
 * Pure module state, no React, no network. `WorkflowProvider` keeps it
 * current from what it already learns about the session (the auth listener's
 * events and `runAccountSync`'s own identity read).
 */

/**
 * The account signed in on this device right now.
 * - a user id: that account is signed in;
 * - `null`: known to be signed out;
 * - `undefined`: not known yet (before the first identity read).
 */
export type DeviceAccount = string | null | undefined;

let currentAccount: DeviceAccount = undefined;

export function setDeviceAccount(account: DeviceAccount): void {
  currentAccount = account;
}

export function getDeviceAccount(): DeviceAccount {
  return currentAccount;
}

/** The owner to stamp on a NEW device entry, or none when no account is known. */
export function ownerStampForNewEntry(): string | undefined {
  return typeof currentAccount === "string" ? currentAccount : undefined;
}

/**
 * May an entry owned by `owner` be sent through `account`'s session?
 * Strict: an owned entry needs that exact account to be KNOWN signed in.
 */
export function maySendAs(
  owner: string | undefined,
  account: DeviceAccount = currentAccount,
): boolean {
  if (owner === undefined) return true;
  return typeof account === "string" && owner === account;
}

/**
 * Is an entry owned by `owner` known to belong to someone other than
 * `account`? Lenient while the account is not known yet, so the owner's own
 * work does not briefly vanish from view on a reload.
 */
export function isHeldForAnotherAccount(
  owner: string | undefined,
  account: DeviceAccount = currentAccount,
): boolean {
  if (owner === undefined) return false;
  if (account === undefined) return false;
  return owner !== account;
}

/** The device entries `account` may see: its own, plus unowned ones. */
export function visibleToAccount<T extends { owner_user_id?: string }>(
  entries: readonly T[],
  account: DeviceAccount = currentAccount,
): T[] {
  return entries.filter(
    (entry) => !isHeldForAnotherAccount(entry.owner_user_id, account),
  );
}
