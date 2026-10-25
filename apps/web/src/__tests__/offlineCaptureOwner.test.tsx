// W3-16 #1 sibling: the offline capture queue is shared by every account that
// signs in on this browser. A capture queued while account A was signed in
// must never be sent through account B's session. It waits on the device
// for A, untouched.
import "fake-indexeddb/auto";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowProvider, useWorkflow } from "@/lib/WorkflowContext";
import {
  enqueueCapture,
  listPendingCaptures,
} from "@/lib/capture/offlineQueue";
import {
  getDeviceAccount,
  setDeviceAccount,
} from "@/lib/durability/deviceAccount";
import {
  clearPendingWrites,
  enqueuePendingWrite,
} from "@/lib/durability/pendingWriteJournal";

const ACCOUNT_A = "44444444-4444-4444-8444-444444444444";
const ACCOUNT_B = "55555555-5555-4555-8555-555555555555";

const {
  mockListAreas,
  mockListCaptureItems,
  mockListPlanningItems,
  mockListExecutionReviewItems,
  mockListWinRecords,
  mockListOverrideRecords,
  mockListDurationProfiles,
  mockListSuggestionRecords,
  mockSyncQueuedCapture,
  mockGetUser,
  authListener,
  mockCreateSupabaseBrowserClient,
} = vi.hoisted(() => {
  const getUser = vi.fn();
  const listener: {
    callback: ((event: string, session: unknown) => void) | null;
  } = { callback: null };
  return {
    mockListAreas: vi.fn(),
    mockListCaptureItems: vi.fn(),
    mockListPlanningItems: vi.fn(),
    mockListExecutionReviewItems: vi.fn(),
    mockListWinRecords: vi.fn(),
    mockListOverrideRecords: vi.fn(),
    mockListDurationProfiles: vi.fn(),
    mockListSuggestionRecords: vi.fn(),
    mockSyncQueuedCapture: vi.fn(async () => ({ provider: "supabase" })),
    mockGetUser: getUser,
    authListener: listener,
    mockCreateSupabaseBrowserClient: vi.fn(() => ({
      mocked: true,
      auth: {
        getUser,
        onAuthStateChange: (
          callback: (event: string, session: unknown) => void,
        ) => {
          listener.callback = callback;
          return { data: { subscription: { unsubscribe: () => undefined } } };
        },
      },
    })),
  };
});

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
    syncQueuedCapture: mockSyncQueuedCapture,
  };
});

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: mockCreateSupabaseBrowserClient,
}));

beforeEach(async () => {
  window.sessionStorage.clear();
  setDeviceAccount(undefined);
  await clearPendingWrites();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase("lifeos-capture-queue");
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
  mockListAreas.mockResolvedValue({ provider: "supabase", areas: [] });
  const rows = { provider: "supabase" };
  mockListCaptureItems.mockResolvedValue({ ...rows, captures: [] });
  mockListPlanningItems.mockResolvedValue({
    ...rows,
    tasks: [],
    proposals: [],
    blocks: [],
  });
  mockListExecutionReviewItems.mockResolvedValue({
    ...rows,
    tasks: [],
    blocks: [],
    sessions: [],
    reviewEntries: [],
  });
  mockListWinRecords.mockResolvedValue({ provider: "mock", winRecords: [] });
  mockListOverrideRecords.mockResolvedValue({
    provider: "mock",
    overrideRecords: [],
  });
  mockListDurationProfiles.mockResolvedValue({
    provider: "mock",
    durationProfiles: [],
  });
  mockListSuggestionRecords.mockResolvedValue({
    provider: "mock",
    suggestionRecords: [],
  });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  window.sessionStorage.clear();
  setDeviceAccount(undefined);
});

function sentTexts() {
  return (mockSyncQueuedCapture.mock.calls as unknown[][]).map(
    (call) => (call[1] as { raw_text: string }).raw_text,
  );
}

async function queueAccountACaptureAndSignal() {
  // Queued while A is signed in on this device.
  setDeviceAccount(ACCOUNT_A);
  await enqueueCapture({ rawText: "Account A offline thought", areaId: null });
  // Queued signed out: never gated by owner, so once it is sent the drain
  // has really run past A's capture.
  setDeviceAccount(null);
  await enqueueCapture({ rawText: "Signal capture", areaId: null });
  setDeviceAccount(undefined);
}

describe("W3-16 #1 sibling: the offline queue holds a capture for its own account", () => {
  it.each(["read", "event"])(
    "reveals retained offline projections when the owner is established by %s",
    async (source) => {
      await queueAccountACaptureAndSignal();
      setDeviceAccount(ACCOUNT_A);
      await enqueuePendingWrite({
        entity: "review",
        payload: { review_type: "daily", period_start: "2026-08-01" },
      });
      setDeviceAccount(undefined);
      vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
      let resolveIdentity!: (value: unknown) => void;
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: "offline" },
      });
      mockGetUser.mockResolvedValueOnce({
        data: { user: null },
        error: { message: "offline" },
      });
      mockGetUser.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveIdentity = resolve;
          }),
      );
      let retryIdentity!: () => Promise<void>;
      function Projection() {
        const { unsyncedCaptureCount, journalledClosedDays, retryPendingAccountWrites } = useWorkflow();
        retryIdentity = retryPendingAccountWrites;
        return (
          <output data-testid="projection">
            {unsyncedCaptureCount}:{journalledClosedDays.join(",")}
          </output>
        );
      }
      render(
        <WorkflowProvider>
          <Projection />
        </WorkflowProvider>,
      );
      expect(screen.queryByTestId("projection")).not.toBeInTheDocument();
      await waitFor(() =>
        expect(screen.getByTestId("projection").textContent).toBe("1:"),
      );
      act(() => { void retryIdentity(); });
      await waitFor(() => expect(resolveIdentity).toBeTypeOf("function"));
      await act(async () => {
        if (source === "event") {
          authListener.callback?.("SIGNED_IN", { user: { id: ACCOUNT_A } });
          resolveIdentity({
            data: { user: null },
            error: { message: "offline" },
          });
        } else {
          resolveIdentity({ data: { user: { id: ACCOUNT_A } }, error: null });
        }
      });
      await waitFor(() =>
        expect(screen.getByTestId("projection").textContent).toBe(
          "2:2026-08-01",
        ),
      );
      expect(await listPendingCaptures()).toHaveLength(2);
    },
  );

  it.each(["delayed", "failed"])(
    "hides owned queue counts with a %s initial identity read",
    async (identityState) => {
      await queueAccountACaptureAndSignal();
      vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
      let resolveIdentity!: (value: unknown) => void;
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: "offline" },
      });
      if (identityState === "delayed") {
        mockGetUser.mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveIdentity = resolve;
            }),
        );
      }
      function Count() {
        const { unsyncedCaptureCount } = useWorkflow();
        return (
          <output data-testid="queue-count">{unsyncedCaptureCount}</output>
        );
      }
      const mounted = render(
        <WorkflowProvider>
          <Count />
        </WorkflowProvider>,
      );
      await waitFor(() => expect(mockGetUser).toHaveBeenCalled());
      if (identityState === "delayed") {
        await waitFor(() => expect(resolveIdentity).toBeTypeOf("function"));
        expect(screen.queryByTestId("queue-count")).not.toBeInTheDocument();
        expect(getDeviceAccount()).toBeUndefined();
        expect(await listPendingCaptures()).toHaveLength(2);
        await act(async () => {
          resolveIdentity({
            data: { user: null },
            error: { message: "offline" },
          });
        });
      }
      // The unowned row proves the asynchronous count finished loading.
      await waitFor(() =>
        expect(screen.getByTestId("queue-count").textContent).not.toBe("0"),
      );
      expect(screen.getByTestId("queue-count").textContent).toBe("1");
      expect(getDeviceAccount()).toBeUndefined();
      expect(await listPendingCaptures()).toHaveLength(2);
      mounted.unmount();
    },
  );

  it.each([ACCOUNT_A, null])(
    "ignores a stale successful identity answer (%s) after B signs in",
    async (staleAccount) => {
      await queueAccountACaptureAndSignal();
      let resolveIdentity!: (value: unknown) => void;
      mockGetUser.mockResolvedValue({
        data: { user: { id: ACCOUNT_B } },
        error: null,
      });
      mockGetUser.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveIdentity = resolve;
          }),
      );
      render(
        <WorkflowProvider>
          <div />
        </WorkflowProvider>,
      );
      await waitFor(() => expect(resolveIdentity).toBeTypeOf("function"));
      await act(async () => {
        authListener.callback?.("SIGNED_OUT", null);
        authListener.callback?.("SIGNED_IN", { user: { id: ACCOUNT_B } });
      });
      expect(getDeviceAccount()).toBe(ACCOUNT_B);
      await act(async () => {
        resolveIdentity({
          data: { user: staleAccount ? { id: staleAccount } : null },
          error: null,
        });
      });
      expect(getDeviceAccount()).toBe(ACCOUNT_B);
      const made = await enqueueCapture({
        rawText: "B new work",
        areaId: null,
      });
      expect(made.owner_user_id).toBe(ACCOUNT_B);
      await waitFor(() => expect(sentTexts()).toContain("Signal capture"));
      expect(sentTexts()).not.toContain("Account A offline thought");
    },
  );

  it("ignores a stale identity answer after sign-out", async () => {
    let resolveIdentity!: (value: unknown) => void;
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    mockGetUser.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveIdentity = resolve;
        }),
    );
    render(
      <WorkflowProvider>
        <div />
      </WorkflowProvider>,
    );
    await waitFor(() => expect(resolveIdentity).toBeTypeOf("function"));
    await act(async () => {
      authListener.callback?.("SIGNED_OUT", null);
      resolveIdentity({ data: { user: { id: ACCOUNT_A } }, error: null });
    });
    expect(getDeviceAccount()).toBeNull();
    const made = await enqueueCapture({
      rawText: "signed-out work",
      areaId: null,
    });
    expect(made.owner_user_id).toBeUndefined();
  });

  it("an unmounted provider cannot overwrite a new provider's owner", async () => {
    let resolveIdentity!: (value: unknown) => void;
    mockGetUser.mockResolvedValue({
      data: { user: { id: ACCOUNT_B } },
      error: null,
    });
    mockGetUser.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveIdentity = resolve;
        }),
    );
    const old = render(
      <WorkflowProvider>
        <div />
      </WorkflowProvider>,
    );
    await waitFor(() => expect(resolveIdentity).toBeTypeOf("function"));
    const oldListener = authListener.callback;
    old.unmount();
    render(
      <WorkflowProvider>
        <div />
      </WorkflowProvider>,
    );
    await waitFor(() => expect(getDeviceAccount()).toBe(ACCOUNT_B));
    await act(async () => {
      resolveIdentity({ data: { user: { id: ACCOUNT_A } }, error: null });
    });
    expect(getDeviceAccount()).toBe(ACCOUNT_B);
    await act(async () => {
      oldListener?.("SIGNED_OUT", null);
    });
    expect(getDeviceAccount()).toBe(ACCOUNT_B);
    const made = await enqueueCapture({
      rawText: "new provider work",
      areaId: null,
    });
    expect(made.owner_user_id).toBe(ACCOUNT_B);
  });

  it("a capture queued under A is never sent through B's session", async () => {
    await queueAccountACaptureAndSignal();
    mockGetUser.mockResolvedValue({
      data: { user: { id: ACCOUNT_B } },
      error: null,
    });

    render(
      <WorkflowProvider>
        <div />
      </WorkflowProvider>,
    );

    await waitFor(() => expect(sentTexts()).toContain("Signal capture"), {
      timeout: 3000,
    });
    expect(sentTexts()).not.toContain("Account A offline thought");
    const left = await listPendingCaptures();
    expect(left.map((capture) => capture.raw_text)).toEqual([
      "Account A offline thought",
    ]);
  });

  it("a failed identity read is 'not known', never 'signed out': A keeps ownership", async () => {
    // An unowned signal capture: once it is sent, the mount's account sync
    // (and its identity read) has finished.
    await enqueueCapture({ rawText: "Signal capture", areaId: null });
    // supabase-js answers a network or auth-server failure with an error
    // object, not a throw.
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: "fetch failed" },
    });
    // The account read answers after the auth event below, so the failed
    // identity read really comes AFTER the device learned it is A.
    mockListAreas.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ provider: "supabase", areas: [] }), 50),
        ),
    );

    render(
      <WorkflowProvider>
        <div />
      </WorkflowProvider>,
    );
    await act(async () => {
      authListener.callback?.("INITIAL_SESSION", { user: { id: ACCOUNT_A } });
      await Promise.resolve();
    });

    await waitFor(() => expect(sentTexts()).toContain("Signal capture"), {
      timeout: 3000,
    });
    expect(getDeviceAccount()).toBe(ACCOUNT_A);
    // A capture made now is still stamped as A's.
    const made = await enqueueCapture({ rawText: "after", areaId: null });
    expect(made.owner_user_id).toBe(ACCOUNT_A);
  });

  it("control: the same capture is sent once A is signed in again", async () => {
    await queueAccountACaptureAndSignal();
    mockGetUser.mockResolvedValue({
      data: { user: { id: ACCOUNT_A } },
      error: null,
    });

    render(
      <WorkflowProvider>
        <div />
      </WorkflowProvider>,
    );

    await waitFor(
      () => expect(sentTexts()).toContain("Account A offline thought"),
      { timeout: 3000 },
    );
    await waitFor(async () =>
      expect(await listPendingCaptures()).toHaveLength(0),
    );
  });
});
