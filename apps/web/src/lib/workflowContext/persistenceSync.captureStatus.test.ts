import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Area, Phase2TaskDraft } from "@lifeos/schemas";
import type { Phase2MockTask } from "../types";
import { createPersistenceSync } from "./persistenceSync";

/**
 * Final UX Loop C1, Target Card 1 (audit P0#3) — "sorted/accepted work never
 * resurrects as unsorted (capture status transitions pinned)".
 *
 * This is the WIRING tier: does accepting a draft actually issue the capture
 * status write at all? On `origin/main` @ 6cc76ade it did not —
 * `persistAcceptedTaskDraft` wrote the task, its person links and its
 * proposal, then re-synced, and `capture_items.status` stayed `"new"` forever.
 * Every assertion below on `resolveCaptureItems` fails there because the
 * function is never called.
 *
 * The other two tiers live elsewhere and prove different things:
 *  - ACCOUNT (`src/__tests__/phase4aRls.local.test.ts`, real Postgres): the
 *    update lands, is ownership-bounded, and never drags a decided row back.
 *  - SURFACE (`src/lib/workflow/captureStatus.test.ts`): no screen presents an
 *    item as both unsorted and an accepted task.
 */

const createTaskMock = vi.hoisted(() => vi.fn());
const resolveCaptureItemsMock = vi.hoisted(() => vi.fn());
const createTimeBlockProposalMock = vi.hoisted(() => vi.fn());
const recordPersonLinkAcceptanceMock = vi.hoisted(() => vi.fn());
const createSupabaseBrowserClientMock = vi.hoisted(() => vi.fn());

vi.mock("../data/workflow", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../data/workflow")>();
  return {
    ...actual,
    createTask: createTaskMock,
    resolveCaptureItems: resolveCaptureItemsMock,
    createTimeBlockProposal: createTimeBlockProposalMock,
    recordPersonLinkAcceptance: recordPersonLinkAcceptanceMock,
  };
});

vi.mock("../supabase/browser", () => ({
  createSupabaseBrowserClient: createSupabaseBrowserClientMock,
}));

const AREA_ID = "44444444-4444-4444-8444-444444444444";
const CAPTURE_ID = "55555555-5555-4555-8555-555555555555";
const LOCAL_CAPTURE_ID = "capture-1";
const PERSISTED_TASK_ID = "66666666-6666-4666-8666-666666666666";

function persistedArea(): Area {
  return {
    id: AREA_ID,
    user_id: "user-1",
    name: "Main Job",
    slug: "main-job",
    color: "#000000",
    created_at: "2026-07-04T09:00:00.000Z",
  } as unknown as Area;
}

function draft(overrides: Partial<Phase2TaskDraft> = {}): Phase2TaskDraft {
  return {
    id: "draft-1",
    user_id: "user-1",
    capture_item_id: LOCAL_CAPTURE_ID,
    area_id: AREA_ID,
    title: "Call the accountant about the quarterly filing",
    description: null,
    confidence: 0.8,
    estimated_minutes_low: 25,
    estimated_minutes_high: 40,
    first_tiny_step: "Find the filing reference",
    breakdown: null,
    person_mentions: [],
    is_commitment: false,
    status: "pending",
    created_at: "2026-07-04T09:00:00.000Z",
    ...overrides,
  } as Phase2TaskDraft;
}

const localTask = { id: "task-local-1" } as unknown as Phase2MockTask;

function makeSync(captureIdMap: Map<string, string>) {
  const markLocalOnly = vi.fn();
  const syncPersistedWorkflowRows = vi.fn().mockResolvedValue(undefined);
  createSupabaseBrowserClientMock.mockReturnValue({ from: vi.fn() });

  const ops = createPersistenceSync({
    persistedAreasRef: { current: [persistedArea()] },
    persistedCaptureIdByLocalIdRef: { current: captureIdMap },
    persistedTaskIdByLocalIdRef: { current: new Map() },
    persistedProposalIdByLocalIdRef: { current: new Map() },
    persistedBlockIdByLocalIdRef: { current: new Map() },
    persistedSessionIdByLocalIdRef: { current: new Map() },
    selectedAreaId: null,
    markLocalOnly,
    markDeviceStorageBlocked: vi.fn(),
    replayJournaledWrites: vi.fn().mockResolvedValue(undefined),
    syncPersistedWorkflowRows,
  });

  return { ops, markLocalOnly, syncPersistedWorkflowRows };
}

describe("persistAcceptedTaskDraft — capture status truth (C1 card 1)", () => {
  beforeEach(() => {
    createTaskMock.mockReset();
    createTaskMock.mockResolvedValue({
      provider: "supabase",
      task: { id: PERSISTED_TASK_ID },
    });
    resolveCaptureItemsMock.mockReset();
    resolveCaptureItemsMock.mockResolvedValue({
      provider: "supabase",
      captures: [],
    });
    createTimeBlockProposalMock.mockReset();
    recordPersonLinkAcceptanceMock.mockReset();
    createSupabaseBrowserClientMock.mockReset();
  });

  it("advances the source capture to resolved when a draft is accepted", async () => {
    const { ops } = makeSync(new Map([[LOCAL_CAPTURE_ID, CAPTURE_ID]]));

    await ops.persistAcceptedTaskDraft(draft(), localTask, null, "active");

    expect(resolveCaptureItemsMock).toHaveBeenCalledOnce();
    expect(resolveCaptureItemsMock.mock.calls[0][1]).toEqual([CAPTURE_ID]);
  });

  it("does the same for a backlogged accept — the thought is decided either way", async () => {
    const { ops } = makeSync(new Map([[LOCAL_CAPTURE_ID, CAPTURE_ID]]));

    await ops.persistAcceptedTaskDraft(draft(), localTask, null, "backlog");

    expect(resolveCaptureItemsMock.mock.calls[0][1]).toEqual([CAPTURE_ID]);
  });

  it("writes the status only after the task it came from actually landed", async () => {
    // Ordering matters: the task is what MAKES the capture resolved. A failed
    // insert must leave the thought waiting rather than resolve a capture that
    // produced nothing.
    createTaskMock.mockResolvedValue({ provider: "mock", task: { id: "x" } });
    const { ops } = makeSync(new Map([[LOCAL_CAPTURE_ID, CAPTURE_ID]]));

    await ops.persistAcceptedTaskDraft(draft(), localTask, null, "active");

    expect(resolveCaptureItemsMock).not.toHaveBeenCalled();
  });

  it("fails loudly when the status write fails — never silently", async () => {
    // Unlike the person-link writes in the same path (best-effort by design,
    // NS-INV-4), a dropped status write IS the bug. It must propagate to
    // `markPersistedSaveFailure` via the caller.
    resolveCaptureItemsMock.mockRejectedValue(new Error("update denied"));
    const { ops, syncPersistedWorkflowRows } = makeSync(
      new Map([[LOCAL_CAPTURE_ID, CAPTURE_ID]]),
    );

    await expect(
      ops.persistAcceptedTaskDraft(draft(), localTask, null, "active"),
    ).rejects.toThrow("update denied");
    expect(syncPersistedWorkflowRows).not.toHaveBeenCalled();
  });

  it("is a no-op, not a crash, when the capture never reached the account", async () => {
    const { ops } = makeSync(new Map());

    await ops.persistAcceptedTaskDraft(draft(), localTask, null, "active");

    expect(resolveCaptureItemsMock).toHaveBeenCalledOnce();
    expect(resolveCaptureItemsMock.mock.calls[0][1]).toEqual([null]);
  });
});
