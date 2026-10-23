import { persistedLoadFailureMessage } from "../lib/workflowContext/reducerCore";
import "fake-indexeddb/auto";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowProvider, useWorkflow } from "@/lib/WorkflowContext";
import {
  clearPendingWrites,
  enqueuePendingWrite,
  listPendingWrites,
} from "@/lib/durability/pendingWriteJournal";
import * as durableWrites from "@/lib/durability/durableWrites";
import { listPendingCaptures } from "@/lib/capture/offlineQueue";
import { resolveDeviceSaveNotice } from "@/lib/deviceSaveNotice";
import { STORAGE_KEY } from "@/lib/workflowContext/reducerCore";
import {
  ACCOUNT_SAVE_FAILED,
  ACCOUNT_SAVED_DEVICE_STORAGE_BLOCKED,
  DEVICE_STORAGE_BLOCKED,
} from "@/lib/statusVocabulary";

/**
 * #967: keep the visible notice consistent with account writes and the
 * sessionStorage copy. The real provider, capture transition, persistence
 * operations and notice resolver run; only the account boundary is mocked.
 * Faults start after areasReadbackSettled so bootstrap cannot overwrite them.
 *
 * Removing indexedDB simulates total journal unavailability, not a specific
 * browser. The session failure affects only the workflow snapshot key.
 */

const PERSISTED_AREA = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "22222222-2222-4222-8222-222222222222",
  name: "Main Job",
  slug: "main-job",
  description: null,
  color: "#4c80cd",
  icon: "briefcase",
  sort_order: 0,
  is_active: true,
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
};

const PERSISTED_CAPTURE_ID = "44444444-4444-4444-8444-444444444444";

const {
  mockListAreas,
  mockListCaptureItems,
  mockListPlanningItems,
  mockListExecutionReviewItems,
  mockListWinRecords,
  mockListOverrideRecords,
  mockListDurationProfiles,
  mockListSuggestionRecords,
  mockCreateCaptureItem,
  mockCreateSupabaseBrowserClient,
  mockGetUser,
} = vi.hoisted(() => ({
  mockListAreas: vi.fn(),
  mockListCaptureItems: vi.fn(),
  mockListPlanningItems: vi.fn(),
  mockListExecutionReviewItems: vi.fn(),
  mockListWinRecords: vi.fn(),
  mockListOverrideRecords: vi.fn(),
  mockListDurationProfiles: vi.fn(),
  mockListSuggestionRecords: vi.fn(),
  mockCreateCaptureItem: vi.fn(),
  mockCreateSupabaseBrowserClient: vi.fn(),
  mockGetUser: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/today",
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: mockCreateSupabaseBrowserClient,
}));

vi.mock("@/lib/data/workflow", async () => {
  const actual = await vi.importActual<typeof import("@/lib/data/workflow")>(
    "@/lib/data/workflow",
  );
  return {
    ...actual,
    listAreas: mockListAreas,
    listCaptureItems: mockListCaptureItems,
    listPlanningItems: mockListPlanningItems,
    listExecutionReviewItems: mockListExecutionReviewItems,
    listWinRecords: mockListWinRecords,
    listOverrideRecords: mockListOverrideRecords,
    listDurationProfiles: mockListDurationProfiles,
    listSuggestionRecords: mockListSuggestionRecords,
    createCaptureItem: mockCreateCaptureItem,
  };
});

let observedWorkflow: ReturnType<typeof useWorkflow>;
function Harness() {
  observedWorkflow = useWorkflow();
  const {
    state,
    selectedAreaId,
    submitCaptureText,
    addArea,
    updateAreaColor,
    acknowledgeAreaSave,
    syncPersistedAreas,
    syncStatus,
    areasReadbackSettled,
  } = observedWorkflow;
  const capture = state.captureItems[0];
  const notice = resolveDeviceSaveNotice(syncStatus);
  const captureAlias = capture
    ? (state.accountIdByLocalId.captures ?? {})[capture.id]
    : undefined;

  return (
    <div>
      <span data-testid="sync-account">{syncStatus.account}</span>
      <span data-testid="areas-settled">{String(areasReadbackSettled)}</span>
      <span data-testid="sync-message">{syncStatus.message ?? ""}</span>
      <span data-testid="sync-pending">
        {String(syncStatus.pendingLocalChanges)}
      </span>
      <span data-testid="sync-storage">{syncStatus.storage ?? ""}</span>
      <span data-testid="notice-tone">{notice?.tone ?? ""}</span>
      <span data-testid="notice-message">{notice?.message ?? ""}</span>
      <span data-testid="capture-count">{state.captureItems.length}</span>
      <span data-testid="capture-text">{capture?.raw_text ?? ""}</span>
      <span data-testid="capture-alias">{captureAlias ?? ""}</span>
      <span data-testid="area-colors">
        {state.areas.map((area) => area.color).join(",")}
      </span>
      <button
        type="button"
        onClick={() => {
          const receipt = addArea("Batched area", "#111111");
          if (!receipt) return;
          acknowledgeAreaSave(receipt, {
            ...PERSISTED_AREA,
            id: "66666666-6666-4666-8666-666666666666",
            slug: "batched-area",
            name: "Batched area",
            color: "#111111",
          });
          updateAreaColor(receipt.id, "#222222");
          syncPersistedAreas(
            [
              PERSISTED_AREA,
              {
                ...PERSISTED_AREA,
                id: "66666666-6666-4666-8666-666666666666",
                slug: "batched-area",
                name: "Batched area",
                color: "#111111",
              },
            ],
            receipt,
          );
        }}
      >
        Save area and edit in one batch
      </button>
      <span data-testid="area-names">
        {state.areas.map((area) => area.name).join(",")}
      </span>
      <span data-testid="capture-aliases">
        {Object.values(state.accountIdByLocalId.captures ?? {}).join(",")}
      </span>
      <button type="button" onClick={() => addArea("Local area", "#4c80cd")}>
        Add local area
      </button>
      <button
        type="button"
        onClick={() =>
          submitCaptureText("Call the landlord back", selectedAreaId)
        }
      >
        Capture
      </button>
    </div>
  );
}

/** No `indexedDB` global at all —
 * synthetic total unavailability, not a claim about any specific browser. */
function makeIndexedDbUnavailable(): () => void {
  const real = globalThis.indexedDB;
  // @ts-expect-error test-only: simulating total IndexedDB unavailability.
  delete globalThis.indexedDB;
  return () => {
    globalThis.indexedDB = real;
  };
}

/**
 * Makes the REAL `sessionStorage.setItem` throw only for the workflow
 * snapshot key, leaving every other write (if any) genuinely real.
 *
 * Spies on `Storage.prototype.setItem`, not the `window.sessionStorage`
 * instance: jsdom's Storage instance is itself a Proxy (to support
 * arbitrary-key expando access per the Web Storage spec), whose `get` trap
 * returns the ACTUAL bound native method for recognized names like
 * `setItem` regardless of an own-property override — so
 * `vi.spyOn(window.sessionStorage, "setItem")` silently fails to intercept
 * calls made by application code (confirmed empirically: the write went
 * through unblocked). The prototype itself is a plain object, not proxied,
 * so overriding it there is what jsdom's own Proxy `get` trap actually
 * resolves to.
 */
function makeSessionStorageSnapshotWriteFail(): () => void {
  const original = Storage.prototype.setItem;
  const spy = vi
    .spyOn(Storage.prototype, "setItem")
    .mockImplementation(function (this: Storage, key: string, value: string) {
      if (this === window.sessionStorage && key === STORAGE_KEY) {
        throw new DOMException(
          "Quota exceeded (synthetic).",
          "QuotaExceededError",
        );
      }
      return original.call(this, key, value);
    });
  return () => spy.mockRestore();
}

beforeEach(() => {
  mockGetUser.mockReset().mockResolvedValue({
    data: { user: { id: PERSISTED_AREA.user_id } },
    error: null,
  });
  mockCreateSupabaseBrowserClient.mockReset().mockReturnValue({
    mocked: true,
    auth: {
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      getUser: mockGetUser,
    },
  });

  // Synthetic authenticated user, settled bootstrap: areas resolve
  // immediately, every other account read is empty. No SIGNED_IN dance —
  // this investigation is about the capture path AFTER settlement, not the
  // sign-in transition itself.
  mockListAreas
    .mockReset()
    .mockResolvedValue({ provider: "supabase", areas: [PERSISTED_AREA] });
  mockListCaptureItems
    .mockReset()
    .mockResolvedValue({ provider: "supabase", captures: [] });
  mockListPlanningItems
    .mockReset()
    .mockResolvedValue({ provider: "supabase", proposals: [] });
  mockListExecutionReviewItems.mockReset().mockResolvedValue({
    provider: "supabase",
    tasks: [],
    blocks: [],
    sessions: [],
    reviewEntries: [],
  });
  mockListWinRecords
    .mockReset()
    .mockResolvedValue({ provider: "supabase", winRecords: [] });
  mockListOverrideRecords
    .mockReset()
    .mockResolvedValue({ provider: "supabase", overrideRecords: [] });
  mockListDurationProfiles
    .mockReset()
    .mockResolvedValue({ provider: "supabase", durationProfiles: [] });
  mockListSuggestionRecords
    .mockReset()
    .mockResolvedValue({ provider: "supabase", suggestionRecords: [] });
  mockCreateCaptureItem.mockReset();

  window.sessionStorage.clear();
});

afterEach(async () => {
  window.sessionStorage.clear();
  await clearPendingWrites();
  vi.restoreAllMocks();
});

async function renderSettled() {
  render(
    <WorkflowProvider>
      <Harness />
    </WorkflowProvider>,
  );
  // Initial status can already read "synced" before bootstrap fills refs.
  // Wait for the actual initial readback before arming the failure.
  await waitFor(() =>
    expect(screen.getByTestId("areas-settled")).toHaveTextContent("true"),
  );
  await act(async () => {});
  expect(mockListCaptureItems).toHaveBeenCalled();
  expect(screen.getByTestId("sync-account")).toHaveTextContent("synced");
}

function expectMemoryAndSnapshot(savedInSession: boolean) {
  expect(screen.getByTestId("capture-count").textContent).toBe("1");
  expect(screen.getByTestId("capture-text").textContent).toBe(
    "Call the landlord back",
  );
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  const snapshot = raw
    ? (JSON.parse(raw) as { captureItems: Array<{ raw_text: string }> })
    : null;
  expect(
    snapshot?.captureItems.some(
      (item) => item.raw_text === "Call the landlord back",
    ) ?? false,
  ).toBe(savedInSession);
}

describe("capture storage and account notice truth (#967)", () => {
  it("W5-4: another capture's receipt cannot clear an area created while it was in flight", async () => {
    await renderSettled();
    const restoreDb = makeIndexedDbUnavailable();
    const restoreSession = makeSessionStorageSnapshotWriteFail();
    let resolveCapture!: (value: unknown) => void;
    mockCreateCaptureItem.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCapture = resolve;
      }),
    );
    try {
      fireEvent.click(screen.getByText("Capture"));
      await waitFor(() =>
        expect(mockCreateCaptureItem).toHaveBeenCalledTimes(1),
      );
      fireEvent.click(screen.getByText("Add local area"));
      await act(async () =>
        resolveCapture({
          provider: "supabase",
          capture: { id: PERSISTED_CAPTURE_ID },
        }),
      );
      await waitFor(() =>
        expect(screen.getByTestId("sync-account").textContent).toBe("synced"),
      );
      expect(screen.getByTestId("sync-pending").textContent).toBe("true");
      expect(screen.getByTestId("area-names").textContent).toContain(
        "Local area",
      );
      restoreSession();
      fireEvent.click(screen.getByText("Add local area"));
      expect(window.sessionStorage.getItem(STORAGE_KEY)).toContain(
        "Local area",
      );
      expect(screen.getByTestId("sync-pending").textContent).toBe("true");
    } finally {
      restoreSession();
      restoreDb();
    }
  });

  it("W5-4: receipt metadata survives a later local apply in the same React batch", async () => {
    await renderSettled();
    fireEvent.click(screen.getByText("Save area and edit in one batch"));
    expect(
      screen.getByTestId("area-names").textContent.match(/Batched area/g),
    ).toHaveLength(1);
    expect(screen.getByTestId("area-colors").textContent).toContain("#222222");
    expect(screen.getByTestId("sync-pending").textContent).toBe("true");
    const saved = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY)!);
    const owner = Object.values(saved.snapshotOwnership.rows.areas).find(
      (entry) =>
        (entry as { accountId?: string }).accountId ===
        "66666666-6666-4666-8666-666666666666",
    ) as { creation: { pending: boolean } };
    expect(owner.creation.pending).toBe(false);
  });

  it.each([false, true])(
    "W5-4: orders area writes and delivers the latest color after earlier failure=%s",
    async (failFirst) => {
      await renderSettled();
      const areaId = observedWorkflow.state.areas.find(
        (area) => area.name === PERSISTED_AREA.name,
      )!.id;
      let storedColor = PERSISTED_AREA.color;
      const deliveries: Array<() => void> = [];
      const write = vi.fn(async (color: string) => {
        await new Promise<void>((resolve) => deliveries.push(resolve));
        if (failFirst && color === "#111111")
          throw new Error("Synthetic area write refused");
        storedColor = color;
      });
      const saveColor = (color: string) => {
        const receipt = observedWorkflow.updateAreaColor(areaId, color);
        return observedWorkflow
          .runAreaWrite(receipt, async () => {
            await write(color);
            observedWorkflow.acknowledgeAreaSave(receipt, {
              ...PERSISTED_AREA,
              color,
            });
            observedWorkflow.syncPersistedAreas([{ ...PERSISTED_AREA, color }]);
          })
          .catch(() => undefined);
      };
      let first!: Promise<void>;
      let second!: Promise<void>;
      act(() => {
        first = saveColor("#111111");
        second = saveColor("#222222");
      });
      expect(write).toHaveBeenCalledTimes(1);
      await act(async () => {
        deliveries[0]();
        await first;
      });
      expect(screen.getByTestId("area-colors").textContent).toContain(
        "#222222",
      );
      expect(screen.getByTestId("sync-pending").textContent).toBe("true");
      expect(write).toHaveBeenCalledTimes(2);
      await act(async () => {
        deliveries[1]();
        await second;
      });
      expect(storedColor).toBe("#222222");
      expect(screen.getByTestId("area-colors").textContent).toContain(
        "#222222",
      );
      await waitFor(() =>
        expect(screen.getByTestId("sync-pending").textContent).toBe("false"),
      );
    },
  );

  it("W5-4: reset cancels a queued area write", async () => {
    await renderSettled();
    const areaId = observedWorkflow.state.areas[0].id;
    let deliver!: () => void;
    let first!: Promise<void>;
    let second!: Promise<void>;
    const queuedWrite = vi.fn().mockResolvedValue(undefined);
    act(() => {
      const receipt = observedWorkflow.updateAreaColor(areaId, "#111111");
      first = observedWorkflow.runAreaWrite(
        receipt,
        () =>
          new Promise<void>((resolve) => {
            deliver = resolve;
          }),
      );
      const next = observedWorkflow.updateAreaColor(areaId, "#222222");
      second = observedWorkflow.runAreaWrite(next, queuedWrite);
    });
    await act(async () => {
      await observedWorkflow.resetWorkflow();
    });
    await act(async () => {
      deliver();
      await Promise.all([first, second]);
    });
    expect(queuedWrite).not.toHaveBeenCalled();
  });

  it("R-967 target: account acknowledgment with both local stores blocked owes no capture write", async () => {
    await renderSettled();
    const restoreDb = makeIndexedDbUnavailable();
    const restoreSession = makeSessionStorageSnapshotWriteFail();
    const readsBefore = mockListCaptureItems.mock.calls.length;
    try {
      mockCreateCaptureItem.mockResolvedValueOnce({
        provider: "supabase",
        capture: { id: PERSISTED_CAPTURE_ID },
      });
      fireEvent.click(screen.getByText("Capture"));
      await waitFor(() =>
        expect(screen.getByTestId("capture-alias").textContent).toBe(
          PERSISTED_CAPTURE_ID,
        ),
      );
      await waitFor(() =>
        expect(mockListCaptureItems).toHaveBeenCalledTimes(readsBefore + 1),
      );
      await act(async () => {});
      expect(screen.getByTestId("sync-account").textContent).toBe("synced");
      expect(screen.getByTestId("sync-storage").textContent).toBe("blocked");
      expect(mockCreateCaptureItem).toHaveBeenCalledTimes(1);
      expectMemoryAndSnapshot(false);
      expect(screen.getByTestId("sync-pending").textContent).toBe("false");
      expect(screen.getByTestId("notice-message").textContent).toBe(
        ACCOUNT_SAVED_DEVICE_STORAGE_BLOCKED,
      );
    } finally {
      restoreSession();
      restoreDb();
    }
  });

  it("R-967 safety: a new memory-only area must not claim account delivery", async () => {
    await renderSettled();
    expect(screen.getByTestId("sync-pending").textContent).toBe("false");
    const restoreSession = makeSessionStorageSnapshotWriteFail();
    try {
      fireEvent.click(screen.getByText("Add local area"));
      await waitFor(() =>
        expect(screen.getByTestId("area-names").textContent).toContain(
          "Local area",
        ),
      );
      expect(screen.getByTestId("sync-storage").textContent).toBe("blocked");
      expect(window.sessionStorage.getItem(STORAGE_KEY)).not.toContain(
        "Local area",
      );
      expect(screen.getByTestId("sync-pending").textContent).toBe("true");
      expect(screen.getByTestId("notice-message").textContent).toBe(
        DEVICE_STORAGE_BLOCKED,
      );
    } finally {
      restoreSession();
    }
  });

  it("R-967 safety: a successful capture must retain an earlier memory-only failed capture warning", async () => {
    await renderSettled();
    const restoreDb = makeIndexedDbUnavailable();
    const restoreSession = makeSessionStorageSnapshotWriteFail();
    const readsBefore = mockListCaptureItems.mock.calls.length;
    try {
      mockCreateCaptureItem.mockRejectedValueOnce(
        new Error("First capture account save refused"),
      );
      fireEvent.click(screen.getByText("Capture"));
      await waitFor(() =>
        expect(screen.getByTestId("sync-account").textContent).toBe(
          "sync-error",
        ),
      );
      expect(screen.getByTestId("capture-count").textContent).toBe("1");
      expect(screen.getByTestId("sync-pending").textContent).toBe("true");
      mockCreateCaptureItem.mockResolvedValueOnce({
        provider: "supabase",
        capture: { id: PERSISTED_CAPTURE_ID },
      });
      fireEvent.click(screen.getByText("Capture"));
      await waitFor(() =>
        expect(screen.getByTestId("capture-aliases").textContent).toContain(
          PERSISTED_CAPTURE_ID,
        ),
      );
      await waitFor(() =>
        expect(mockListCaptureItems).toHaveBeenCalledTimes(readsBefore + 1),
      );
      await act(async () => {});
      expect(mockCreateCaptureItem).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId("capture-count").textContent).toBe("2");
      expect(screen.getByTestId("sync-account").textContent).toBe("synced");
      expect(screen.getByTestId("sync-storage").textContent).toBe("blocked");
      expect(screen.getByTestId("sync-pending").textContent).toBe("true");
      expect(screen.getByTestId("notice-message").textContent).toBe(
        DEVICE_STORAGE_BLOCKED,
      );
    } finally {
      restoreSession();
      restoreDb();
    }
  });

  it("D: failed journal plus account success/readback keeps storage truth without inventing pending work", async () => {
    await renderSettled();
    const restore = makeIndexedDbUnavailable();
    const readsBefore = mockListCaptureItems.mock.calls.length;
    try {
      mockCreateCaptureItem.mockResolvedValueOnce({
        provider: "supabase",
        capture: { id: PERSISTED_CAPTURE_ID },
      });
      fireEvent.click(screen.getByText("Capture"));
      await waitFor(() =>
        expect(screen.getByTestId("capture-alias").textContent).toBe(
          PERSISTED_CAPTURE_ID,
        ),
      );
      await act(async () => {});
      expect(screen.getByTestId("sync-account").textContent).toBe("synced");
      expect(screen.getByTestId("sync-storage").textContent).toBe("blocked");
      expect(screen.getByTestId("sync-pending").textContent).toBe("false");
      expect(mockCreateCaptureItem).toHaveBeenCalledTimes(1);
      expect(mockListCaptureItems).toHaveBeenCalledTimes(readsBefore + 1);
      expect(await listPendingWrites()).toEqual([]);
      expect(await listPendingCaptures()).toEqual([]);
      expectMemoryAndSnapshot(true);
      expect(screen.getByTestId("notice-tone").textContent).toBe("alarm");
      expect(screen.getByTestId("notice-message").textContent).toBe(
        ACCOUNT_SAVED_DEVICE_STORAGE_BLOCKED,
      );
    } finally {
      restore();
    }
  });

  it("E: account fallback preserves unrelated queued work and its pending status", async () => {
    await renderSettled();
    const queued = await enqueuePendingWrite({
      clientWriteId: "unrelated-review-967",
      entity: "review",
      payload: { synthetic: true },
    });
    vi.spyOn(durableWrites, "journalCaptureWrite").mockRejectedValueOnce(
      new Error("Synthetic capture journal write refused"),
    );
    mockCreateCaptureItem.mockResolvedValueOnce({
      provider: "supabase",
      capture: { id: PERSISTED_CAPTURE_ID },
    });
    fireEvent.click(screen.getByText("Capture"));
    await waitFor(() =>
      expect(screen.getByTestId("capture-alias").textContent).toBe(
        PERSISTED_CAPTURE_ID,
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId("sync-pending").textContent).toBe("true"),
    );
    expect(screen.getByTestId("sync-account").textContent).toBe("synced");
    expect(screen.getByTestId("sync-storage").textContent).toBe("blocked");
    expect(await listPendingWrites()).toEqual([queued]);
    expect(await listPendingCaptures()).toEqual([]);
    expectMemoryAndSnapshot(true);
    expect(screen.getByTestId("notice-tone").textContent).toBe("alarm");
    expect(screen.getByTestId("notice-message").textContent).toBe(
      DEVICE_STORAGE_BLOCKED,
    );
  });

  it("A: failed account fallback retains the session copy, storage warning and account-failure status", async () => {
    await renderSettled();
    const restore = makeIndexedDbUnavailable();
    try {
      mockCreateCaptureItem.mockRejectedValueOnce(
        new Error("network unavailable"),
      );
      fireEvent.click(screen.getByText("Capture"));
      await waitFor(() =>
        expect(screen.getByTestId("sync-account").textContent).toBe(
          "sync-error",
        ),
      );
      expect(mockCreateCaptureItem).toHaveBeenCalledTimes(1);
      expectMemoryAndSnapshot(true);
      expect(screen.getByTestId("sync-storage").textContent).toBe("blocked");
      expect(screen.getByTestId("sync-message").textContent).toBe(
        ACCOUNT_SAVE_FAILED,
      );
      expect(await listPendingWrites()).toEqual([]);
      expect(await listPendingCaptures()).toEqual([]);
      expect(screen.getByTestId("notice-message").textContent).toBe(
        DEVICE_STORAGE_BLOCKED,
      );
      expect(screen.getByTestId("notice-tone").textContent).toBe("alarm");
    } finally {
      restore();
    }
  });

  it("B: failed journal, session snapshot and account write leave only memory; storage warning wins", async () => {
    await renderSettled();
    const restoreDb = makeIndexedDbUnavailable();
    const restoreSession = makeSessionStorageSnapshotWriteFail();
    try {
      mockCreateCaptureItem.mockRejectedValueOnce(
        new Error("network unavailable"),
      );
      fireEvent.click(screen.getByText("Capture"));
      await waitFor(() =>
        expect(screen.getByTestId("sync-account").textContent).toBe(
          "sync-error",
        ),
      );
      await waitFor(() =>
        expect(screen.getByTestId("sync-storage").textContent).toBe("blocked"),
      );
      expect(mockCreateCaptureItem).toHaveBeenCalledTimes(1);
      expectMemoryAndSnapshot(false);
      expect(screen.getByTestId("notice-message").textContent).toBe(
        DEVICE_STORAGE_BLOCKED,
      );
      expect(screen.getByTestId("notice-tone").textContent).toBe("alarm");
    } finally {
      restoreSession();
      restoreDb();
    }
  });

  it("C: account success plus failed readback preserves alias/session copy and load classification while storage warning stays visible", async () => {
    await renderSettled();
    const restore = makeIndexedDbUnavailable();
    const readsBefore = mockListCaptureItems.mock.calls.length;
    try {
      mockCreateCaptureItem.mockImplementationOnce(async () => {
        // Arm at the successful write, so only its subsequent readback fails.
        mockListCaptureItems.mockRejectedValueOnce(
          new Error("readback failed"),
        );
        return { provider: "supabase", capture: { id: PERSISTED_CAPTURE_ID } };
      });
      fireEvent.click(screen.getByText("Capture"));
      await waitFor(() =>
        expect(screen.getByTestId("sync-account").textContent).toBe(
          "sync-error",
        ),
      );
      await waitFor(() =>
        expect(screen.getByTestId("sync-storage").textContent).toBe("blocked"),
      );
      expect(mockCreateCaptureItem).toHaveBeenCalledTimes(1);
      expect(mockListCaptureItems).toHaveBeenCalledTimes(readsBefore + 1);
      await expect(
        mockCreateCaptureItem.mock.results[0].value,
      ).resolves.toEqual({
        provider: "supabase",
        capture: { id: PERSISTED_CAPTURE_ID },
      });
      expect(screen.getByTestId("capture-alias").textContent).toBe(
        PERSISTED_CAPTURE_ID,
      );
      expectMemoryAndSnapshot(true);
      // An acknowledged account write must not be called a save failure.
      // The load-failure classification survives beneath the storage notice.
      expect(screen.getByTestId("sync-message").textContent).toBe(
        persistedLoadFailureMessage,
      );
      expect(screen.getByTestId("notice-message").textContent).toBe(
        DEVICE_STORAGE_BLOCKED,
      );
      expect(screen.getByTestId("notice-tone").textContent).toBe("alarm");
    } finally {
      restore();
    }
  });
});
