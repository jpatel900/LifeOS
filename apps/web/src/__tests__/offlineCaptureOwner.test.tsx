// W3-16 #1 sibling: the offline capture queue is shared by every account that
// signs in on this browser. A capture queued while account A was signed in
// must never be sent through account B's session. It waits on the device
// for A, untouched.
import "fake-indexeddb/auto";
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowProvider } from "@/lib/WorkflowContext";
import {
  enqueueCapture,
  listPendingCaptures,
} from "@/lib/capture/offlineQueue";
import { setDeviceAccount } from "@/lib/durability/deviceAccount";

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
  mockCreateSupabaseBrowserClient,
} = vi.hoisted(() => {
  const getUser = vi.fn();
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
    mockCreateSupabaseBrowserClient: vi.fn(() => ({
      mocked: true,
      auth: { getUser },
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
