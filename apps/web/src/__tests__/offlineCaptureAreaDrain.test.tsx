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
