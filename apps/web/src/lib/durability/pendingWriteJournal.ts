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
 * write. One database, one store, keyed by `client_write_id` — which is also
 * the idempotency key a later slice will send to the server so a replayed
 * write never double-creates a row.
 *
 * ## Why one generic journal rather than a copy of the capture queue per entity
 *
 * The inventory found 8+ distinct write shapes with no device-durable home
 * (wins, rollups, first-tiny-step edits, draft edit/split/merge/reject,
 * project-draft decisions, WIP swaps, task-map approvals, and every op above
 * whenever the account is unreachable). Copying `offlineQueue.ts` per entity
 * would mean 8 near-identical IndexedDB modules and 8 replay paths to keep in
 * step. One store with a typed `entity` discriminator and a handler-map
 * dispatcher carries all of them with a single durability contract.
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
const DB_VERSION = 1;
const STORE_NAME = "pending";

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
  | "task_map_approval";

export type PendingWritePayload = Record<string, unknown>;

export interface PendingWrite<
  TPayload extends PendingWritePayload = PendingWritePayload,
> {
  /** Primary key, and the idempotency key a later slice sends to the server. */
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
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "client_write_id" });
      }
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

  const write: PendingWrite<TPayload> = {
    client_write_id: input.clientWriteId ?? generateClientWriteId(),
    entity: input.entity,
    payload: input.payload,
    created_at: new Date().toISOString(),
  };

  const db = await openDatabase();
  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(write);
    await transactionDone(transaction);
  } finally {
    db.close();
  }

  return write;
}

/**
 * All journalled writes in `created_at` order (ties broken by id so the order
 * is stable), optionally narrowed to one entity.
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

    return writes
      .filter((write) => entity === undefined || write.entity === entity)
      .sort(
        (a, b) =>
          a.created_at.localeCompare(b.created_at) ||
          a.client_write_id.localeCompare(b.client_write_id),
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
    transaction.objectStore(STORE_NAME).delete(clientWriteId);
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
