import { describe, expect, it, vi, beforeEach } from "vitest";
import { createPersistenceSync } from "./persistenceSync";
import type { Area } from "@lifeos/schemas";

// Issue #984 — unit coverage for persistBacklogTaskEdit and
// isSameSignedInUser in isolation from the full React provider, mirroring
// how persistDeferredTaskWithSession is exercised directly at the
// persistence-sync boundary (persistenceSync.deferTaskWithSession.test.ts).
// Unlike that seam, this one is deliberately NOT journal-backed — the #984
// contract rules out an offline account-replay promise for this operation —
// so there is no durableWrites mock here, only the account write itself.
// `persistBacklogTaskEdit` also never calls `syncPersistedWorkflowRows`
// (unlike every persist* sibling in this file): its own write touches
// exactly the one row it targeted, so there is nothing else a wholesale
// account resync would need to refresh, and calling it anyway would open a
// window where a concurrent local action or account switch could be
// overwritten or misattributed by that resync's own wholesale merge. The
// identity/version guard this bought instead lives in
// `WorkflowContext.taskEditing.test.tsx`, which is where the reflection
// itself (and the dispatch it guards) happens.

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
const WRITER_USER_ID = "user-a";

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
  /** The id `client.auth.getUser()` resolves with. `null` = signed out. */
  authUserId?: string | null;
}) {
  const syncPersistedWorkflowRows = vi.fn().mockResolvedValue(undefined);
  createSupabaseBrowserClientMock.mockReturnValue(
    options.hasClient
      ? {
          rpc: vi.fn(),
          auth: {
            getUser: vi
              .fn()
              .mockResolvedValue(
                options.authUserId
                  ? { data: { user: { id: options.authUserId } }, error: null }
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

  it("resolves persisted with the confirmed row and writer id, resolving local ids to persisted ones first, and never triggers a wholesale resync", async () => {
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
      userId: WRITER_USER_ID,
    });
    // The whole point of dropping this call from this operation: no
    // wholesale account snapshot read/merge runs from an edit that only
    // ever touches the one row it targeted.
    expect(syncPersistedWorkflowRows).not.toHaveBeenCalled();
  });

  it("passes a server conflict straight through", async () => {
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

describe("isSameSignedInUser (#984)", () => {
  beforeEach(() => {
    createSupabaseBrowserClientMock.mockReset();
  });

  it("is false when there is no client", async () => {
    const { ops } = makeSync({ hasClient: false });

    await expect(ops.isSameSignedInUser(WRITER_USER_ID)).resolves.toBe(false);
  });

  it("is false when the writer has since signed out", async () => {
    const { ops } = makeSync({ hasClient: true, authUserId: null });

    await expect(ops.isSameSignedInUser(WRITER_USER_ID)).resolves.toBe(false);
  });

  it("is false when a DIFFERENT, genuinely valid user is now signed in — being authenticated is not enough", async () => {
    const { ops } = makeSync({ hasClient: true, authUserId: "user-b" });

    await expect(ops.isSameSignedInUser(WRITER_USER_ID)).resolves.toBe(false);
  });

  it("is true when a fresh check finds the SAME user who performed the write", async () => {
    const { ops } = makeSync({ hasClient: true, authUserId: WRITER_USER_ID });

    await expect(ops.isSameSignedInUser(WRITER_USER_ID)).resolves.toBe(true);
  });
});
