// Bug hunt #5 — offline captures are sent up when the app reopens. The drain
// used to run before the account's areas had loaded, so the area the person
// picked resolved to nothing: the thought was filed with no area and removed
// from the queue, losing the choice for good. The drain must wait for the
// areas, and an item whose area is not known yet must stay queued.
import "fake-indexeddb/auto";
import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowProvider, useWorkflow } from "@/lib/WorkflowContext";
import {
  getDeviceAccount,
  setDeviceAccount,
} from "@/lib/durability/deviceAccount";
import {
  enqueueCapture,
  listPendingCaptures,
} from "@/lib/capture/offlineQueue";

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
  mockCreateSupabaseBrowserClient,
  mockGetUser,
  authListener,
} = vi.hoisted(() => ({
  mockListAreas: vi.fn(),
  mockListCaptureItems: vi.fn(),
  mockListPlanningItems: vi.fn(),
  mockListExecutionReviewItems: vi.fn(),
  mockListWinRecords: vi.fn(),
  mockListOverrideRecords: vi.fn(),
  mockListDurationProfiles: vi.fn(),
  mockListSuggestionRecords: vi.fn(),
  mockSyncQueuedCapture: vi.fn(async () => ({ provider: "supabase" })),
  mockCreateSupabaseBrowserClient: vi.fn(() => ({ mocked: true })),
  mockGetUser: vi.fn(),
  authListener: {
    callback: null as ((event: string, session: unknown) => void) | null,
  },
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
    syncQueuedCapture: mockSyncQueuedCapture,
  };
});

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: mockCreateSupabaseBrowserClient,
}));

const persistedArea = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "22222222-2222-4222-8222-222222222222",
  name: "Main Job",
  slug: "main-job",
  description: "Persisted area",
  color: "#2563eb",
  icon: "briefcase",
  sort_order: 0,
  is_active: true,
  created_at: "2026-05-27T00:00:00.000Z",
  updated_at: "2026-05-27T00:00:00.000Z",
};

beforeEach(async () => {
  mockCreateSupabaseBrowserClient.mockImplementation(() => ({ mocked: true }));
  setDeviceAccount(undefined);
  window.sessionStorage.clear();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase("lifeos-capture-queue");
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
  // The account area read answers well after IndexedDB does.
  mockListAreas.mockImplementation(
    () =>
      new Promise((resolve) =>
        setTimeout(
          () => resolve({ provider: "supabase", areas: [persistedArea] }),
          150,
        ),
      ),
  );
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
  window.sessionStorage.clear();
  setDeviceAccount(undefined);
});

describe("W7-8: offline area readiness belongs to the active account", () => {
  const accountA = persistedArea.user_id;
  const accountB = "55555555-5555-4555-8555-555555555555";
  const areaB = {
    ...persistedArea,
    id: "66666666-6666-4666-8666-666666666666",
    user_id: accountB,
  };
  let workflow: ReturnType<typeof useWorkflow>;

  function Harness() {
    workflow = useWorkflow();
    return null;
  }

  beforeEach(() => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: accountA } },
      error: null,
    });
    mockCreateSupabaseBrowserClient.mockImplementation(() => ({
      mocked: true,
      auth: {
        getUser: mockGetUser,
        onAuthStateChange: (
          callback: (event: string, session: unknown) => void,
        ) => {
          authListener.callback = callback;
          return { data: { subscription: { unsubscribe: () => undefined } } };
        },
      },
    }));
  });

  async function switchAccount(userId: string) {
    mockGetUser.mockResolvedValue({
      data: { user: { id: userId } },
      error: null,
    });
    await act(async () => {
      authListener.callback!("SIGNED_IN", { user: { id: userId } });
    });
  }

  async function queueAndDrain() {
    const subject = await enqueueCapture({
      rawText: "Keep the selected account area",
      areaId: "area-main-job",
      returnHook: "after lunch",
    });
    const signal = await enqueueCapture({
      rawText: "Drain signal",
      areaId: null,
    });
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() =>
      expect(mockSyncQueuedCapture).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          client_capture_id: signal.client_capture_id,
        }),
      ),
    );
    await waitFor(async () =>
      expect(
        (await listPendingCaptures()).some(
          (row) => row.client_capture_id === signal.client_capture_id,
        ),
      ).toBe(false),
    );
    return subject;
  }

  async function expectHeld(subjectId: string) {
    expect(
      mockSyncQueuedCapture.mock.calls.some(
        (call) =>
          (call as unknown[])[1] &&
          ((call as unknown[])[1] as { client_capture_id: string })
            .client_capture_id === subjectId,
      ),
    ).toBe(false);
    expect(await listPendingCaptures()).toEqual([
      expect.objectContaining({
        client_capture_id: subjectId,
        raw_text: "Keep the selected account area",
        area_id: "area-main-job",
        return_hook: "after lunch",
      }),
    ]);
  }

  it.each([{ areas: [] }, { areas: [persistedArea] }])(
    "holds B's capture while B's read is pending after A loaded $areas",
    async ({ areas }) => {
      mockListAreas.mockResolvedValue({ provider: "supabase", areas });
      render(
        <WorkflowProvider>
          <Harness />
        </WorkflowProvider>,
      );
      await waitFor(() => expect(workflow.syncStatus.account).toBe("synced"));
      let resolveB!: (value: unknown) => void;
      mockListAreas.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveB = resolve;
          }),
      );
      await switchAccount(accountB);
      let retry!: Promise<void>;
      act(() => {
        retry = workflow.retryPendingAccountWrites();
      });
      await waitFor(() => expect(resolveB).toBeTypeOf("function"));
      const subject = await queueAndDrain();
      await expectHeld(subject.client_capture_id);
      await act(async () => {
        resolveB({ provider: "supabase", areas: [areaB] });
        await retry;
      });
      await waitFor(async () =>
        expect(await listPendingCaptures()).toHaveLength(0),
      );
      const sends = (mockSyncQueuedCapture.mock.calls as unknown[][]).filter(
        (call) =>
          (call[1] as { client_capture_id: string }).client_capture_id ===
          subject.client_capture_id,
      );
      expect(sends).toHaveLength(1);
      expect(sends[0]![1]).toMatchObject({
        area_id: areaB.id,
        raw_text: "Keep the selected account area",
        return_hook: "after lunch",
      });
    },
  );

  it("holds B's selected area after B's read fails", async () => {
    mockListAreas.mockResolvedValue({ provider: "supabase", areas: [] });
    render(
      <WorkflowProvider>
        <Harness />
      </WorkflowProvider>,
    );
    await waitFor(() => expect(workflow.syncStatus.account).toBe("synced"));
    mockListAreas.mockRejectedValue(new Error("B area read failed"));
    await switchAccount(accountB);
    await act(async () => workflow.retryPendingAccountWrites());
    await waitFor(() => expect(workflow.syncStatus.account).toBe("sync-error"));
    const subject = await queueAndDrain();
    await expectHeld(subject.client_capture_id);
  });

  it("retries an identity read superseded by a same-account token refresh", async () => {
    mockListAreas
      .mockRejectedValueOnce(new Error("First area read failed"))
      .mockResolvedValue({ provider: "supabase", areas: [persistedArea] });
    render(
      <WorkflowProvider>
        <Harness />
      </WorkflowProvider>,
    );
    await waitFor(() => expect(workflow.syncStatus.account).toBe("sync-error"));
    let resolveIdentity!: (value: unknown) => void;
    let resolveFreshIdentity!: (value: unknown) => void;
    mockGetUser
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveIdentity = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFreshIdentity = resolve;
          }),
      );
    const subject = await enqueueCapture({
      rawText: "Keep the selected account area",
      areaId: "area-main-job",
      returnHook: "after lunch",
    });
    let retry!: Promise<void>;
    act(() => {
      retry = workflow.retryPendingAccountWrites();
    });
    await waitFor(() => expect(resolveIdentity).toBeTypeOf("function"));
    await act(async () => {
      authListener.callback!("TOKEN_REFRESHED", { user: { id: accountA } });
      resolveIdentity({ data: { user: { id: accountB } }, error: null });
      await retry;
    });
    await waitFor(() => expect(resolveFreshIdentity).toBeTypeOf("function"));
    expect(getDeviceAccount()).toBe(accountA);
    expect(mockListAreas).toHaveBeenCalledTimes(1);
    await expectHeld(subject.client_capture_id);
    await act(async () => {
      resolveFreshIdentity({ data: { user: { id: accountA } }, error: null });
    });
    await waitFor(async () =>
      expect(await listPendingCaptures()).toHaveLength(0),
    );
    const sends = (mockSyncQueuedCapture.mock.calls as unknown[][]).filter(
      (call) =>
        (call[1] as { client_capture_id: string }).client_capture_id ===
        subject.client_capture_id,
    );
    expect(sends).toHaveLength(1);
    expect(sends[0]![1]).toMatchObject({ area_id: persistedArea.id });
  });

  it("remembers a manual retry while an older account read is still pending", async () => {
    let rejectFirst!: (error: Error) => void;
    mockListAreas
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectFirst = reject;
          }),
      )
      .mockResolvedValue({ provider: "supabase", areas: [persistedArea] });
    const subject = await enqueueCapture({
      rawText: "Retry after the pending account read",
      areaId: "area-main-job",
    });
    render(
      <WorkflowProvider>
        <Harness />
      </WorkflowProvider>,
    );
    await waitFor(() => expect(rejectFirst).toBeTypeOf("function"));
    await act(async () => {
      await workflow.retryPendingAccountWrites();
    });
    await act(async () => {
      rejectFirst(new Error("Older account read failed"));
    });
    await waitFor(async () =>
      expect(await listPendingCaptures()).toHaveLength(0),
    );
    expect(mockListAreas).toHaveBeenCalledTimes(2);
    const sends = (mockSyncQueuedCapture.mock.calls as unknown[][]).filter(
      (call) =>
        (call[1] as { client_capture_id: string }).client_capture_id ===
        subject.client_capture_id,
    );
    expect(sends).toHaveLength(1);
    expect(sends[0]![1]).toMatchObject({ area_id: persistedArea.id });
  });

  it.each([accountB, accountA])(
    "ignores A's old read after switching through B to %s",
    async (destination) => {
      let resolveOld!: (value: unknown) => void;
      let resolveCurrent!: (value: unknown) => void;
      mockListAreas
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveOld = resolve;
            }),
        )
        .mockImplementation(
          () =>
            new Promise((resolve) => {
              resolveCurrent = resolve;
            }),
        );
      render(
        <WorkflowProvider>
          <Harness />
        </WorkflowProvider>,
      );
      await waitFor(() => expect(resolveOld).toBeTypeOf("function"));
      await switchAccount(accountB);
      if (destination === accountA) await switchAccount(accountA);
      await act(async () => {
        resolveOld({ provider: "supabase", areas: [] });
      });
      // The switch owes a new read even though A's read was already running.
      await waitFor(() => expect(resolveCurrent).toBeTypeOf("function"));
      const subject = await queueAndDrain();
      await expectHeld(subject.client_capture_id);
      const area = destination === accountA ? persistedArea : areaB;
      await act(async () => {
        resolveCurrent({ provider: "supabase", areas: [area] });
      });
      await waitFor(async () =>
        expect(await listPendingCaptures()).toHaveLength(0),
      );
      const sends = (mockSyncQueuedCapture.mock.calls as unknown[][]).filter(
        (call) =>
          (call[1] as { client_capture_id: string }).client_capture_id ===
          subject.client_capture_id,
      );
      expect(sends).toHaveLength(1);
      expect(sends[0]![1]).toMatchObject({ area_id: area.id });
    },
  );

  it("does not treat an untagged area update as B's completed read", async () => {
    mockListAreas.mockResolvedValue({ provider: "supabase", areas: [] });
    render(
      <WorkflowProvider>
        <Harness />
      </WorkflowProvider>,
    );
    await waitFor(() => expect(workflow.syncStatus.account).toBe("synced"));
    mockListAreas.mockImplementation(() => new Promise(() => undefined));
    await switchAccount(accountB);
    await act(async () => {
      workflow.syncPersistedAreas([]);
    });
    const subject = await queueAndDrain();
    await expectHeld(subject.client_capture_id);
  });

  it("ignores area rows owned by A when reading B", async () => {
    mockListAreas.mockResolvedValue({ provider: "supabase", areas: [] });
    render(
      <WorkflowProvider>
        <Harness />
      </WorkflowProvider>,
    );
    await waitFor(() => expect(workflow.syncStatus.account).toBe("synced"));
    mockListAreas.mockResolvedValue({
      provider: "supabase",
      areas: [persistedArea],
    });
    await switchAccount(accountB);
    await waitFor(() => expect(workflow.syncStatus.account).toBe("sync-error"));
    const subject = await queueAndDrain();
    await expectHeld(subject.client_capture_id);
  });

  it("revalidates an untagged area replacement after B was already ready", async () => {
    mockListAreas.mockResolvedValue({ provider: "supabase", areas: [] });
    render(
      <WorkflowProvider>
        <Harness />
      </WorkflowProvider>,
    );
    await waitFor(() => expect(workflow.syncStatus.account).toBe("synced"));
    mockListAreas.mockResolvedValue({ provider: "supabase", areas: [areaB] });
    await switchAccount(accountB);
    await waitFor(() =>
      expect(workflow.state.areas).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ user_id: accountB }),
        ]),
      ),
    );
    let resolveFresh!: (value: unknown) => void;
    mockListAreas.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFresh = resolve;
        }),
    );
    await act(async () => {
      workflow.syncPersistedAreas([]);
    });
    const subject = await queueAndDrain();
    await expectHeld(subject.client_capture_id);
    await waitFor(() => expect(resolveFresh).toBeTypeOf("function"));
    await act(async () => {
      resolveFresh({ provider: "supabase", areas: [areaB] });
    });
    await waitFor(async () =>
      expect(await listPendingCaptures()).toHaveLength(0),
    );
    const sends = (mockSyncQueuedCapture.mock.calls as unknown[][]).filter(
      (call) =>
        (call[1] as { client_capture_id: string }).client_capture_id ===
        subject.client_capture_id,
    );
    expect(sends).toHaveLength(1);
    expect(sends[0]![1]).toMatchObject({ area_id: areaB.id });
  });
});

describe("bug hunt #5: the offline drain keeps the chosen area", () => {
  it("waits for the account areas and sends the capture with its area", async () => {
    await enqueueCapture({
      rawText: "Book physio",
      areaId: "area-main-job",
      returnHook: null,
    });

    render(
      <WorkflowProvider>
        <div />
      </WorkflowProvider>,
    );

    await waitFor(() => expect(mockSyncQueuedCapture).toHaveBeenCalled(), {
      timeout: 3000,
    });
    for (const call of mockSyncQueuedCapture.mock.calls as unknown[][]) {
      expect(call[1]).toMatchObject({ area_id: persistedArea.id });
    }
    await waitFor(async () =>
      expect(await listPendingCaptures()).toHaveLength(0),
    );
  });
});

// W3-16 finding 8: the drain uses "the account has no areas" as its signal
// for "the areas have not loaded yet". The source comment above promises
// that once the areas ARE known and the chosen one is gone, the capture
// goes up with no area. A read that SUCCEEDS with zero areas looks exactly
// like a read still in flight, so the capture stays queued forever.
//
// Each case also queues a capture with no area as a positive signal: it is
// never gated, so once it is sent the drain has really run.
describe("offline drain when the chosen area is gone (W3-16 #8)", () => {
  const otherArea = {
    ...persistedArea,
    id: "33333333-3333-4333-8333-333333333333",
    name: "Side Project",
    slug: "side-project",
  };

  async function queueSubjectAndSignal() {
    const subject = await enqueueCapture({
      rawText: "Book physio",
      areaId: "area-main-job",
      returnHook: "after lunch",
    });
    const signal = await enqueueCapture({
      rawText: "Signal capture with no area",
      areaId: null,
      returnHook: null,
    });
    return { subject, signal };
  }

  function sentIds() {
    return (mockSyncQueuedCapture.mock.calls as unknown[][]).map(
      (call) => (call[1] as { client_capture_id: string }).client_capture_id,
    );
  }

  async function waitForDrainSignal(signalId: string) {
    await waitFor(() => expect(sentIds()).toContain(signalId), {
      timeout: 3000,
    });
  }

  it("control: a failed area read keeps the capture and its text queued", async () => {
    mockListAreas.mockRejectedValue(new Error("network down"));
    const { subject, signal } = await queueSubjectAndSignal();

    render(
      <WorkflowProvider>
        <div />
      </WorkflowProvider>,
    );

    await waitForDrainSignal(signal.client_capture_id);
    expect(sentIds()).not.toContain(subject.client_capture_id);
    const pending = await listPendingCaptures();
    expect(pending.map((item) => item.client_capture_id)).toEqual([
      subject.client_capture_id,
    ]);
    expect(pending[0]).toMatchObject({
      raw_text: "Book physio",
      area_id: "area-main-job",
      return_hook: "after lunch",
    });
  });

  it("control: while the area read is still pending, a reconnect keeps the capture queued", async () => {
    mockListAreas.mockImplementation(() => new Promise(() => undefined));
    const { subject, signal } = await queueSubjectAndSignal();

    render(
      <WorkflowProvider>
        <div />
      </WorkflowProvider>,
    );
    window.dispatchEvent(new Event("online"));

    await waitForDrainSignal(signal.client_capture_id);
    expect(sentIds()).not.toContain(subject.client_capture_id);
    expect(
      (await listPendingCaptures()).map((item) => item.client_capture_id),
    ).toEqual([subject.client_capture_id]);
  });

  it("control: the chosen area is gone but another exists, so the capture goes up with no area", async () => {
    mockListAreas.mockResolvedValue({
      provider: "supabase",
      areas: [otherArea],
    });
    const { subject, signal } = await queueSubjectAndSignal();

    render(
      <WorkflowProvider>
        <div />
      </WorkflowProvider>,
    );

    await waitForDrainSignal(signal.client_capture_id);
    await waitFor(() => expect(sentIds()).toContain(subject.client_capture_id));
    const subjectCalls = (mockSyncQueuedCapture.mock.calls as unknown[][])
      .map((call) => call[1] as Record<string, unknown>)
      .filter((args) => args.client_capture_id === subject.client_capture_id);
    expect(subjectCalls[0]).toMatchObject({
      raw_text: "Book physio",
      area_id: null,
      return_hook: "after lunch",
    });
    await waitFor(async () =>
      expect(await listPendingCaptures()).toHaveLength(0),
    );
  });

  // W3-16 #8: a successful read with zero areas counts as "areas known", so
  // the capture whose area is gone goes up once with no area.
  it("the account read succeeds with no areas, so the capture goes up once with no area", async () => {
    mockListAreas.mockResolvedValue({ provider: "supabase", areas: [] });
    const { subject, signal } = await queueSubjectAndSignal();

    render(
      <WorkflowProvider>
        <div />
      </WorkflowProvider>,
    );

    await waitForDrainSignal(signal.client_capture_id);
    await waitFor(() => expect(sentIds()).toContain(subject.client_capture_id));
    const subjectCalls = (mockSyncQueuedCapture.mock.calls as unknown[][])
      .map((call) => call[1] as Record<string, unknown>)
      .filter((args) => args.client_capture_id === subject.client_capture_id);
    expect(subjectCalls).toHaveLength(1);
    expect(subjectCalls[0]).toMatchObject({
      raw_text: "Book physio",
      area_id: null,
      return_hook: "after lunch",
      client_capture_id: subject.client_capture_id,
    });
    await waitFor(async () =>
      expect(await listPendingCaptures()).toHaveLength(0),
    );
  });
});
