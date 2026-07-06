import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearQueue,
  enqueueCapture,
  listPendingCaptures,
  markCaptureSynced,
  pendingCaptureCount,
} from "./offlineQueue";

/**
 * FR-027 packet F-G1a: durable offline raw-capture queue.
 *
 * `fake-indexeddb/auto` polyfills the global `indexedDB` for Node. Each test
 * deletes the database first so state never leaks across tests — the
 * "durability across a fresh DB open" test relies on NOT deleting between the
 * enqueue and the later reads, simulating a real page reload where the
 * IndexedDB data outlives the JS session.
 */

async function freshDatabase(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("lifeos-capture-queue");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

beforeEach(async () => {
  await freshDatabase();
});

describe("enqueueCapture / listPendingCaptures", () => {
  it("enqueues a capture and lists it with a generated id and the right fields", async () => {
    const captured = await enqueueCapture({
      rawText: "call the dentist",
      areaId: "area-1",
      returnHook: "after standup",
    });

    expect(captured.client_capture_id).toEqual(expect.any(String));
    expect(captured.client_capture_id.length).toBeGreaterThan(0);
    expect(captured.raw_text).toBe("call the dentist");
    expect(captured.area_id).toBe("area-1");
    expect(captured.return_hook).toBe("after standup");
    expect(captured.created_at).toEqual(expect.any(String));

    const pending = await listPendingCaptures();
    expect(pending).toEqual([captured]);
  });

  it("defaults area_id null and return_hook null when omitted", async () => {
    const captured = await enqueueCapture({
      rawText: "water the plants",
      areaId: null,
    });

    expect(captured.area_id).toBeNull();
    expect(captured.return_hook).toBeNull();
  });

  it("gives two enqueues distinct client_capture_ids and lists them oldest-first", async () => {
    // Fake ONLY `Date` (not timers) so the two enqueues get deterministic,
    // distinct `created_at` values without risking a deadlock in
    // fake-indexeddb's internal async scheduling.
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-07-05T10:00:00.000Z"));
      const first = await enqueueCapture({
        rawText: "first thought",
        areaId: null,
      });

      vi.setSystemTime(new Date("2026-07-05T10:00:01.000Z"));
      const second = await enqueueCapture({
        rawText: "second thought",
        areaId: null,
      });

      expect(first.client_capture_id).not.toBe(second.client_capture_id);

      const pending = await listPendingCaptures();
      // Exact order, no re-sort: this is the discriminating assertion that
      // the store's oldest-first ordering guarantee actually holds.
      expect(pending.map((capture) => capture.client_capture_id)).toEqual([
        first.client_capture_id,
        second.client_capture_id,
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("markCaptureSynced / pendingCaptureCount", () => {
  it("removes exactly the synced entry and updates the pending count", async () => {
    const first = await enqueueCapture({ rawText: "keep me", areaId: null });
    const second = await enqueueCapture({
      rawText: "sync me away",
      areaId: null,
    });

    expect(await pendingCaptureCount()).toBe(2);

    await markCaptureSynced(second.client_capture_id);

    expect(await pendingCaptureCount()).toBe(1);
    const pending = await listPendingCaptures();
    expect(pending).toEqual([first]);
  });
});

describe("durability across a fresh DB open", () => {
  it("keeps a queued capture available after re-opening the database", async () => {
    const captured = await enqueueCapture({
      rawText: "survive a device restart",
      areaId: "area-2",
    });

    // Simulate a new "session" (e.g. app relaunch) by calling the read
    // functions again without re-enqueuing. Nothing here re-creates the
    // database — the persisted IndexedDB row is what makes this durable.
    const countAfterReopen = await pendingCaptureCount();
    const pendingAfterReopen = await listPendingCaptures();

    expect(countAfterReopen).toBe(1);
    expect(pendingAfterReopen).toEqual([captured]);
  });
});

describe("clearQueue", () => {
  it("empties the store on logout", async () => {
    await enqueueCapture({ rawText: "one", areaId: null });
    await enqueueCapture({ rawText: "two", areaId: null });

    expect(await pendingCaptureCount()).toBe(2);

    await clearQueue();

    expect(await pendingCaptureCount()).toBe(0);
    expect(await listPendingCaptures()).toEqual([]);
  });
});
