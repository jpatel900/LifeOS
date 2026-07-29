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
 *  | removed when | the account took it | the user decided (accept/reject) |
 *  | ordering | strict FIFO, by `seq` | none needed — no replay |
 *  | key | `seq`, `client_write_id` indexed | the draft's own id |
 *
 * Because nothing replays, none of the journal's hard-won ordering machinery
 * applies: the store is keyed by the draft id and last-write-wins, which is
 * exactly right for a record whose only reader is the next mount.
 *
 * The moment a draft IS accepted it leaves this store and becomes a real
 * `task_draft_accept` journal entry (#778) — the two tiers hand over at the
 * decision, and nothing lives in both.
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

const DB_NAME = "lifeos-triage-drafts";
const DB_VERSION = 1;
const STORE_NAME = "drafts";

/**
 * One stored draft. `saved_at` is diagnostic only — nothing orders or expires
 * on it, because nothing replays this store.
 */
export interface StoredTaskDraft {
  id: string;
  draft: Phase2TaskDraft;
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
 * Every draft this device is holding. Order is unspecified and no caller may
 * depend on it: the reducer keys drafts by id, and there is no replay to
 * sequence.
 */
export async function listStoredTaskDrafts(): Promise<Phase2TaskDraft[]> {
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
    return records
      .filter((record) => record?.draft && typeof record.id === "string")
      .map((record) => record.draft);
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
    const count = await requestToPromise(
      transaction.objectStore(STORE_NAME).count(),
    );
    await transactionDone(transaction);
    return count;
  } finally {
    db.close();
  }
}

/**
 * Make the store match `drafts` exactly: upsert every one of them, and remove
 * every stored draft that is not in the list.
 *
 * ## Why removal is by absence, and why that is safe here
 *
 * A draft leaves the list for exactly one reason — the user decided about it.
 * `acceptDraft` and `rejectDraft` flip its status off `pending`, and the
 * caller passes only pending drafts, so "no longer in the list" and "no longer
 * undecided" are the same fact. There is no failure path that can drop a draft
 * from the reducer, which is what makes this different from the journal, where
 * absence could mean a delivery failure and removal therefore has to be
 * authorised (see `SUPERSEDES_KEY` in `durableWrites.ts`).
 *
 * ONE TRANSACTION for both halves, so a tab that dies mid-write cannot leave
 * the store holding a draft the user already accepted alongside one they have
 * not seen yet.
 *
 * THE CALLER MUST NOT CALL THIS BEFORE `listStoredTaskDrafts` HAS RESOLVED.
 * A fresh tab's reducer holds no drafts until the restore lands; reconciling
 * against that empty state would delete the very drafts it is about to read.
 */
export async function reconcileStoredTaskDrafts(
  drafts: readonly Phase2TaskDraft[],
): Promise<void> {
  if (!hasIndexedDb()) {
    throw new Error(
      "Cannot save this draft: IndexedDB is unavailable in this environment.",
    );
  }

  const savedAt = new Date().toISOString();
  const keep = new Set(drafts.map((draft) => draft.id));

  const db = await openDatabase();
  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    // Read the existing keys INSIDE the transaction. Awaiting a promise
    // settled from an IndexedDB success callback resumes on a microtask, which
    // runs before the transaction can auto-commit, so the read and the writes
    // stay atomic (the same idiom `enqueuePendingWrite` uses).
    const existingKeys = await requestToPromise(store.getAllKeys());

    for (const key of existingKeys) {
      if (typeof key === "string" && !keep.has(key)) {
        store.delete(key);
      }
    }

    for (const draft of drafts) {
      store.put({ id: draft.id, draft, saved_at: savedAt } as StoredTaskDraft);
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
