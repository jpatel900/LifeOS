import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPersistenceSync } from "./persistenceSync";

/**
 * Calendar hunt #3 — "Move to today", carry forward and put off were not
 * queued. Before the task had an account id, the app said the change was
 * saved on this device and then dropped it: Retry had nothing to resend and
 * the next sync undid it. The change must be queued like a drop, keyed on
 * the local task id and resolved through the queued accept that made it.
 */
const journalTaskReviewWriteMock = vi.hoisted(() => vi.fn());
const findQueuedWriteToSupersedeMock = vi.hoisted(() => vi.fn());
const hasPendingWriteMock = vi.hoisted(() => vi.fn());
const applyTaskReviewTransitionMock = vi.hoisted(() => vi.fn());

vi.mock("../durability/durableWrites", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../durability/durableWrites")>()),
  journalTaskReviewWrite: journalTaskReviewWriteMock,
  findQueuedWriteToSupersede: findQueuedWriteToSupersedeMock,
  hasPendingWrite: hasPendingWriteMock,
}));

vi.mock("../data/workflow", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../data/workflow")>()),
  applyTaskReviewTransition: applyTaskReviewTransitionMock,
}));

vi.mock("../supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({ mocked: true }),
}));

function makeSync() {
  const markLocalOnly = vi.fn();
  const replayJournaledWrites = vi.fn().mockResolvedValue(undefined);
  const syncPersistedWorkflowRows = vi.fn().mockResolvedValue(undefined);
  const ops = createPersistenceSync({
    persistedAreasRef: { current: [] },
    persistedCaptureIdByLocalIdRef: { current: new Map() },
    persistedTaskIdByLocalIdRef: { current: new Map() },
    persistedProposalIdByLocalIdRef: { current: new Map() },
    persistedBlockIdByLocalIdRef: { current: new Map() },
    persistedSessionIdByLocalIdRef: { current: new Map() },
    selectedAreaId: null,
    recordAccountAlias: vi.fn(),
    markLocalOnly,
    markDeviceStorageBlocked: vi.fn(),
    markPersistedLoadFailure: vi.fn(),
    replayJournaledWrites,
    syncPersistedWorkflowRows,
  });
  return { ops, markLocalOnly, replayJournaledWrites };
}

describe("persistTaskReviewTransition is queued (calendar hunt #3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    journalTaskReviewWriteMock.mockResolvedValue({
      client_write_id: "review-write-1",
    });
    findQueuedWriteToSupersedeMock.mockResolvedValue("accept-write-1");
    hasPendingWriteMock.mockResolvedValue(true);
  });

  it("queues a move for a task that has no account id yet", async () => {
    const { ops, markLocalOnly, replayJournaledWrites } = makeSync();

    await ops.persistTaskReviewTransition("task-local-3", "active");

    expect(journalTaskReviewWriteMock).toHaveBeenCalledWith({
      workflowTaskId: "task-local-3",
      persistedTaskId: null,
      targetStatus: "active",
      acceptClientWriteId: "accept-write-1",
    });
    expect(replayJournaledWrites).toHaveBeenCalled();
    expect(applyTaskReviewTransitionMock).not.toHaveBeenCalled();
    // Honest: it is on this device AND still on its way.
    expect(markLocalOnly).toHaveBeenCalledWith(
      expect.stringContaining("Your change"),
    );
  });
});
