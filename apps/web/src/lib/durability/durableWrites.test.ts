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

  // #737 C1 re-score GAP 1. The judge logged one win, opened a NEW TAB, was
  // offered the same win again, took the offer, and the account ended up
  // holding TWO `win_records` rows for one accomplishment -- the only defect
  // in the C1 set that makes the app invent a record of the user's work.
  //
  // `win_records_user_client_write_id_key` (20260726120000) was already there
  // and already enforced. It caught nothing because the VALUE was minted per
  // action (`crypto.randomUUID()`), so the second mount produced a key the
  // index had never seen. The key is now derived from the FACT -- this task,
  // this local day -- which is what makes the index the backstop it was built
  // to be. The user is deliberately absent from the key: the index is already
  // scoped `(user_id, client_write_id)`, and asking for an identity at journal
  // time would break the journal-before-network order that slice 2 exists for.
  it("derives the same idempotency key for the same task on the same local day", async () => {
    const first = await journalWinWrite({
      workflowTaskId: "task-local-1",
      persistedTaskId: PERSISTED_TASK,
      persistedAreaId: PERSISTED_AREA,
      title: "Shipped the onboarding flow",
      detail: null,
      occurredAt: CONFIRMED_ON,
    });
    const second = await journalWinWrite({
      workflowTaskId: "task-local-1",
      persistedTaskId: PERSISTED_TASK,
      persistedAreaId: PERSISTED_AREA,
      title: "Shipped the onboarding flow",
      detail: null,
      occurredAt: CONFIRMED_ON,
    });

    expect(second.client_write_id).toBe(first.client_write_id);
    // And the journal itself collapses the replay rather than queueing twice.
    expect(await pendingWriteCount("win")).toBe(1);
  });

  it("keys on the ACCOUNT task id when there is one, so a task that syncs mid-day cannot mint a second key", async () => {
    // The trap this pins: a task created locally carries a non-uuid workflow
    // id until it syncs, after which the account uuid IS its workflow id.
    // Keying on the workflow id alone would give the pre-sync tab and the
    // post-sync tab two different keys for one win -- GAP 1 again, one sync
    // boundary later.
    const beforeSync = await journalWinWrite({
      workflowTaskId: "task-local-1",
      persistedTaskId: PERSISTED_TASK,
      persistedAreaId: PERSISTED_AREA,
      title: "Shipped the onboarding flow",
      detail: null,
      occurredAt: CONFIRMED_ON,
    });
    const afterSync = await journalWinWrite({
      workflowTaskId: PERSISTED_TASK,
      persistedTaskId: PERSISTED_TASK,
      persistedAreaId: PERSISTED_AREA,
      title: "Shipped the onboarding flow",
      detail: null,
      occurredAt: CONFIRMED_ON,
    });

    expect(afterSync.client_write_id).toBe(beforeSync.client_write_id);
    expect(await pendingWriteCount("win")).toBe(1);
  });

  // The seam this records, deliberately rather than by omission: a win
  // journalled with NO account id yet keys on the local id, and the same task
  // after it syncs would key on the account uuid. Those keys differ, and that
  // is safe -- but only because the OTHER half of the fix covers it. The
  // journal payload keeps both ids, the Close moment reports both as aliases
  // (`LoggedWinRecord.taskIdAliases`), so the offer is withdrawn across the
  // sync boundary and the second key is never derived by a user action. Pinned
  // in `momentsViewModel.test.ts` ("still withdraws the offer after the task
  // crosses the sync boundary"). If that suppression is ever removed, this
  // difference becomes a duplicate again -- which is why it is stated here.
  it("keys a win with no account id on the local id, and says so", async () => {
    const preSync = await journalWinWrite({
      workflowTaskId: "task-local-1",
      persistedTaskId: null,
      persistedAreaId: PERSISTED_AREA,
      title: "Shipped the onboarding flow",
      detail: null,
      occurredAt: CONFIRMED_ON,
    });

    expect(preSync.client_write_id).toBe(`win:task-local-1:${CONFIRMED_ON}`);
    // Confirming the SAME pre-sync win twice is still idempotent -- the case
    // that actually repeats without a network round trip.
    const preSyncAgain = await journalWinWrite({
      workflowTaskId: "task-local-1",
      persistedTaskId: null,
      persistedAreaId: PERSISTED_AREA,
      title: "Shipped the onboarding flow",
      detail: null,
      occurredAt: CONFIRMED_ON,
    });
    expect(preSyncAgain.client_write_id).toBe(preSync.client_write_id);
    expect(await pendingWriteCount("win")).toBe(1);
  });

  it("keeps different tasks, and the same task on a different day, distinct", async () => {
    const a = await journalWinWrite({
      workflowTaskId: "task-local-1",
      persistedTaskId: PERSISTED_TASK,
      persistedAreaId: PERSISTED_AREA,
      title: "Shipped the onboarding flow",
      detail: null,
      occurredAt: CONFIRMED_ON,
    });
    const otherTask = await journalWinWrite({
      workflowTaskId: "task-local-2",
      persistedTaskId: null,
      persistedAreaId: PERSISTED_AREA,
      title: "Something else",
      detail: null,
      occurredAt: CONFIRMED_ON,
    });
    const otherDay = await journalWinWrite({
      workflowTaskId: "task-local-1",
      persistedTaskId: PERSISTED_TASK,
      persistedAreaId: PERSISTED_AREA,
      title: "Shipped the onboarding flow",
      detail: null,
      occurredAt: "2026-05-09",
    });

    expect(
      new Set([a, otherTask, otherDay].map((w) => w.client_write_id)).size,
    ).toBe(3);
    expect(await pendingWriteCount("win")).toBe(3);
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
    // Two DIFFERENT tasks, which is what two different wins are. The fixture
    // used to give both the same `persistedTaskId`; since the C1 re-score fix
    // the idempotency key is derived from (account task, local day), so a
    // shared task id would correctly collapse these into ONE journal entry and
    // the ordering this test exists to pin would have nothing to order. The
    // assertion below is unchanged — only the fixture stopped describing one
    // win as two.
    for (const [index, title] of ["first win", "second win"].entries()) {
      await journalWinWrite({
        workflowTaskId: `task-${title}`,
        persistedTaskId: `550e8400-e29b-41d4-a716-44665544030${index}`,
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
    // #737 C1 slice S4 (a focus-session outcome), again by slice S3 (a placed
    // block and an accepted triage draft), and again by slice S5, which wires
    // an approved rollup plus the two COMPENSATING actions -- an unplan and a
    // drop. Those two matter most to this guard: an unhandled compensating
    // entry would be kept forever AND would never annul the write it exists to
    // annul, so the resurrection it fixes would come back silently.
    const handlers = createDurableWriteHandlers(serverOps());

    expect(Object.keys(handlers).sort()).toEqual([
      "execution_session",
      "plan_placement",
      "plan_unplacement",
      "review",
      "rollup",
      "task_draft_accept",
      "task_drop",
      "win",
    ]);
  });
});
