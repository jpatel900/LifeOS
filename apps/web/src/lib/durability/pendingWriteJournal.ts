/**
 * #737-A slice 1: the device-local pending-writes journal.
 *
 * Pure module — no React, no Supabase, no network. Deliberately NOT wired into
 * `WorkflowContext` or any UI in this slice; wiring and the server-side
 * idempotency indexes land in later slices.
 *
 * ## Why this exists (inventory evidence, all verified on a running build)
 *
 * `WorkflowContext` mirrors the whole reducer state to `sessionStorage` on
 * every change (`WorkflowContext.tsx:824`) and restores it at mount (`:740`).
 * That is why work survives a page reload — but `sessionStorage` is scoped to
 * ONE TAB. Probed on a dev build: a capture made in tab A is present after a
 * hard reload of tab A and absent in a freshly opened tab B, while an
 * IndexedDB-queued offline capture is visible from BOTH. Wins and rollups are
 * worse still: they never enter the reducer state at all, so no device store
 * holds them — `confirmWin` returns early when there is no Supabase client
 * (`WorkflowContext.tsx:432`), and its fallback banner says the win "is saved
 * on this device" when nothing was saved anywhere.
 *
 * This journal is the missing device-durable tier: the same durability the
 * raw-capture queue already gives captures, generalised to every other user
 * write. One database, one store, carrying a unique `client_write_id` per
 * record — the idempotency key a later slice will send to the server so a
 * replayed write never double-creates a row. (Ordering is a separate concern;
 * see the FIFO section below for why that id is an index, not the key.)
 *
 * ## Why one generic journal rather than a copy of the capture queue per entity
 *
 * The inventory found 7 distinct write shapes with no device-durable home at
 * all (wins, rollups, task-map drafts, first-tiny-step edits, draft
 * edit/split/merge/reject, project-draft decisions, WIP swaps) — 12 once you
 * count the ops that additionally become device-only whenever the account is
 * unreachable (plans, reviews, proposal decisions, task transitions,
 * execution-session outcomes). Copying `offlineQueue.ts` per entity would mean
 * 7 near-identical IndexedDB modules and 7 replay paths to keep in step. One
 * store with a typed `entity` discriminator and a handler-map dispatcher
 * carries all of them with a single durability contract.
 *
 * ## Ordering is FIFO, and the storage mechanism guarantees it
 *
 * Replay MUST be strictly first-in-first-out: journalled writes can depend on
 * each other (edit a draft, then accept it), and replaying them out of order
 * corrupts the result. Two weaker schemes were tried and rejected:
 *
 * - **Keying the store by `client_write_id`.** `getAll()` returns primary-key
 *   order, and those ids are random UUIDs, so replay order was UUID-
 *   lexicographic — i.e. random. CI caught this as a flaky test; it was a real
 *   ordering bug, not a flaky assertion.
 * - **Sorting by `created_at`.** ISO timestamps have millisecond resolution,
 *   so two writes in the same tick tie, and any tie-break by random id is
 *   random again.
 *
 * So the store is keyed by an **auto-increment `seq`**, with
 * `client_write_id` as a **unique index**. `getAll()` is therefore already in
 * insertion order and needs no sort. Re-enqueueing an existing
 * `client_write_id` reuses its stored `seq`, so an idempotent retry updates
 * the record in place without jumping the queue.
 *
 * ## Conventions (mirrored from `lib/capture/offlineQueue.ts`)
 *
 * Promise-wrapped IndexedDB request/transaction callbacks so callers use plain
 * async/await; no runtime dependency beyond the browser's global `indexedDB`
 * (tests polyfill it with `fake-indexeddb`).
 *
 * No-IndexedDB behavior (SSR / unsupported browsers): reads, deletes, clears
 * and replay degrade gracefully (a store that does not exist trivially holds
 * no pending writes). `enqueuePendingWrite` instead throws a descriptive
 * `Error` — silently dropping a write the user believes was saved is the exact
 * data-loss bug this module exists to end, so the write path fails loudly.
 *
 * The capture queue is intentionally left untouched: it already works, and it
 * owns a different lifecycle (offline raw capture, drained by
 * `syncOfflineQueue`).
 */

const DB_NAME = "lifeos-pending-writes";
/**
 * v2 replaced a v1 store keyed by `client_write_id` (see the FIFO note above).
 * v1 was never wired into any UI, so no user data can exist in it and the
 * upgrade recreates the store outright rather than migrating rows.
 */
const DB_VERSION = 2;
const STORE_NAME = "pending";
const CLIENT_WRITE_ID_INDEX = "by_client_write_id";

/**
 * The write shapes the inventory found with no device-durable home. Listing
 * them as a union (rather than a bare `string`) keeps a typo from silently
 * creating an entity no replay handler will ever match. Entities are added
 * here as later slices wire them; an entity with no registered handler is
 * *kept queued*, never dropped.
 */
export type PendingWriteEntity =
  | "win"
  | "rollup"
  | "review"
  | "first_tiny_step"
  | "draft_edit"
  | "project_draft_decision"
  | "wip_swap"
  | "task_map_approval"
  // #737 C1 card 1 (slice S4): the outcome the user picked in the end sheet.
  // The ONLY execution-session write there is — a running session carries no
  // outcome and is device state, never a journal entry.
  | "execution_session"
  // #737 C1 slice S3: a block the user put on the day. Covers BOTH placement
  // paths (`planTaskAtHour` and `acceptLocalProposal`) because they produce the
  // same thing — one scheduled block — and differ only in whether the account
  // already holds a proposal row for it.
  | "plan_placement"
  // #737 C1 slice S3: a triage draft the user accepted, to today or to the
  // backlog. The payload carries the draft AS EDITED, which is what makes an
  // edit-then-accept durable; a draft edit with no accept has no server
  // destination and is deliberately NOT journalled (see `durableWrites.ts`).
  // #737 C1 re-score GAP 3: that undecided draft is device-durable all the
  // same — in `durability/draftStore.ts`, a store this journal never touches,
  // because holding work in progress and owing a row to the account are two
  // different jobs.
  | "task_draft_accept"
  // #737 C1 slice S5 — THE COMPENSATING ACTIONS. Both undo a write that may
  // still be queued, and both are journalled for the same reason the write
  // they undo is: an undo the user made offline must survive the tab, or the
  // reconnect delivers a write the user already took back (#778's disclosed
  // resurrection). See `SUPERSEDES_KEY` in `durableWrites.ts` for how a
  // compensating entry cancels its target.
  | "plan_unplacement"
  | "task_drop"
  // #960 defect 3: a raw capture whose account write could not be resolved at
  // the moment it was made (a client existed but the area id, or the
  // account itself, had not synced yet). Previously `persistCapture` simply
  // dropped these — `markLocalOnly` and returned, with no device-durable
  // record anywhere. See `durableWrites.ts`'s `CaptureWritePayload`.
  | "capture";

export type PendingWritePayload = Record<string, unknown>;

export interface PendingWrite<
  TPayload extends PendingWritePayload = PendingWritePayload,
> {
  /**
   * Auto-increment primary key and the ONLY ordering authority. Assigned by
   * IndexedDB at first enqueue; a re-enqueue under the same
   * `client_write_id` keeps its original `seq`, so a retry never jumps the
   * queue. Never set this by hand.
   */
  seq: number;
  /**
   * Unique index, and the idempotency key a later slice sends to the server.
   * Deliberately NOT the primary key — see the FIFO note in the file header.
   */
  client_write_id: string;
  entity: PendingWriteEntity;
  payload: TPayload;
  created_at: string;
}

/** Replays one journalled write. Throwing keeps the record queued. */
export type PendingWriteHandler = (write: PendingWrite) => Promise<void>;

export type PendingWriteHandlers = Partial<
  Record<PendingWriteEntity, PendingWriteHandler>
>;

export interface ReplaySummary {
  /** Handled successfully and removed from the journal. */
  synced: number;
  /** Handler threw; the record stays queued for the next replay. */
  failed: number;
  /** No handler registered for the entity; the record stays queued. */
  skipped: number;
}

/** True when the browser's IndexedDB global is present and usable. */
function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME);
      }
      const store = db.createObjectStore(STORE_NAME, {
        keyPath: "seq",
        autoIncrement: true,
      });
      store.createIndex(CLIENT_WRITE_ID_INDEX, "client_write_id", {
        unique: true,
      });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        request.error ?? new Error("Failed to open pending-writes database."),
      );
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });
}

/** Fresh unique id for a journalled write (also the sync idempotency key). */
export function generateClientWriteId(): string {
  return crypto.randomUUID();
}

/**
 * Journal one write. Pass `clientWriteId` to make a retry idempotent — the
 * same id overwrites its own record instead of queueing a duplicate.
 */
export async function enqueuePendingWrite<
  TPayload extends PendingWritePayload = PendingWritePayload,
>(input: {
  entity: PendingWriteEntity;
  payload: TPayload;
  clientWriteId?: string;
}): Promise<PendingWrite<TPayload>> {
  if (!hasIndexedDb()) {
    throw new Error(
      "Cannot journal a write: IndexedDB is unavailable in this environment.",
    );
  }

  const clientWriteId = input.clientWriteId ?? generateClientWriteId();
  const fields = {
    client_write_id: clientWriteId,
    entity: input.entity,
    payload: input.payload,
    created_at: new Date().toISOString(),
  };

  const db = await openDatabase();
  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    // Look up any existing record for this client id INSIDE the same
    // transaction. Awaiting a promise settled from an IndexedDB success
    // callback resumes on a microtask, which runs before the transaction can
    // auto-commit, so the read and the write stay atomic.
    const existing = await requestToPromise(
      store.index(CLIENT_WRITE_ID_INDEX).get(clientWriteId) as IDBRequest<
        PendingWrite<TPayload> | undefined
      >,
    );

    // A retry of the same logical write keeps its original queue position:
    // reuse the stored `seq` rather than appending a fresh one, so replay
    // order still reflects when the user first made the change.
    const seq = existing
      ? existing.seq
      : ((await requestToPromise(store.add(fields))) as number);

    if (existing) {
      store.put({ ...fields, seq });
    }

    await transactionDone(transaction);
    return { ...fields, seq };
  } finally {
    db.close();
  }
}

/**
 * All journalled writes in strict insertion (FIFO) order, optionally narrowed
 * to one entity.
 *
 * `getAll()` returns records in primary-key order, and the primary key is the
 * auto-increment `seq`, so this order IS the order the writes were made. No
 * post-sort: `created_at` has millisecond resolution and cannot separate two
 * writes made in the same tick.
 */
export async function listPendingWrites(
  entity?: PendingWriteEntity,
): Promise<PendingWrite[]> {
  if (!hasIndexedDb()) {
    return [];
  }

  const db = await openDatabase();
  try {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const writes = await requestToPromise(
      store.getAll() as IDBRequest<PendingWrite[]>,
    );
    await transactionDone(transaction);

    return writes.filter(
      (write) => entity === undefined || write.entity === entity,
    );
  } finally {
    db.close();
  }
}

/** Drop one journalled write once its server write has landed. */
export async function markPendingWriteSynced(
  clientWriteId: string,
): Promise<void> {
  if (!hasIndexedDb()) {
    return;
  }

  const db = await openDatabase();
  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    // `client_write_id` is an index now, not the primary key, so resolve it to
    // the `seq` key before deleting. An unknown id resolves to undefined and
    // the delete is skipped (documented no-op).
    const seq = await requestToPromise(
      store.index(CLIENT_WRITE_ID_INDEX).getKey(clientWriteId),
    );
    if (seq !== undefined) {
      store.delete(seq);
    }
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function pendingWriteCount(
  entity?: PendingWriteEntity,
): Promise<number> {
  if (!hasIndexedDb()) {
    return 0;
  }

  if (entity !== undefined) {
    return (await listPendingWrites(entity)).length;
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

export async function clearPendingWrites(): Promise<void> {
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

/**
 * Replay the journal through per-entity handlers, oldest write first.
 *
 * Fault-isolated per item, exactly like `syncOfflineQueue`: a handler that
 * throws leaves its record queued for the next replay and does not stop the
 * remaining writes. A record whose entity has no registered handler is
 * reported as `skipped` and also stays queued — an unwired entity must never
 * be silently discarded.
 */
export async function replayPendingWrites(
  handlers: PendingWriteHandlers,
): Promise<ReplaySummary> {
  const summary: ReplaySummary = { synced: 0, failed: 0, skipped: 0 };
  const writes = await listPendingWrites();

  for (const write of writes) {
    const handler = handlers[write.entity];
    if (!handler) {
      summary.skipped += 1;
      continue;
    }

    try {
      await handler(write);
      await markPendingWriteSynced(write.client_write_id);
      summary.synced += 1;
    } catch {
      summary.failed += 1;
    }
  }

  return summary;
}
