import { describe, expect, it, vi, beforeEach } from "vitest";
import { createPersistenceSync } from "./persistenceSync";
import type { Phase2MockExecutionSession } from "../types";

// #613: unit coverage for the atomic cap-DEFER persistence seam
// (persistDeferredTaskWithSession) in isolation from the full React
// provider — mirrors how #588's persistReviewEntry discriminated result is
// exercised at the persistence-sync boundary in reviewClosureTruth.test.tsx,
// but here directly rather than through rendered UI, since the seam is a
// plain async function with no React dependency.

const deferExecutionSessionWithTaskMock = vi.hoisted(() => vi.fn());
const createSupabaseBrowserClientMock = vi.hoisted(() => vi.fn());

vi.mock("../data/workflow", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../data/workflow")>();
  return {
    ...actual,
    deferExecutionSessionWithTask: deferExecutionSessionWithTaskMock,
  };
});

vi.mock("../supabase/browser", () => ({
  createSupabaseBrowserClient: createSupabaseBrowserClientMock,
}));

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const TASK_ID = "22222222-2222-4222-8222-222222222222";

function localSession(): Phase2MockExecutionSession {
  return {
    id: SESSION_ID,
    task_id: TASK_ID,
    actual_minutes: 0,
  } as unknown as Phase2MockExecutionSession;
}

function makeSync(overrides: { hasClient: boolean }) {
  const markLocalOnly = vi.fn();
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
    syncPersistedWorkflowRows,
  });

  return { ops, markLocalOnly, syncPersistedWorkflowRows };
}

describe("persistDeferredTaskWithSession (#613 atomic cap-DEFER seam)", () => {
  beforeEach(() => {
    deferExecutionSessionWithTaskMock.mockReset();
    createSupabaseBrowserClientMock.mockReset();
  });

  it('resolves "persisted" and calls the atomic RPC once when a client and persisted ids exist', async () => {
    deferExecutionSessionWithTaskMock.mockResolvedValue({
      provider: "supabase",
      session: { id: SESSION_ID, outcome: "blocked", cap_outcome: "deferred" },
      task: { id: TASK_ID, status: "backlog" },
    });
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
    expect(deferExecutionSessionWithTaskMock).toHaveBeenCalledOnce();
    expect(deferExecutionSessionWithTaskMock).toHaveBeenCalledWith(
      expect.anything(),
      SESSION_ID,
      TASK_ID,
      { actual_minutes: 25, notes: "carry note" },
    );
    expect(markLocalOnly).not.toHaveBeenCalled();
    expect(syncPersistedWorkflowRows).toHaveBeenCalledOnce();
  });

  it('resolves "local-only" and never calls the RPC when there is no Supabase client', async () => {
    const { ops, markLocalOnly } = makeSync({ hasClient: false });

    const result = await ops.persistDeferredTaskWithSession(
      localSession(),
      TASK_ID,
      25,
      "carry note",
    );

    expect(result).toBe("local-only");
    expect(deferExecutionSessionWithTaskMock).not.toHaveBeenCalled();
    expect(markLocalOnly).toHaveBeenCalledWith(
      "Deferral saved locally; account sync is pending.",
    );
  });

  it('resolves "local-only" when there is no local session to persist yet', async () => {
    const { ops, markLocalOnly } = makeSync({ hasClient: true });

    const result = await ops.persistDeferredTaskWithSession(
      undefined,
      TASK_ID,
      25,
      "carry note",
    );

    expect(result).toBe("local-only");
    expect(deferExecutionSessionWithTaskMock).not.toHaveBeenCalled();
    expect(markLocalOnly).toHaveBeenCalledOnce();
  });

  it("propagates a thrown RPC error so the caller can report failure (never a silent partial write)", async () => {
    deferExecutionSessionWithTaskMock.mockRejectedValue(
      new Error("apply_execution_session_defer failed"),
    );
    const { ops } = makeSync({ hasClient: true });

    await expect(
      ops.persistDeferredTaskWithSession(localSession(), TASK_ID, 25, null),
    ).rejects.toThrow("apply_execution_session_defer failed");
  });
});
