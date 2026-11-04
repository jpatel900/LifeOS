/**
 * FR-027 packet F-G1a: the device-local durable offline raw-capture queue.
 *
 * Pure module — no React, no Supabase, no network. A capture taken while
 * offline (or mid-flight when the device sleeps/closes) must survive until a
 * later reconnect-triggered sync can idempotently push it to the server. The
 * `client_capture_id` generated here is the idempotency key the (separate,
 * not-yet-wired) sync path will send to the server so a retried sync never
 * double-creates a capture.
 *
 * Storage: a single IndexedDB database (`lifeos-capture-queue`), a single
 * object store (`pending`) keyed by `client_capture_id`. All IndexedDB
 * request/transaction callbacks are wrapped in Promises so callers use plain
 * async/await. No runtime dependency beyond the browser's global `indexedDB`
 * (tests polyfill it with `fake-indexeddb`).
 *
 * No-IndexedDB behavior (SSR / unsupported browsers): reads are graceful
 * no-ops (`listPendingCaptures` → `[]`, `pendingCaptureCount` → `0`,
 * `clearQueue` → resolves immediately) because a missing store trivially has
 * no pending items and nothing to clear. `enqueueCapture` instead throws a
 * descriptive `Error` — silently dropping a capture the user believes was
 * saved would be a data-loss bug wearing a graceful-degradation costume, so
 * the write path fails loudly instead.
 */

const DB_NAME = "lifeos-capture-queue";
const DB_VERSION = 1;
const STORE_NAME = "pending";

export interface QueuedCapture {
  client_capture_id: string;
  raw_text: string;
  area_id: string | null;
  return_hook: string | null;
  created_at: string;
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
        db.createObjectStore(STORE_NAME, { keyPath: "client_capture_id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        request.error ?? new Error("Failed to open capture queue database."),
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

/** Fresh unique id for a queued capture (also the sync idempotency key). */
export function generateClientCaptureId(): string {
  return crypto.randomUUID();
}

export async function enqueueCapture(input: {
  rawText: string;
  areaId: string | null;
  returnHook?: string | null;
}): Promise<QueuedCapture> {
  if (!hasIndexedDb()) {
    throw new Error(
      "Cannot queue a capture: IndexedDB is unavailable in this environment.",
    );
  }

  const capture: QueuedCapture = {
    client_capture_id: generateClientCaptureId(),
    raw_text: input.rawText,
    area_id: input.areaId,
    return_hook: input.returnHook ?? null,
    created_at: new Date().toISOString(),
  };

  const db = await openDatabase();
  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(capture);
    await transactionDone(transaction);
  } finally {
    db.close();
  }

  return capture;
}

export async function listPendingCaptures(): Promise<QueuedCapture[]> {
  if (!hasIndexedDb()) {
    return [];
  }

  const db = await openDatabase();
  try {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const captures = await requestToPromise(
      store.getAll() as IDBRequest<QueuedCapture[]>,
    );
    await transactionDone(transaction);
    return [...captures].sort((a, b) =>
      a.created_at.localeCompare(b.created_at),
    );
  } finally {
    db.close();
  }
}

export async function markCaptureSynced(
  clientCaptureId: string,
): Promise<void> {
  if (!hasIndexedDb()) {
    return;
  }

  const db = await openDatabase();
  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(clientCaptureId);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function pendingCaptureCount(): Promise<number> {
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

export async function clearQueue(): Promise<void> {
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
