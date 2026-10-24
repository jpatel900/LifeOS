// Bug hunt #5 — offline captures are sent up when the app reopens. The drain
// used to run before the account's areas had loaded, so the area the person
// picked resolved to nothing: the thought was filed with no area and removed
// from the queue, losing the choice for good. The drain must wait for the
// areas, and an item whose area is not known yet must stay queued.
import "fake-indexeddb/auto";
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowProvider } from "@/lib/WorkflowContext";
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
