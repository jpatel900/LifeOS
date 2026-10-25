/**
 * #737 C1 re-score GAP 3 — the device-durable home for an UNACCEPTED triage
 * draft.
 *
 * ## The gap this closes
 *
 * Sort a capture, edit the draft, close the tab, open a new one: the draft was
 * gone and the capture came back as "Captured, not sorted yet". It survived a
 * reload only because `WorkflowContext` mirrors the whole reducer state to
 * `sessionStorage`, and `sessionStorage` is scoped to ONE TAB. #778 made the
 * ACCEPTED draft durable; the pending one, including every edit made to it,
 * still died with the tab.
 *
 * ## WHY THIS IS NOT A PENDING WRITE, AND MUST NOT BE ONE
 *
 * The obvious move is to journal it like everything else in this folder. Three
 * places in the codebase already rule that out, and they were written before
 * this gap was found:
 *
 *  - `pendingWriteJournal.ts` declares `draft_edit` as an entity and
 *    deliberately leaves it unenqueued, with the rule stated in
 *    `durableWrites.ts`: "NEVER journal an entity before its handler exists.
 *    An unhandled entity is kept forever, so 'enqueue it now, wire it later'
 *    builds an unbounded queue on the user's device."
 *  - `TaskDraftAcceptWritePayload` records why no handler can exist: "a draft
 *    edit with no accept has no server destination and is deliberately NOT
 *    journalled."
 *  - `statusVocabulary.ts` classifies it with the writes that have "no
 *    device-durable home and no re-send path".
 *
 * A journal entry is a PROMISE TO THE ACCOUNT. A pending draft is not a
 * promise to anything: the user has not decided yet, and there is no row for
 * it to become until they do. Journaling it would put an entry in a FIFO queue
 * that no handler can ever drain, where it would be counted as `skipped` on
 * every replay for the life of the device — and it would make the "LifeOS will
 * add it to your account" sentence attach to work that is going nowhere.
 *
 * So this is a different tier with a different contract:
 *
 *  | | pending-writes journal | this draft store |
 *  |---|---|---|
 *  | holds | writes owed to the account | work in progress |
 *  | drained by | `replayDurableWrites` | nothing, ever |
 *  | removed when | the account took it | never — a decision is kept as the draft's status |
 *  | ordering | strict FIFO, by `seq` | none needed — no replay |
 *  | key | `seq`, `client_write_id` indexed | the draft's own id |
 *
 * Because nothing replays, none of the journal's hard-won ordering machinery
 * applies: the store is keyed by the draft id and last-write-wins, which is
 * exactly right for a record whose only reader is the next mount.
 *
 * The moment a draft IS accepted it becomes a real `task_draft_accept`
 * journal entry (#778) — the two tiers hand over at the decision. What stays
 * here is only the record that the draft was decided (bug hunts #8 and #12),
 * never an undecided copy, so no work lives in both. Decided records are not
 * pruned yet; each is one small draft object.
 *
 * ## Conventions
 *
 * Mirrored from `pendingWriteJournal.ts` and `lib/capture/offlineQueue.ts`:
 * promise-wrapped IndexedDB callbacks, no runtime dependency beyond the
 * browser's `indexedDB` global (tests polyfill it with `fake-indexeddb`).
 *
 * No-IndexedDB behavior (SSR / private mode / a blocking extension): reads
 * degrade to "nothing stored". Writes THROW, on the same reasoning the journal
 * gives: the caller must be able to tell the user their work is only in this
 * tab rather than silently implying otherwise. `WorkflowContext` catches that
 * throw into the same `storage: "blocked"` banner the `sessionStorage` mirror
 * already raises.
 */

import type { Phase2TaskDraft } from "@lifeos/schemas";
import { isUnownedWorkflowScope } from "./deviceAccount";

const DB_NAME = "lifeos-triage-drafts";
const DB_VERSION = 1;
const STORE_NAME = "drafts";

/**
 * One stored draft. `saved_at` is diagnostic only — nothing orders or expires
 * on it, because nothing replays this store.
 */
export interface StoredTaskDraft {
  id: string;
  scope?: string;
  claimedTo?: string;
  draft?: Phase2TaskDraft;
  saved_at: string;
}

function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Failed to open the draft store."));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Draft-store request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Draft-store transaction failed."));
    transaction.onabort = () =>
      reject(
        transaction.error ?? new Error("Draft-store transaction aborted."),
      );
  });
}

/**
 * Every draft in this ownership scope. Omitting scope reads legacy/demo rows.
 * Order is unspecified and no caller may
 * depend on it: the reducer keys drafts by id, and there is no replay to
 * sequence.
 */
export async function listStoredTaskDrafts(
  scope?: string,
): Promise<Phase2TaskDraft[]> {
  if (!hasIndexedDb()) {
    return [];
  }

  const db = await openDatabase();
  try {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const records = await requestToPromise(
      transaction.objectStore(STORE_NAME).getAll() as IDBRequest<
        StoredTaskDraft[]
      >,
    );
    await transactionDone(transaction);
    return records.flatMap((record) =>
      record?.draft && typeof record.id === "string" && record.scope === scope
        ? [record.draft]
        : [],
    );
  } finally {
    db.close();
  }
}

export async function storedTaskDraftCount(): Promise<number> {
  if (!hasIndexedDb()) {
    return 0;
  }

  const db = await openDatabase();
  try {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const records = await requestToPromise(
      transaction.objectStore(STORE_NAME).getAll() as IDBRequest<
        StoredTaskDraft[]
      >,
    );
    await transactionDone(transaction);
    return records.filter((record) => record.draft).length;
  } finally {
    db.close();
  }
}

/**
 * Save `drafts` to the device: upsert each one, by id.
 *
 * ## Never remove by absence (bug hunt #12)
 *
 * Every open LifeOS tab calls this with ITS OWN drafts. This used to delete
 * every stored draft not in the list, so two open tabs erased each other's
 * pending drafts: close one and its sort results and edits were gone. A
 * draft that one tab does not hold is not a draft the user decided about.
 *
 * ## A decision is final (bug hunt #8)
 *
 * The caller passes decided drafts (accepted or rejected) too, and the
 * stored copy keeps that status, so a new tab knows the thought was already
 * sorted. Once a stored draft is decided, an undecided copy of it (another
 * tab's older state) never overwrites it.
 *
 * ONE TRANSACTION for the read and the writes, so a tab that dies mid-write
 * cannot leave a half-applied set.
 *
 * THE CALLER MUST NOT CALL THIS BEFORE `listStoredTaskDrafts` HAS RESOLVED:
 * an older pending copy written first would be harmless now, but the restore
 * is still what brings this device's drafts into a fresh tab.
 */
export async function reconcileStoredTaskDrafts(
  drafts: readonly Phase2TaskDraft[],
  scope?: string,
): Promise<void> {
  if (!hasIndexedDb()) {
    throw new Error(
      "Cannot save this draft: IndexedDB is unavailable in this environment.",
    );
  }

  const savedAt = new Date().toISOString();

  const db = await openDatabase();
  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    // Read INSIDE the transaction. Awaiting a promise settled from an
    // IndexedDB success callback resumes on a microtask, which runs before
    // the transaction can auto-commit, so the read and the writes stay
    // atomic (the same idiom `enqueuePendingWrite` uses).
    const existing = await requestToPromise(
      store.getAll() as IDBRequest<StoredTaskDraft[]>,
    );
    const decided = new Set(
      existing
        .filter((record) => record?.draft && record.draft.status !== "pending")
        .map((record) => record.id),
    );
    const claimed = new Set(
      existing.filter((record) => record.claimedTo).map((record) => record.id),
    );

    for (const draft of drafts) {
      const id =
        scope === undefined ? draft.id : JSON.stringify([scope, draft.id]);
      if (claimed.has(id)) continue;
      if (draft.status === "pending" && decided.has(id)) continue;
      store.put({ id, scope, draft, saved_at: savedAt } as StoredTaskDraft);
    }

    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

/** Claim only explicitly scoped new anonymous work; legacy rows stay held.
 * Tombstones prevent a retiring tab's late mirror from resurrecting it.
 */
let anonymousClaimTail: Promise<void> = Promise.resolve();

export function claimAnonymousTaskDrafts(
  accountScope: string,
  reservedOwners: Readonly<Record<string, string>> = {},
): Promise<void> {
  const claim = anonymousClaimTail.then(() =>
    claimAnonymousTaskDraftsOnce(accountScope, reservedOwners),
  );
  anonymousClaimTail = claim.catch(() => {});
  return claim;
}

async function claimAnonymousTaskDraftsOnce(
  accountScope: string,
  reservedOwners: Readonly<Record<string, string>>,
): Promise<void> {
  if (!hasIndexedDb()) return;
  const db = await openDatabase();
  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const records = await requestToPromise(
      store.getAll() as IDBRequest<StoredTaskDraft[]>,
    );
    const byId = new Map(records.map((record) => [record.id, record]));
    for (const record of records) {
      if (
        !record.draft ||
        !record.scope ||
        !isUnownedWorkflowScope(record.scope)
      )
        continue;
      const owner = reservedOwners[record.scope] ?? accountScope;
      const id = JSON.stringify([owner, record.draft.id]);
      if (!byId.has(id)) store.put({ ...record, id, scope: owner });
      store.put({ id: record.id, scope: record.scope, claimedTo: owner });
    }
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

/** Drop everything. Used by tests and by a full reset of the workflow state. */
export async function clearStoredTaskDrafts(): Promise<void> {
  if (!hasIndexedDb()) {
    return;
  }

  const db = await openDatabase();
  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).clear();
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}
