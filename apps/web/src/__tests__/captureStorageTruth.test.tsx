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
import { clearPendingWrites } from "@/lib/durability/pendingWriteJournal";
import { resolveDeviceSaveNotice } from "@/lib/deviceSaveNotice";
import { STORAGE_KEY } from "@/lib/workflowContext/reducerCore";
import {
  ACCOUNT_SAVE_FAILED,
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

function Harness() {
  const {
    state,
    selectedAreaId,
    submitCaptureText,
    syncStatus,
    areasReadbackSettled,
  } = useWorkflow();
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
      <span data-testid="sync-storage">{syncStatus.storage ?? ""}</span>
      <span data-testid="notice-tone">{notice?.tone ?? ""}</span>
      <span data-testid="notice-message">{notice?.message ?? ""}</span>
      <span data-testid="capture-count">{state.captureItems.length}</span>
      <span data-testid="capture-text">{capture?.raw_text ?? ""}</span>
      <span data-testid="capture-alias">{captureAlias ?? ""}</span>
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
  it("A: failed account write leaves a real session copy and the account-failure notice", async () => {
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
      expect(screen.getByTestId("notice-message").textContent).toBe(
        ACCOUNT_SAVE_FAILED,
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

  it("C: account success plus failed readback preserves alias/session copy; failed readback shows the load warning", async () => {
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
        expect(screen.getByTestId("sync-storage").textContent).toBe(
          "available",
        ),
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
      // The failed refresh still remains visible; the account boundary is mocked.
      expect(screen.getByTestId("sync-message").textContent).toBe(
        persistedLoadFailureMessage,
      );
      expect(screen.getByTestId("notice-message").textContent).toBe(
        persistedLoadFailureMessage,
      );
      expect(screen.getByTestId("notice-tone").textContent).toBe("alarm");
    } finally {
      restore();
    }
  });
});
