import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPendingWrites,
  enqueuePendingWrite,
  generateClientWriteId,
  listPendingWrites,
  markPendingWriteSynced,
  pendingWriteCount,
  replayPendingWrites,
  type PendingWrite,
} from "./pendingWriteJournal";

/**
 * #737-A slice 1: the device-local pending-writes journal kernel.
 *
 * Mirrors `lib/capture/offlineQueue.test.ts`: `fake-indexeddb/auto` polyfills
 * the global `indexedDB`, and each test deletes the database first so state
 * never leaks. The "survives a fresh DB open" test deliberately does NOT
 * delete between the enqueue and the later read — that is the whole point of
 * the journal, standing in for a real tab close and reopen.
 */

async function freshDatabase(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("lifeos-pending-writes");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

beforeEach(async () => {
  await freshDatabase();
});

describe("enqueuePendingWrite / listPendingWrites", () => {
  it("enqueues a write and lists it with a generated id and the right fields", async () => {
    const queued = await enqueuePendingWrite({
      entity: "win",
      payload: { title: "shipped the journal", source_task_id: "task-1" },
    });

    expect(queued.client_write_id).toEqual(expect.any(String));
    expect(queued.client_write_id.length).toBeGreaterThan(0);
    expect(queued.entity).toBe("win");
    expect(queued.payload).toEqual({
      title: "shipped the journal",
      source_task_id: "task-1",
    });
    expect(queued.created_at).toEqual(expect.any(String));

    const pending = await listPendingWrites();
    expect(pending).toEqual([queued]);
  });

  it("honours a caller-supplied client_write_id so a retry is idempotent", async () => {
    const id = generateClientWriteId();

    await enqueuePendingWrite({
      entity: "rollup",
      payload: { period_type: "week" },
      clientWriteId: id,
    });
    await enqueuePendingWrite({
      entity: "rollup",
      payload: { period_type: "week" },
      clientWriteId: id,
    });

    const pending = await listPendingWrites();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.client_write_id).toBe(id);
  });

  it("generates distinct ids for distinct writes", async () => {
    const first = await enqueuePendingWrite({ entity: "win", payload: {} });
    const second = await enqueuePendingWrite({ entity: "win", payload: {} });

    expect(first.client_write_id).not.toBe(second.client_write_id);
    expect(await pendingWriteCount()).toBe(2);
  });

  it("returns writes in created_at order regardless of insertion order", async () => {
    // Pin the clock, but fake ONLY `Date`: `fake-indexeddb` dispatches its
    // request/transaction events through the real timer queue, so a full
    // `vi.useFakeTimers()` freezes every IndexedDB call in this file.
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-03-02T10:00:00.000Z"));
      const later = await enqueuePendingWrite({
        entity: "review",
        payload: { line: "second" },
      });
      vi.setSystemTime(new Date("2026-03-01T10:00:00.000Z"));
      const earlier = await enqueuePendingWrite({
        entity: "review",
        payload: { line: "first" },
      });

      const pending = await listPendingWrites();
      expect(pending.map((write) => write.client_write_id)).toEqual([
        earlier.client_write_id,
        later.client_write_id,
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("filters by entity when one is given", async () => {
    await enqueuePendingWrite({ entity: "win", payload: { title: "a" } });
    await enqueuePendingWrite({ entity: "rollup", payload: { title: "b" } });

    const wins = await listPendingWrites("win");
    expect(wins).toHaveLength(1);
    expect(wins[0]?.entity).toBe("win");
    expect(await pendingWriteCount("rollup")).toBe(1);
  });
});

describe("durability", () => {
  it("keeps a queued write across a fresh database open (tab close and reopen)", async () => {
    const queued = await enqueuePendingWrite({
      entity: "first_tiny_step",
      payload: { task_id: "task-9", first_tiny_step: "open the file" },
    });

    // No freshDatabase() here: every call above opened and closed its own
    // connection, so this read is a new JS-session read of persisted data.
    const pending = await listPendingWrites();
    expect(pending).toEqual([queued]);
  });
});

describe("markPendingWriteSynced / clearPendingWrites", () => {
  it("removes only the synced write", async () => {
    const first = await enqueuePendingWrite({ entity: "win", payload: {} });
    const second = await enqueuePendingWrite({ entity: "rollup", payload: {} });

    await markPendingWriteSynced(first.client_write_id);

    const pending = await listPendingWrites();
    expect(pending.map((write) => write.client_write_id)).toEqual([
      second.client_write_id,
    ]);
  });

  it("is a no-op for an unknown id", async () => {
    await enqueuePendingWrite({ entity: "win", payload: {} });
    await expect(
      markPendingWriteSynced("not-a-queued-id"),
    ).resolves.toBeUndefined();
    expect(await pendingWriteCount()).toBe(1);
  });

  it("clearPendingWrites empties the journal", async () => {
    await enqueuePendingWrite({ entity: "win", payload: {} });
    await enqueuePendingWrite({ entity: "rollup", payload: {} });

    await clearPendingWrites();

    expect(await listPendingWrites()).toEqual([]);
    expect(await pendingWriteCount()).toBe(0);
  });
});

describe("replayPendingWrites", () => {
  it("dispatches each write to its entity handler in created_at order and clears the synced ones", async () => {
    const seen: string[] = [];
    const first = await enqueuePendingWrite({
      entity: "win",
      payload: { title: "one" },
    });
    const second = await enqueuePendingWrite({
      entity: "rollup",
      payload: { title: "two" },
    });

    const summary = await replayPendingWrites({
      win: async (write) => {
        seen.push(`win:${write.client_write_id}`);
      },
      rollup: async (write) => {
        seen.push(`rollup:${write.client_write_id}`);
      },
    });

    expect(seen).toEqual([
      `win:${first.client_write_id}`,
      `rollup:${second.client_write_id}`,
    ]);
    expect(summary).toEqual({ synced: 2, failed: 0, skipped: 0 });
    expect(await listPendingWrites()).toEqual([]);
  });

  it("keeps a failed write queued and still replays the rest (fault isolation)", async () => {
    const failing = await enqueuePendingWrite({
      entity: "win",
      payload: { title: "boom" },
    });
    const healthy = await enqueuePendingWrite({
      entity: "rollup",
      payload: { title: "fine" },
    });

    const summary = await replayPendingWrites({
      win: async () => {
        throw new Error("server refused the win");
      },
      rollup: async () => {},
    });

    expect(summary).toEqual({ synced: 1, failed: 1, skipped: 0 });
    const pending = await listPendingWrites();
    expect(pending.map((write) => write.client_write_id)).toEqual([
      failing.client_write_id,
    ]);
    expect(healthy.client_write_id).not.toBe(failing.client_write_id);
  });

  it("leaves a write with no registered handler queued rather than dropping it", async () => {
    const orphan = await enqueuePendingWrite({
      entity: "review",
      payload: { line: "no handler yet" },
    });

    const summary = await replayPendingWrites({ win: async () => {} });

    expect(summary).toEqual({ synced: 0, failed: 0, skipped: 1 });
    const pending = await listPendingWrites();
    expect(pending.map((write) => write.client_write_id)).toEqual([
      orphan.client_write_id,
    ]);
  });

  it("hands the whole record to the handler so the id can be the server idempotency key", async () => {
    const queued = await enqueuePendingWrite({
      entity: "win",
      payload: { title: "idempotent" },
    });
    let received: PendingWrite | null = null;

    await replayPendingWrites({
      win: async (write) => {
        received = write;
      },
    });

    expect(received).toEqual(queued);
  });

  it("reports an empty journal as a zero-work replay", async () => {
    expect(await replayPendingWrites({ win: async () => {} })).toEqual({
      synced: 0,
      failed: 0,
      skipped: 0,
    });
  });
});

describe("no IndexedDB (SSR / unsupported browser)", () => {
  const globalWithIdb = globalThis as { indexedDB?: IDBFactory };

  function withoutIndexedDb<T>(run: () => Promise<T>): Promise<T> {
    const original = globalWithIdb.indexedDB;
    // Deliberately removing the global to exercise the SSR / unsupported path.
    delete globalWithIdb.indexedDB;
    return run().finally(() => {
      globalWithIdb.indexedDB = original;
    });
  }

  it("fails loudly on enqueue rather than silently dropping the write", async () => {
    await withoutIndexedDb(async () => {
      await expect(
        enqueuePendingWrite({ entity: "win", payload: {} }),
      ).rejects.toThrow(/IndexedDB is unavailable/i);
    });
  });

  it("degrades gracefully on reads and clears", async () => {
    await withoutIndexedDb(async () => {
      expect(await listPendingWrites()).toEqual([]);
      expect(await pendingWriteCount()).toBe(0);
      await expect(markPendingWriteSynced("x")).resolves.toBeUndefined();
      await expect(clearPendingWrites()).resolves.toBeUndefined();
      expect(await replayPendingWrites({ win: async () => {} })).toEqual({
        synced: 0,
        failed: 0,
        skipped: 0,
      });
    });
  });
});
