import "fake-indexeddb/auto";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowProvider } from "@/lib/WorkflowContext";
import { journalCaptureWrite } from "@/lib/durability/durableWrites";
import {
  clearPendingWrites,
  listPendingWrites,
} from "@/lib/durability/pendingWriteJournal";
import { setDeviceAccount } from "@/lib/durability/deviceAccount";

const { listAreas, syncCapture, getUser } = vi.hoisted(() => ({
  listAreas: vi.fn(),
  syncCapture: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/data/workflow", async () => {
  const actual = await vi.importActual<typeof import("@/lib/data/workflow")>(
    "@/lib/data/workflow",
  );
  return {
    ...actual,
    listAreas,
    syncJournaledCapture: syncCapture,
    listCaptureItems: vi.fn(async () => ({
      provider: "supabase",
      captures: [],
    })),
    listPlanningItems: vi.fn(async () => ({
      provider: "supabase",
      tasks: [],
      proposals: [],
      blocks: [],
    })),
    listExecutionReviewItems: vi.fn(async () => ({
      provider: "supabase",
      tasks: [],
      blocks: [],
      sessions: [],
      reviewEntries: [],
    })),
    listWinRecords: vi.fn(async () => ({ provider: "mock", winRecords: [] })),
    listOverrideRecords: vi.fn(async () => ({
      provider: "mock",
      overrideRecords: [],
    })),
    listDurationProfiles: vi.fn(async () => ({
      provider: "mock",
      durationProfiles: [],
    })),
    listSuggestionRecords: vi.fn(async () => ({
      provider: "mock",
      suggestionRecords: [],
    })),
  };
});

const USER = "22222222-2222-4222-8222-222222222222";
const AREA = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: USER,
  name: "Main Job",
  slug: "main-job",
  description: null,
  color: null,
  icon: null,
  sort_order: 0,
  is_active: true,
  created_at: "2026-05-27T00:00:00.000Z",
  updated_at: "2026-05-27T00:00:00.000Z",
};
const OTHER = {
  ...AREA,
  id: "33333333-3333-4333-8333-333333333333",
  slug: "side-project",
};

beforeEach(async () => {
  vi.resetAllMocks();
  window.sessionStorage.clear();
  await clearPendingWrites();
  setDeviceAccount(USER);
  getUser.mockResolvedValue({ data: { user: { id: USER } }, error: null });
  listAreas.mockResolvedValue({ provider: "supabase", areas: [] });
  syncCapture.mockResolvedValue({
    provider: "supabase",
    captureId: "44444444-4444-4444-8444-444444444444",
  });
});
afterEach(async () => {
  cleanup();
  await clearPendingWrites();
  setDeviceAccount(undefined);
  window.sessionStorage.clear();
});

async function queue(
  persistedAreaId: string | null,
  workflowAreaId: string | null = "area-main-job",
) {
  return journalCaptureWrite({
    workflowCaptureId: "capture-local-deleted-area",
    workflowAreaId,
    persistedAreaId,
    rawText: "Synthetic capture keeps its original text",
    returnHook: "after lunch",
    clientCaptureId: "client-deleted-area",
  });
}

async function waitForAttempt() {
  await waitFor(async () => {
    const writes = await listPendingWrites("capture");
    expect(writes.length === 0 || writes[0]?.last_attempt_failed).toBe(true);
  });
}

describe("journalled capture whose selected area was deleted", () => {
  it.each([
    ["no areas remain", []],
    ["other areas remain", [OTHER]],
  ])("delivers with no area when %s", async (_name, areas) => {
    listAreas.mockResolvedValue({ provider: "supabase", areas });
    await queue(null);
    render(
      <WorkflowProvider>
        <div />
      </WorkflowProvider>,
    );
    await waitForAttempt();
    expect(syncCapture).toHaveBeenCalledTimes(1);
    expect(syncCapture.mock.calls[0]?.[1]).toEqual({
      client_capture_id: "client-deleted-area",
      area_id: null,
      raw_text: "Synthetic capture keeps its original text",
      return_hook: "after lunch",
    });
    expect(await listPendingWrites("capture")).toHaveLength(0);
    act(() => window.dispatchEvent(new Event("online")));
    // A later queue entry proves that the second replay completed.
    await journalCaptureWrite({
      workflowCaptureId: "signal",
      workflowAreaId: null,
      persistedAreaId: null,
      rawText: "Synthetic replay signal",
      returnHook: null,
      clientCaptureId: "signal",
    });
    act(() => window.dispatchEvent(new Event("online")));
    await waitFor(async () =>
      expect(await listPendingWrites("capture")).toHaveLength(0),
    );
    expect(
      syncCapture.mock.calls.filter(
        (call) => call[1].client_capture_id === "client-deleted-area",
      ),
    ).toHaveLength(1);
  });

  it("does not reuse a removed pinned ID or redirect to a replacement with the same slug", async () => {
    listAreas.mockResolvedValue({
      provider: "supabase",
      areas: [{ ...OTHER, slug: AREA.slug }],
    });
    await queue(AREA.id);
    render(
      <WorkflowProvider>
        <div />
      </WorkflowProvider>,
    );
    await waitForAttempt();
    expect(syncCapture.mock.calls[0]?.[1]).toMatchObject({ area_id: null });
    expect(await listPendingWrites("capture")).toHaveLength(0);
  });

  it("preserves an active pinned ID even after its slug changed", async () => {
    listAreas.mockResolvedValue({
      provider: "supabase",
      areas: [{ ...AREA, slug: "renamed" }],
    });
    await queue(AREA.id);
    render(
      <WorkflowProvider>
        <div />
      </WorkflowProvider>,
    );
    await waitForAttempt();
    expect(syncCapture.mock.calls[0]?.[1]).toMatchObject({ area_id: AREA.id });
    expect(await listPendingWrites("capture")).toHaveLength(0);
  });
});
