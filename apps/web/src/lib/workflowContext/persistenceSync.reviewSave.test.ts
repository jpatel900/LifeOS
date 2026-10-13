import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPersistenceSync } from "./persistenceSync";

const mocks = vi.hoisted(() => ({ client: vi.fn(), transition: vi.fn() }));
vi.mock("../supabase/browser", () => ({
  createSupabaseBrowserClient: mocks.client,
}));
vi.mock("../data/workflow", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../data/workflow")>()),
  applyTaskReviewTransition: mocks.transition,
}));

const TASK_ID = "22222222-2222-4222-8222-222222222222";

function makeSync() {
  const refresh = vi.fn().mockResolvedValue(undefined);
  const markLocalOnly = vi.fn();
  const ops = createPersistenceSync({
    persistedAreasRef: { current: [] },
    persistedCaptureIdByLocalIdRef: { current: new Map() },
    persistedTaskIdByLocalIdRef: {
      current: new Map([["local-task", TASK_ID]]),
    },
    persistedProposalIdByLocalIdRef: { current: new Map() },
    persistedBlockIdByLocalIdRef: { current: new Map() },
    persistedSessionIdByLocalIdRef: { current: new Map() },
    selectedAreaId: null,
    recordAccountAlias: vi.fn(),
    markLocalOnly,
    markDeviceStorageBlocked: vi.fn(),
    markPersistedLoadFailure: vi.fn(),
    replayJournaledWrites: vi.fn().mockResolvedValue(undefined),
    syncPersistedWorkflowRows: refresh,
  });
  return { ops, refresh, markLocalOnly };
}

describe("task review persistence receipts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.client.mockReturnValue({});
    mocks.transition.mockResolvedValue({ provider: "supabase" });
  });

  it("reports an account receipt after the write and refresh settle", async () => {
    const { ops, refresh } = makeSync();
    await expect(
      ops.persistTaskReviewTransition("local-task", "active", { settle: true }),
    ).resolves.toEqual({ status: "persisted" });
    expect(mocks.transition).toHaveBeenCalledWith({}, TASK_ID, "active");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("reports failed without refreshing after an account write failure", async () => {
    const { ops, refresh } = makeSync();
    const error = new Error("Synthetic write refusal");
    mocks.transition.mockRejectedValue(error);
    await expect(
      ops.persistTaskReviewTransition("local-task", "active", { settle: true }),
    ).resolves.toEqual({ status: "failed", error });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("keeps the confirmed write when its refresh fails", async () => {
    const { ops, refresh } = makeSync();
    const error = new Error("Synthetic read failure");
    refresh.mockRejectedValue(error);
    await expect(
      ops.persistTaskReviewTransition("local-task", "backlog", {
        settle: true,
      }),
    ).resolves.toEqual({ status: "persisted-refresh-failed", error });
    expect(mocks.transition).toHaveBeenCalledTimes(1);
  });

  it.each(["active", "dropped"] as const)(
    "preserves the default %s caller's write error",
    async (status) => {
      const { ops } = makeSync();
      const error = new Error("Synthetic write refusal");
      mocks.transition.mockRejectedValue(error);
      await expect(
        ops.persistTaskReviewTransition("local-task", status),
      ).rejects.toBe(error);
    },
  );

  it.each(["active", "dropped"] as const)(
    "preserves the default %s caller's refresh error",
    async (status) => {
      const { ops, refresh } = makeSync();
      const error = new Error("Synthetic read failure");
      refresh.mockRejectedValue(error);
      await expect(
        ops.persistTaskReviewTransition("local-task", status),
      ).rejects.toBe(error);
    },
  );

  it.each(["no-client", "no-account-id"])(
    "does not invent a write receipt for %s",
    async (missing) => {
      const { ops, refresh, markLocalOnly } = makeSync();
      if (missing === "no-client") mocks.client.mockReturnValue(null);
      await expect(
        ops.persistTaskReviewTransition(
          missing === "no-account-id" ? "unmapped-local-task" : "local-task",
          "active",
          { settle: true },
        ),
      ).resolves.toEqual({ status: "local-only" });
      expect(mocks.transition).not.toHaveBeenCalled();
      expect(refresh).not.toHaveBeenCalled();
      expect(markLocalOnly).toHaveBeenCalledTimes(1);
    },
  );
});
