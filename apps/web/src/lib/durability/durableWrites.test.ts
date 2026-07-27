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
      workflowAreaId: "area-local-1",
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
      workflowAreaId: "area-local-1",
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

  it("keeps a write queued when the data layer reports mock, not a real account write", async () => {
    // THE GUARD FOR THE WORST FAILURE MODE. `syncJournaledWin(null, ...)`
    // resolves happily with provider "mock" when there is no Supabase client.
    // If replay treated that as success it would DELETE the journal entry and
    // the user's win would be gone -- the exact data loss #737 exists to end.
    const ops = serverOps({
      syncWin: vi.fn().mockResolvedValue({ provider: "mock" as const }),
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

  it("keeps a review queued when the data layer reports mock", async () => {
    const ops = serverOps({
      syncReview: vi.fn().mockResolvedValue({ provider: "mock" as const }),
    });
    await journalReviewWrite({
      workflowAreaId: "area-local-1",
      persistedAreaId: PERSISTED_AREA,
      reviewType: "daily",
      periodStart: CONFIRMED_ON,
      periodEnd: CONFIRMED_ON,
      summaryJson: { verdict: "saved" },
    });

    const summary = await replayDurableWrites(ops);

    expect(summary).toMatchObject({ synced: 0, failed: 1 });
    expect(await pendingWriteCount("review")).toBe(1);
  });

  it("drops a review the account already holds for that day, instead of retrying forever", async () => {
    // Final UX Loop C1, Target Cards 1+7 (audit P0#4). Migration
    // 20260727120000 makes a second daily close RAISE rather than be ignored
    // (it is deliberately not the upsert's ON CONFLICT arbiter). Every other
    // throw in this dispatcher means "keep it queued"; this one must not, or
    // a duplicate close would be re-sent on every mount and every reconnect
    // for the rest of the account's life.
    const ops = serverOps({
      syncReview: vi
        .fn()
        .mockRejectedValue(
          new Error(
            'duplicate key value violates unique constraint "review_entries_user_daily_close_key"',
          ),
        ),
    });
    await journalReviewWrite({
      workflowAreaId: "area-local-1",
      persistedAreaId: PERSISTED_AREA,
      reviewType: "daily",
      periodStart: CONFIRMED_ON,
      periodEnd: CONFIRMED_ON,
      summaryJson: { verdict: "saved" },
    });

    const summary = await replayDurableWrites(ops);

    // Terminal SUCCESS: the day is closed, the account has it, nothing is
    // left to send.
    expect(summary).toMatchObject({ synced: 1, failed: 0 });
    expect(await pendingWriteCount("review")).toBe(0);
  });

  it("still keeps a review queued when the failure is a DIFFERENT unique violation", async () => {
    // The narrowness of the branch above, proven. A client_write_id collision
    // means something else entirely and must not be read as "already closed".
    const ops = serverOps({
      syncReview: vi
        .fn()
        .mockRejectedValue(
          new Error(
            'duplicate key value violates unique constraint "review_entries_user_client_write_id_key"',
          ),
        ),
    });
    await journalReviewWrite({
      workflowAreaId: "area-local-1",
      persistedAreaId: PERSISTED_AREA,
      reviewType: "daily",
      periodStart: CONFIRMED_ON,
      periodEnd: CONFIRMED_ON,
      summaryJson: { verdict: "saved" },
    });

    const summary = await replayDurableWrites(ops);

    expect(summary).toMatchObject({ synced: 0, failed: 1 });
    expect(await pendingWriteCount("review")).toBe(1);
  });

  it("keeps a review queued when its selected area has no account id yet", async () => {
    // THE PRE-#737-A GUARANTEE, PRESERVED. `persistReviewEntry` used to refuse
    // to write when `selectedAreaId && !persistedAreaId` — an area was chosen
    // but had not synced. Sending null there would file the review under NO
    // area, permanently, which the old code correctly never did.
    const ops = serverOps();
    await journalReviewWrite({
      workflowAreaId: "area-local-1",
      persistedAreaId: null,
      reviewType: "daily",
      periodStart: CONFIRMED_ON,
      periodEnd: CONFIRMED_ON,
      summaryJson: { verdict: "saved" },
    });

    const summary = await replayDurableWrites(ops);

    expect(summary).toMatchObject({ synced: 0, failed: 1 });
    expect(ops.syncReview).not.toHaveBeenCalled();
    expect(await pendingWriteCount("review")).toBe(1);
  });

  it("sends an All-areas review with a null area, because that null is a real choice", async () => {
    // The other null. `workflow_area_id === null` means the user explicitly
    // chose All areas (#691), which is a legitimate review with no area — it
    // must not be blocked by the guard above.
    const ops = serverOps();
    await journalReviewWrite({
      workflowAreaId: null,
      persistedAreaId: null,
      reviewType: "daily",
      periodStart: CONFIRMED_ON,
      periodEnd: CONFIRMED_ON,
      summaryJson: { verdict: "saved" },
    });

    const summary = await replayDurableWrites(ops);

    expect(summary).toMatchObject({ synced: 1 });
    expect(ops.syncReview).toHaveBeenCalledWith(
      expect.objectContaining({ area_id: null }),
    );
  });

  it("resolves a review's area at replay time once it has synced", async () => {
    const ops = serverOps();
    await journalReviewWrite({
      workflowAreaId: "area-local-1",
      persistedAreaId: null,
      reviewType: "daily",
      periodStart: CONFIRMED_ON,
      periodEnd: CONFIRMED_ON,
      summaryJson: { verdict: "saved" },
    });

    const summary = await replayDurableWrites({
      ...ops,
      resolveReviewAreaId: () => PERSISTED_AREA,
    });

    expect(summary).toMatchObject({ synced: 1 });
    expect(ops.syncReview).toHaveBeenCalledWith(
      expect.objectContaining({ area_id: PERSISTED_AREA }),
    );
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
    const sentTitles: string[] = [];
    const ops = serverOps({
      syncWin: vi.fn().mockImplementation(async (args: { title: string }) => {
        sentTitles.push(args.title);
        return { provider: "supabase" as const };
      }),
    });
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

    expect(sentTitles).toEqual(["first win", "second win"]);
  });
});

describe("createDurableWriteHandlers", () => {
  it("registers a handler for exactly the entities this slice wired", async () => {
    // A regression guard: if a later slice adds an entity to the journal but
    // forgets its handler, `replayPendingWrites` silently reports it skipped
    // and -- because an unhandled entity is KEPT, not dropped -- it queues on
    // the device forever without ever reaching the account. Re-anchored by
    // #737 C1 slice S4 (a focus-session outcome) and again by slice S3, which
    // wires a placed block and an accepted triage draft.
    const handlers = createDurableWriteHandlers(serverOps());

    expect(Object.keys(handlers).sort()).toEqual([
      "execution_session",
      "plan_placement",
      "review",
      "task_draft_accept",
      "win",
    ]);
  });
});
