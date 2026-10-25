import type { WorkflowState } from "../workflow/shared";

// A recovery copy is local work, never an outbound write. Like the draft
// store, IndexedDB commits it before the caller can claim durability.
const DATABASE = "lifeos-snapshot-recovery";
const STORE = "claims";
export interface SnapshotRecovery {
  id: string;
  scope: string;
  owner: string;
  state?: WorkflowState;
  unanchored?: boolean;
}

async function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    throw new Error(
      "Cannot verify snapshot ownership: IndexedDB is unavailable.",
    );
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Snapshot recovery is unavailable."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = transaction.onabort = () =>
      reject(
        transaction.error ?? new Error("Snapshot recovery did not commit."),
      );
  });
}

export async function listSnapshotRecoveries(): Promise<SnapshotRecovery[]> {
  const db = await openDatabase();
  try {
    const transaction = db.transaction(STORE, "readonly");
    const done = transactionDone(transaction);
    const request = transaction.objectStore(STORE).getAll();
    await done;
    return request.result as SnapshotRecovery[];
  } finally {
    db.close();
  }
}

/** Atomic first-owner-wins, including concurrent tabs. Never replace an owner. */
export async function reserveSnapshotRecovery(
  record: SnapshotRecovery,
  merge: (target: WorkflowState, source: WorkflowState) => WorkflowState,
): Promise<SnapshotRecovery> {
  const db = await openDatabase();
  try {
    const transaction = db.transaction(STORE, "readwrite");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(STORE);
    const request = store.get(record.id);
    let reserved = record;
    request.onsuccess = () => {
      if (request.result) {
        reserved = request.result as SnapshotRecovery;
        if (reserved.owner === record.owner && reserved.state && record.state) {
          reserved = {
            ...reserved,
            state: merge(record.state, reserved.state),
          };
          store.put(reserved);
        }
      } else store.put(record);
    };
    await done;
    return reserved;
  } finally {
    db.close();
  }
}

export async function snapshotRecoveryId(
  scope: string,
  stored: string | null,
  state: WorkflowState,
): Promise<string> {
  const parsed = stored ? JSON.parse(stored) : null;
  if (typeof parsed?.snapshotClaimId === "string")
    return parsed.snapshotClaimId;
  // Legacy snapshots have no generation token. Anonymous hydration checks
  // this fingerprint before allowing a legacy source to be edited.
  const bytes = new TextEncoder().encode(
    JSON.stringify([scope, stored ?? state]),
  );
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/** Test isolation only. Product reset must retain ownership tombstones. */
export async function clearSnapshotRecoveriesForTests(): Promise<void> {
  const db = await openDatabase();
  try {
    const transaction = db.transaction(STORE, "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(STORE).clear();
    await done;
  } finally {
    db.close();
  }
}
