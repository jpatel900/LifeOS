import { describe, expect, it, vi, beforeEach } from "vitest";
import { createPersistenceSync } from "./persistenceSync";
import type { WorkflowState } from "../workflow";

/**
 * #960 review finding 3 — a storage-blocked device must not lose account
 * persistence of a RESOLVABLE capture.
 *
 * `persistCapture` journals the capture to the device before any network
 * call (#960 defect 3), exactly like every other durable write since
 * #737-A. But unlike those writes, a capture that fails to JOURNAL used to
 * simply give up (`markDeviceStorageBlocked(); return;`) — and before the
 * whole durability layer existed, `persistCapture` never touched IndexedDB
 * at all: a client present with a resolvable area POSTed directly. A device
 * that cannot hold the journal entry (private mode, a full IndexedDB quota,
 * a blocking extension) is not necessarily a device that cannot reach the
 * network — so giving up here regressed those devices from "reaches the
 * account" to "loses account persistence entirely".
 *
 * The fix: when `journalCaptureWrite` throws AND the capture is otherwise
 * resolvable (no area was chosen, or the chosen one already has an account
 * id), fall back to the direct `createCaptureItem` call — the exact
 * pre-durability path. Only a capture that is BOTH unresolvable (a chosen
 * area has not synced yet) AND un-journalable still gets the honest
 * "saved on this device" banner, because there is nowhere durable to retry
 * from and no account-side call would even resolve to the right area.
 *
 * Mirrors the isolation style of
 * `persistenceSync.deferTaskWithSession.test.ts`: `createPersistenceSync`
 * is exercised directly (no React, no rendered UI), with the network/journal
 * boundary mocked.
 */

const journalCaptureWriteMock = vi.hoisted(() => vi.fn());
const createCaptureItemMock = vi.hoisted(() => vi.fn());
const createSupabaseBrowserClientMock = vi.hoisted(() => vi.fn());

vi.mock("../durability/durableWrites", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../durability/durableWrites")>();
  return {
    ...actual,
    journalCaptureWrite: journalCaptureWriteMock,
  };
});

vi.mock("../data/workflow", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../data/workflow")>();
  return {
    ...actual,
    createCaptureItem: createCaptureItemMock,
  };
});

vi.mock("../supabase/browser", () => ({
  createSupabaseBrowserClient: createSupabaseBrowserClientMock,
}));

const AREA_ID = "11111111-1111-4111-8111-111111111111";
const PERSISTED_CAPTURE_ID = "44444444-4444-4444-8444-444444444444";

function localCapture(
  overrides: Partial<WorkflowState["captureItems"][number]> = {},
): WorkflowState["captureItems"][number] {
  return {
    id: "capture-local-1",
    user_id: "user-1",
    area_id: "area-main-job",
    raw_text: "Call the landlord back",
    return_hook: null,
    capture_mode: "text",
    inferred_area_confidence: null,
    status: "new",
    created_at: "2026-08-29T00:00:00.000Z",
    ...overrides,
  } as WorkflowState["captureItems"][number];
}

function makeSync(overrides: { persistedAreaId?: string | null } = {}) {
  const markLocalOnly = vi.fn();
  const markDeviceStorageBlocked = vi.fn();
  const replayJournaledWrites = vi.fn().mockResolvedValue(undefined);
  const syncPersistedWorkflowRows = vi.fn().mockResolvedValue(undefined);
  const recordAccountAlias = vi.fn();
  createSupabaseBrowserClientMock.mockReturnValue({ mocked: true });

  const persistedAreasRef = {
    current:
      overrides.persistedAreaId === null
        ? []
        : [
            {
              id: overrides.persistedAreaId ?? AREA_ID,
              slug: "main-job",
            },
          ],
  };

  const ops = createPersistenceSync({
    // Cast: the fixture only needs `id`/`slug`, which is all
    // `persistedAreaIdForWorkflowId` reads.
    persistedAreasRef: persistedAreasRef as never,
    persistedCaptureIdByLocalIdRef: { current: new Map() },
    persistedTaskIdByLocalIdRef: { current: new Map() },
    persistedProposalIdByLocalIdRef: { current: new Map() },
    persistedBlockIdByLocalIdRef: { current: new Map() },
    persistedSessionIdByLocalIdRef: { current: new Map() },
    selectedAreaId: null,
    recordAccountAlias,
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
    recordAccountAlias,
  };
}

describe("persistCapture falls back to a direct POST when the device journal refuses the write (#960 review finding 3)", () => {
  beforeEach(() => {
    journalCaptureWriteMock.mockReset();
    createCaptureItemMock.mockReset();
    createSupabaseBrowserClientMock.mockReset();
  });

  it("still reaches the account when the capture's area is already resolved", async () => {
    journalCaptureWriteMock.mockRejectedValue(
      new Error("IndexedDB is unavailable"),
    );
    createCaptureItemMock.mockResolvedValue({
      provider: "supabase",
      capture: { id: PERSISTED_CAPTURE_ID },
    });
    const {
      ops,
      markDeviceStorageBlocked,
      syncPersistedWorkflowRows,
      recordAccountAlias,
    } = makeSync({ persistedAreaId: AREA_ID });

    await ops.persistCapture(localCapture());

    // THE POST THIS FINDING ASKS FOR: the direct account call still fires.
    expect(createCaptureItemMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        raw_text: "Call the landlord back",
        area_id: AREA_ID,
      }),
    );
    expect(recordAccountAlias).toHaveBeenCalledWith(
      "captures",
      "capture-local-1",
      PERSISTED_CAPTURE_ID,
    );
    expect(syncPersistedWorkflowRows).toHaveBeenCalledOnce();
    // Not the "nothing durable" banner — the write actually landed.
    expect(markDeviceStorageBlocked).not.toHaveBeenCalled();
  });

  it("still reaches the account for a capture with no area at all", async () => {
    journalCaptureWriteMock.mockRejectedValue(
      new Error("IndexedDB is unavailable"),
    );
    createCaptureItemMock.mockResolvedValue({
      provider: "supabase",
      capture: { id: PERSISTED_CAPTURE_ID },
    });
    const { ops, markDeviceStorageBlocked } = makeSync({
      persistedAreaId: null,
    });

    await ops.persistCapture(localCapture({ area_id: null }));

    expect(createCaptureItemMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ area_id: null }),
    );
    expect(markDeviceStorageBlocked).not.toHaveBeenCalled();
  });

  it("keeps the honest device-storage-blocked banner when the capture is ALSO unresolvable (a chosen area has not synced)", async () => {
    // The area the user picked has no account id yet — the fallback POST
    // would file the capture under a guessed area, so it must not fire.
    journalCaptureWriteMock.mockRejectedValue(
      new Error("IndexedDB is unavailable"),
    );
    const { ops, markDeviceStorageBlocked } = makeSync({
      persistedAreaId: null,
    });

    await ops.persistCapture(localCapture({ area_id: "area-main-job" }));

    expect(createCaptureItemMock).not.toHaveBeenCalled();
    expect(markDeviceStorageBlocked).toHaveBeenCalledOnce();
  });

  it("does not fall back when the journal write actually succeeds", async () => {
    journalCaptureWriteMock.mockResolvedValue({
      client_write_id: "client-capture-1",
    });
    const { ops } = makeSync({ persistedAreaId: AREA_ID });

    await ops.persistCapture(localCapture());

    // The normal durable path took it; the fallback must never ALSO fire.
    expect(createCaptureItemMock).not.toHaveBeenCalled();
  });
});
