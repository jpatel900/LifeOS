import { describe, expect, it, vi, beforeEach } from "vitest";
import { createPersistenceSync } from "./persistenceSync";
import type { Area } from "@lifeos/schemas";

// Issue #984 — unit coverage for persistBacklogTaskEdit in isolation from the
// full React provider, mirroring how persistDeferredTaskWithSession is
// exercised directly at the persistence-sync boundary
// (persistenceSync.deferTaskWithSession.test.ts). Unlike that seam, this one
// is deliberately NOT journal-backed — the #984 contract rules out an offline
// account-replay promise for this operation — so there is no durableWrites
// mock here, only the account write itself.

const editBacklogTaskAccountRowMock = vi.hoisted(() => vi.fn());
const createSupabaseBrowserClientMock = vi.hoisted(() => vi.fn());

vi.mock("../data/workflow/taskEditing", () => ({
  editBacklogTaskAccountRow: editBacklogTaskAccountRowMock,
}));

vi.mock("../supabase/browser", () => ({
  createSupabaseBrowserClient: createSupabaseBrowserClientMock,
}));

const LOCAL_TASK_ID = "task-1";
const PERSISTED_TASK_ID = "22222222-2222-4222-8222-222222222222";
const LOCAL_AREA_ID = "area-main-job";
const PERSISTED_AREA_ID = "33333333-3333-4333-8333-333333333333";
const UPDATED_AT = "2026-07-04T09:00:00.000Z";

function persistedArea(overrides: Partial<Area> = {}): Area {
  return {
    id: PERSISTED_AREA_ID,
    user_id: "11111111-1111-4111-8111-111111111111",
    name: "Main Job",
    slug: "main-job",
    description: null,
    color: "#2563eb",
    icon: null,
    sort_order: 0,
    is_active: true,
    created_at: UPDATED_AT,
    updated_at: UPDATED_AT,
    ...overrides,
  } as Area;
}

function makeSync(options: {
  hasClient: boolean;
  taskAliased?: boolean;
  syncFails?: boolean;
  /**
   * The id the fresh post-refresh-failure `requireSupabaseUser` call finds
   * signed in. `null` = signed out; a string = that user (which may or may
   * not be the same user who performed the write — that comparison is
   * exactly what `sameSession` exists to prove).
   */
  authUserIdAfterSyncFailure?: string | null;
}) {
  const syncPersistedWorkflowRows = options.syncFails
    ? vi.fn().mockRejectedValue(new Error("network blip"))
    : vi.fn().mockResolvedValue(undefined);
  createSupabaseBrowserClientMock.mockReturnValue(
    options.hasClient
      ? {
          rpc: vi.fn(),
          auth: {
            getUser: vi.fn().mockResolvedValue(
              options.authUserIdAfterSyncFailure
                ? {
                    data: { user: { id: options.authUserIdAfterSyncFailure } },
                    error: null,
                  }
                : { data: { user: null }, error: null },
            ),
          },
        }
      : null,
  );

  const persistedTaskIdByLocalIdRef = {
    current: new Map<string, string>(
      options.taskAliased !== false ? [[LOCAL_TASK_ID, PERSISTED_TASK_ID]] : [],
    ),
  };

  const ops = createPersistenceSync({
    persistedAreasRef: { current: [persistedArea()] },
    persistedCaptureIdByLocalIdRef: { current: new Map() },
    persistedTaskIdByLocalIdRef,
    persistedProposalIdByLocalIdRef: { current: new Map() },
    persistedBlockIdByLocalIdRef: { current: new Map() },
    persistedSessionIdByLocalIdRef: { current: new Map() },
    selectedAreaId: null,
    recordAccountAlias: vi.fn(),
    markLocalOnly: vi.fn(),
    markDeviceStorageBlocked: vi.fn(),
    replayJournaledWrites: vi.fn().mockResolvedValue(undefined),
    syncPersistedWorkflowRows,
  });

  return { ops, syncPersistedWorkflowRows };
}

describe("persistBacklogTaskEdit (#984)", () => {
  beforeEach(() => {
    editBacklogTaskAccountRowMock.mockReset();
    createSupabaseBrowserClientMock.mockReset();
  });

  it("throws when there is no client — demo edits use local workflow state", async () => {
    const { ops } = makeSync({ hasClient: false });

    await expect(
      ops.persistBacklogTaskEdit(
        LOCAL_TASK_ID,
        { title: "New title", description: null, area_id: LOCAL_AREA_ID },
        UPDATED_AT,
      ),
    ).rejects.toThrow("Demo backlog task edits use local workflow state.");
  });

  const WRITER_USER_ID = "user-a";

  it("resolves persisted with the confirmed row, resolving local ids to persisted ones first", async () => {
    editBacklogTaskAccountRowMock.mockResolvedValue({
      provider: "supabase",
      status: "updated",
      task: { id: PERSISTED_TASK_ID, title: "New title" },
      userId: WRITER_USER_ID,
    });
    const { ops, syncPersistedWorkflowRows } = makeSync({ hasClient: true });

    const result = await ops.persistBacklogTaskEdit(
      LOCAL_TASK_ID,
      { title: "New title", description: "notes", area_id: LOCAL_AREA_ID },
      UPDATED_AT,
    );

    expect(editBacklogTaskAccountRowMock).toHaveBeenCalledWith(
      expect.anything(),
      PERSISTED_TASK_ID,
      { title: "New title", description: "notes", area_id: PERSISTED_AREA_ID },
      UPDATED_AT,
    );
    expect(result).toEqual({
      status: "persisted",
      task: { id: PERSISTED_TASK_ID, title: "New title" },
    });
    expect(syncPersistedWorkflowRows).toHaveBeenCalledOnce();
  });

  it("resolves persisted-refresh-pending with sameSession: false when the writer has since signed out", async () => {
    editBacklogTaskAccountRowMock.mockResolvedValue({
      provider: "supabase",
      status: "updated",
      task: { id: PERSISTED_TASK_ID, title: "New title" },
      userId: WRITER_USER_ID,
    });
    const { ops } = makeSync({
      hasClient: true,
      syncFails: true,
      authUserIdAfterSyncFailure: null,
    });

    const result = await ops.persistBacklogTaskEdit(
      LOCAL_TASK_ID,
      { title: "New title", description: null, area_id: LOCAL_AREA_ID },
      UPDATED_AT,
    );

    expect(result).toEqual({
      status: "persisted-refresh-pending",
      task: { id: PERSISTED_TASK_ID, title: "New title" },
      sameSession: false,
    });
  });

  it("resolves persisted-refresh-pending with sameSession: false when a DIFFERENT, genuinely valid user is now signed in — being authenticated is not enough", async () => {
    editBacklogTaskAccountRowMock.mockResolvedValue({
      provider: "supabase",
      status: "updated",
      task: { id: PERSISTED_TASK_ID, title: "New title" },
      userId: WRITER_USER_ID,
    });
    const { ops } = makeSync({
      hasClient: true,
      syncFails: true,
      authUserIdAfterSyncFailure: "user-b",
    });

    const result = await ops.persistBacklogTaskEdit(
      LOCAL_TASK_ID,
      { title: "New title", description: null, area_id: LOCAL_AREA_ID },
      UPDATED_AT,
    );

    expect(result).toEqual({
      status: "persisted-refresh-pending",
      task: { id: PERSISTED_TASK_ID, title: "New title" },
      sameSession: false,
    });
  });

  it("resolves persisted-refresh-pending with sameSession: true when a fresh auth check finds the SAME user who performed the write", async () => {
    editBacklogTaskAccountRowMock.mockResolvedValue({
      provider: "supabase",
      status: "updated",
      task: { id: PERSISTED_TASK_ID, title: "New title" },
      userId: WRITER_USER_ID,
    });
    const { ops } = makeSync({
      hasClient: true,
      syncFails: true,
      authUserIdAfterSyncFailure: WRITER_USER_ID,
    });

    const result = await ops.persistBacklogTaskEdit(
      LOCAL_TASK_ID,
      { title: "New title", description: null, area_id: LOCAL_AREA_ID },
      UPDATED_AT,
    );

    expect(result).toEqual({
      status: "persisted-refresh-pending",
      task: { id: PERSISTED_TASK_ID, title: "New title" },
      sameSession: true,
    });
  });

  it("passes a server conflict straight through without re-syncing", async () => {
    editBacklogTaskAccountRowMock.mockResolvedValue({
      provider: "supabase",
      status: "conflict",
    });
    const { ops, syncPersistedWorkflowRows } = makeSync({ hasClient: true });

    const result = await ops.persistBacklogTaskEdit(
      LOCAL_TASK_ID,
      { title: "New title", description: null, area_id: LOCAL_AREA_ID },
      UPDATED_AT,
    );

    expect(result).toEqual({ status: "conflict" });
    expect(syncPersistedWorkflowRows).not.toHaveBeenCalled();
  });

  it("reports unreachable rather than a silent local-only save when the task never synced", async () => {
    const { ops } = makeSync({ hasClient: true, taskAliased: false });

    const result = await ops.persistBacklogTaskEdit(
      LOCAL_TASK_ID,
      { title: "New title", description: null, area_id: LOCAL_AREA_ID },
      UPDATED_AT,
    );

    expect(result).toEqual({ status: "unreachable" });
    expect(editBacklogTaskAccountRowMock).not.toHaveBeenCalled();
  });

  it("propagates a thrown account error (e.g. signed out) to the caller", async () => {
    editBacklogTaskAccountRowMock.mockRejectedValue(
      new Error("Sign in before saving task edits."),
    );
    const { ops } = makeSync({ hasClient: true });

    await expect(
      ops.persistBacklogTaskEdit(
        LOCAL_TASK_ID,
        { title: "New title", description: null, area_id: LOCAL_AREA_ID },
        UPDATED_AT,
      ),
    ).rejects.toThrow("Sign in before saving task edits.");
  });
});
