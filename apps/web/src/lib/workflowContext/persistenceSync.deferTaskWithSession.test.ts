import { describe, expect, it, vi, beforeEach } from "vitest";
import { createPersistenceSync } from "./persistenceSync";
import type { Phase2MockExecutionSession } from "../types";
// Re-anchored by #737 C1 S5, not weakened: a deferral is journalled as an
// `execution_session`, so `replayDurableWrites` really does re-send it and the
// banner now says so. The bare form is reserved for writes nothing will send.
import { savedOnThisDeviceAndSendingBanner } from "../statusVocabulary";

// #613: unit coverage for the atomic cap-DEFER persistence seam
// (persistDeferredTaskWithSession) in isolation from the full React
// provider — mirrors how #588's persistReviewEntry discriminated result is
// exercised at the persistence-sync boundary in reviewClosureTruth.test.tsx,
// but here directly rather than through rendered UI, since the seam is a
// plain async function with no React dependency.
//
// RE-ANCHORED BY #737 C1 CARD 1. The atomicity #613 bought is unchanged — the
// session outcome and the task deferral still commit as ONE transaction — but
// the transaction is now `record_execution_session(..., p_defer_task => true)`
// instead of `apply_execution_session_defer`, because under card 1 no session
// row exists yet when the user defers at the cap: the row is created from the
// chosen outcome, never at start. The write also goes through the
// pending-writes journal first (#737-A slice 2's rails), so the deferral is
// device-durable before any network call. These specs assert the NEW truth of
// the same seam; none of #613's guarantees were dropped.

const journalExecutionSessionWriteMock = vi.hoisted(() => vi.fn());
const hasPendingWriteMock = vi.hoisted(() => vi.fn());
const createSupabaseBrowserClientMock = vi.hoisted(() => vi.fn());

vi.mock("../durability/durableWrites", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../durability/durableWrites")>();
  return {
    ...actual,
    journalExecutionSessionWrite: journalExecutionSessionWriteMock,
    hasPendingWrite: hasPendingWriteMock,
  };
});

vi.mock("../supabase/browser", () => ({
  createSupabaseBrowserClient: createSupabaseBrowserClientMock,
}));

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const TASK_ID = "22222222-2222-4222-8222-222222222222";
const CLIENT_WRITE_ID = "33333333-3333-4333-8333-333333333333";

function localSession(): Phase2MockExecutionSession {
  return {
    id: SESSION_ID,
    task_id: TASK_ID,
    actual_minutes: 0,
  } as unknown as Phase2MockExecutionSession;
}

function makeSync(overrides: { hasClient: boolean }) {
  const markLocalOnly = vi.fn();
  const markDeviceStorageBlocked = vi.fn();
  const replayJournaledWrites = vi.fn().mockResolvedValue(undefined);
  const syncPersistedWorkflowRows = vi.fn().mockResolvedValue(undefined);
  createSupabaseBrowserClientMock.mockReturnValue(
    overrides.hasClient ? { rpc: vi.fn() } : null,
  );

  const ops = createPersistenceSync({
    persistedAreasRef: { current: [] },
    persistedCaptureIdByLocalIdRef: { current: new Map() },
    persistedTaskIdByLocalIdRef: { current: new Map() },
    persistedProposalIdByLocalIdRef: { current: new Map() },
    persistedBlockIdByLocalIdRef: { current: new Map() },
    persistedSessionIdByLocalIdRef: { current: new Map() },
    selectedAreaId: null,
    markLocalOnly,
    markDeviceStorageBlocked,
    replayJournaledWrites,
    syncPersistedWorkflowRows,
  });

  return {
    ops,
    markLocalOnly,
    markDeviceStorageBlocked,
    replayJournaledWrites,
    syncPersistedWorkflowRows,
  };
}

describe("persistDeferredTaskWithSession (#613 atomic cap-DEFER seam)", () => {
  beforeEach(() => {
    journalExecutionSessionWriteMock.mockReset();
    journalExecutionSessionWriteMock.mockResolvedValue({
      client_write_id: CLIENT_WRITE_ID,
    });
    hasPendingWriteMock.mockReset();
    hasPendingWriteMock.mockResolvedValue(false);
    createSupabaseBrowserClientMock.mockReset();
  });

  it('resolves "persisted" once the journalled deferral has reached the account', async () => {
    const { ops, markLocalOnly, syncPersistedWorkflowRows } = makeSync({
      hasClient: true,
    });

    const result = await ops.persistDeferredTaskWithSession(
      localSession(),
      TASK_ID,
      25,
      "carry note",
    );

    expect(result).toBe("persisted");
    expect(journalExecutionSessionWriteMock).toHaveBeenCalledOnce();
    // The whole of #613 in one payload: the session's outcome AND the task
    // deferral, carried together so `record_execution_session` commits them
    // in a single transaction.
    expect(journalExecutionSessionWriteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowTaskId: TASK_ID,
        outcome: "blocked",
        capOutcome: "deferred",
        deferTask: true,
        actualMinutes: 25,
        notes: "carry note",
      }),
    );
    expect(markLocalOnly).not.toHaveBeenCalled();
    expect(syncPersistedWorkflowRows).toHaveBeenCalledOnce();
  });

  it('resolves "local-only" and says so when the write is still queued', async () => {
    hasPendingWriteMock.mockResolvedValue(true);
    const { ops, markLocalOnly } = makeSync({ hasClient: false });

    const result = await ops.persistDeferredTaskWithSession(
      localSession(),
      TASK_ID,
      25,
      "carry note",
    );

    expect(result).toBe("local-only");
    expect(markLocalOnly).toHaveBeenCalledWith(
      savedOnThisDeviceAndSendingBanner("Your deferral"),
    );
  });

  it("still records the deferral when no session row exists yet", async () => {
    // The pre-#737 seam refused here, because it needed a persisted session
    // id to patch. Under write-at-end there is nothing to patch: the row is
    // created by this very call, so the absence of a prior session is the
    // NORMAL case rather than a reason to give up on the write.
    const { ops } = makeSync({ hasClient: true });

    const result = await ops.persistDeferredTaskWithSession(
      undefined,
      TASK_ID,
      25,
      "carry note",
    );

    expect(result).toBe("persisted");
    expect(journalExecutionSessionWriteMock).toHaveBeenCalledWith(
      expect.objectContaining({ workflowBlockId: null, deferTask: true }),
    );
  });

  it("never claims a save when the device itself refuses to hold the deferral", async () => {
    journalExecutionSessionWriteMock.mockRejectedValue(
      new Error("IndexedDB is unavailable"),
    );
    const { ops, markDeviceStorageBlocked } = makeSync({ hasClient: true });

    const result = await ops.persistDeferredTaskWithSession(
      localSession(),
      TASK_ID,
      25,
      null,
    );

    expect(result).toBe("local-only");
    expect(markDeviceStorageBlocked).toHaveBeenCalledOnce();
  });

  it("keeps the deferral queued when the replay throws, never dropping it", async () => {
    // A network failure is no longer a lost deferral: the journal holds it and
    // the next replay retries, so "not yet confirmed" is the truthful report
    // where the old seam propagated a hard failure.
    hasPendingWriteMock.mockResolvedValue(true);
    const { ops, replayJournaledWrites, markLocalOnly } = makeSync({
      hasClient: true,
    });
    replayJournaledWrites.mockRejectedValue(new Error("offline"));

    const result = await ops.persistDeferredTaskWithSession(
      localSession(),
      TASK_ID,
      25,
      null,
    );

    expect(result).toBe("local-only");
    expect(markLocalOnly).toHaveBeenCalledWith(
      savedOnThisDeviceAndSendingBanner("Your deferral"),
    );
  });
});
