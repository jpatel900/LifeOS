import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  journalReviewWrite,
  journalWinWrite,
  createDurableWriteHandlers,
  replayDurableWrites,
  type DurableWriteServerOps,
} from "./durableWrites";
import { listPendingWrites, pendingWriteCount } from "./pendingWriteJournal";

/**
 * #737-A slice 2: the win/review durable-write dispatcher.
 *
 * Same conventions as `pendingWriteJournal.test.ts` — `fake-indexeddb/auto`
 * polyfills the global `indexedDB` and each test starts from a deleted
 * database. What this file adds on top of the kernel's tests is the *contract
 * between a user action and the account*:
 *
 *  1. the payload journalled at confirm time carries everything the replay
 *     needs, including the moment the user confirmed (never re-derived at
 *     replay time from a later clock),
 *  2. replay is exactly-once from the client's side — the handler runs, the
 *     entry is cleared, and a second replay finds nothing to send,
 *  3. a write whose persisted ids cannot be resolved yet stays queued rather
 *     than being dropped or sent with wrong ids.
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

/**
 * Deliberately a FIXED PAST DATE, and deliberately not `vi.useFakeTimers()`.
 *
 * Fake timers stall `fake-indexeddb` (its request callbacks never fire), so
 * the clock is pinned by choosing a date the real clock can never produce
 * instead. That makes the assertion stronger, not weaker: if any code path
 * re-derived the date from `new Date()` at journal or replay time, the value
 * would be today's date and every assertion below would fail.
 */
const CONFIRMED_ON = "2026-05-08";

const PERSISTED_AREA = "550e8400-e29b-41d4-a716-446655440101";
const PERSISTED_TASK = "550e8400-e29b-41d4-a716-446655440201";

function serverOps(overrides: Partial<DurableWriteServerOps> = {}) {
  return {
    syncWin: vi.fn().mockResolvedValue({ provider: "supabase" as const }),
    syncReview: vi.fn().mockResolvedValue({ provider: "supabase" as const }),
    ...overrides,
  };
}

describe("journalWinWrite", () => {
  it("journals the win before any network call, with the confirm-time date pinned", async () => {
    // The user confirmed the win on 2026-05-08. Replay may not run until days
    // later; the win must still be dated the day it happened.
    const journalled = await journalWinWrite({
      workflowTaskId: "task-local-1",
      persistedTaskId: PERSISTED_TASK,
      persistedAreaId: PERSISTED_AREA,
      title: "Shipped the onboarding flow",
      detail: null,
      occurredAt: CONFIRMED_ON,
    });

    const pending = await listPendingWrites("win");
    expect(pending).toHaveLength(1);
    expect(pending[0]!.client_write_id).toBe(journalled.client_write_id);
    expect(pending[0]!.payload).toMatchObject({
      workflow_task_id: "task-local-1",
      persisted_task_id: PERSISTED_TASK,
      persisted_area_id: PERSISTED_AREA,
      title: "Shipped the onboarding flow",
      occurred_at: CONFIRMED_ON,
    });
  });

  it("journals a win even when no persisted ids are known yet", async () => {
    // Signed out, or the area/task has not synced to the account. The old
    // behaviour returned early and wrote nothing anywhere.
    await journalWinWrite({
      workflowTaskId: "task-local-1",
      persistedTaskId: null,
      persistedAreaId: null,
      title: "Shipped the onboarding flow",
      detail: null,
      occurredAt: CONFIRMED_ON,
    });

    expect(await pendingWriteCount("win")).toBe(1);
  });
});

describe("journalReviewWrite", () => {
  it("journals the review with its period pinned at save time", async () => {
    await journalReviewWrite({
      persistedAreaId: PERSISTED_AREA,
      reviewType: "daily",
      periodStart: CONFIRMED_ON,
      periodEnd: CONFIRMED_ON,
      summaryJson: { verdict: "saved", open_tasks: 2 },
    });

    const pending = await listPendingWrites("review");
    expect(pending).toHaveLength(1);
    expect(pending[0]!.payload).toMatchObject({
      persisted_area_id: PERSISTED_AREA,
      review_type: "daily",
      period_start: CONFIRMED_ON,
      period_end: CONFIRMED_ON,
      summary_json: { verdict: "saved", open_tasks: 2 },
    });
  });
});

describe("replayDurableWrites", () => {
  it("sends a journalled win once, clears it, and sends nothing on a second replay", async () => {
    const ops = serverOps();
    await journalWinWrite({
      workflowTaskId: "task-local-1",
      persistedTaskId: PERSISTED_TASK,
      persistedAreaId: PERSISTED_AREA,
      title: "Shipped the onboarding flow",
      detail: null,
      occurredAt: CONFIRMED_ON,
    });

    const first = await replayDurableWrites(ops);
    expect(first).toMatchObject({ synced: 1, failed: 0, skipped: 0 });
    expect(ops.syncWin).toHaveBeenCalledTimes(1);
    expect(ops.syncWin).toHaveBeenCalledWith(
      expect.objectContaining({
        area_id: PERSISTED_AREA,
        source_task_id: PERSISTED_TASK,
        title: "Shipped the onboarding flow",
        occurred_at: CONFIRMED_ON,
      }),
    );
    expect(await pendingWriteCount("win")).toBe(0);

    // THE GUARD: replaying again must not re-send. Client-side exactly-once;
    // the server's (user_id, client_write_id) index is the second line.
    const second = await replayDurableWrites(ops);
    expect(second).toMatchObject({ synced: 0, failed: 0, skipped: 0 });
    expect(ops.syncWin).toHaveBeenCalledTimes(1);
  });

  it("sends the journal entry's own client_write_id as the idempotency key", async () => {
    const ops = serverOps();
    const journalled = await journalWinWrite({
      workflowTaskId: "task-local-1",
      persistedTaskId: PERSISTED_TASK,
      persistedAreaId: PERSISTED_AREA,
      title: "Shipped the onboarding flow",
      detail: null,
      occurredAt: CONFIRMED_ON,
    });

    await replayDurableWrites(ops);

    expect(ops.syncWin).toHaveBeenCalledWith(
      expect.objectContaining({
        client_write_id: journalled.client_write_id,
      }),
    );
  });

  it("sends a journalled review once and clears it", async () => {
    const ops = serverOps();
    await journalReviewWrite({
      persistedAreaId: PERSISTED_AREA,
      reviewType: "daily",
      periodStart: CONFIRMED_ON,
      periodEnd: CONFIRMED_ON,
      summaryJson: { verdict: "saved" },
    });

    const summary = await replayDurableWrites(ops);

    expect(summary).toMatchObject({ synced: 1 });
    expect(ops.syncReview).toHaveBeenCalledWith(
      expect.objectContaining({
        area_id: PERSISTED_AREA,
        review_type: "daily",
        period_start: CONFIRMED_ON,
        period_end: CONFIRMED_ON,
      }),
    );
    expect(await pendingWriteCount("review")).toBe(0);
  });

  it("keeps a write queued when the server call fails", async () => {
    const ops = serverOps({
      syncWin: vi.fn().mockRejectedValue(new Error("offline")),
    });
    await journalWinWrite({
      workflowTaskId: "task-local-1",
      persistedTaskId: PERSISTED_TASK,
      persistedAreaId: PERSISTED_AREA,
      title: "Shipped the onboarding flow",
      detail: null,
      occurredAt: CONFIRMED_ON,
    });

    const summary = await replayDurableWrites(ops);

    expect(summary).toMatchObject({ synced: 0, failed: 1 });
    expect(await pendingWriteCount("win")).toBe(1);
  });

  it("keeps a win queued when its persisted ids cannot be resolved yet", async () => {
    // Journalled while signed out: no persisted area or task exists. Sending
    // it with local workflow ids would write a wrong row, so it waits.
    const ops = serverOps();
    await journalWinWrite({
      workflowTaskId: "task-local-1",
      persistedTaskId: null,
      persistedAreaId: null,
      title: "Shipped the onboarding flow",
      detail: null,
      occurredAt: CONFIRMED_ON,
    });

    const summary = await replayDurableWrites(ops);

    expect(summary).toMatchObject({ synced: 0, failed: 1 });
    expect(ops.syncWin).not.toHaveBeenCalled();
    expect(await pendingWriteCount("win")).toBe(1);
  });

  it("resolves ids at replay time when the journal entry has none", async () => {
    // The account became reachable after the win was journalled, so the local
    // -> persisted mapping now exists. The queued win must use it.
    const ops = serverOps();
    await journalWinWrite({
      workflowTaskId: "task-local-1",
      persistedTaskId: null,
      persistedAreaId: null,
      title: "Shipped the onboarding flow",
      detail: null,
      occurredAt: CONFIRMED_ON,
    });

    const summary = await replayDurableWrites({
      ...ops,
      resolveWinIds: () => ({
        persistedTaskId: PERSISTED_TASK,
        persistedAreaId: PERSISTED_AREA,
      }),
    });

    expect(summary).toMatchObject({ synced: 1 });
    expect(ops.syncWin).toHaveBeenCalledWith(
      expect.objectContaining({
        area_id: PERSISTED_AREA,
        source_task_id: PERSISTED_TASK,
      }),
    );
  });

  it("replays a win journalled before a reload, oldest first", async () => {
    // Stands in for a tab close and reopen: nothing is deleted between the
    // journal writes and the replay, and the order is the order the user
    // confirmed them in.
    const ops = serverOps();
    for (const title of ["first win", "second win"]) {
      await journalWinWrite({
        workflowTaskId: `task-${title}`,
        persistedTaskId: PERSISTED_TASK,
        persistedAreaId: PERSISTED_AREA,
        title,
        detail: null,
        occurredAt: CONFIRMED_ON,
      });
    }

    await replayDurableWrites(ops);

    expect(
      ops.syncWin.mock.calls.map(
        (call) => (call[0] as { title: string }).title,
      ),
    ).toEqual(["first win", "second win"]);
  });
});

describe("createDurableWriteHandlers", () => {
  it("registers a handler for exactly the entities this slice wired", async () => {
    // A regression guard: if a later slice adds an entity to the journal but
    // forgets its handler, `replayPendingWrites` silently reports it skipped
    // and it never reaches the account. This pins what S2 claims to carry.
    const handlers = createDurableWriteHandlers(serverOps());

    expect(Object.keys(handlers).sort()).toEqual(["review", "win"]);
  });
});
