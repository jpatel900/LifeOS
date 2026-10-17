// #853 regression guard (capture family) — a triage decision taken right
// after a reload, before the first account sync lands, must still name the
// account capture it came from.
//
// Sibling of `PlanSheet.reloadAliasRestore.test.tsx`, which guards the task,
// proposal and block families. The capture family has the same shape: the
// per-mount `persistedCaptureIdByLocalIdRef` is read when a triage accept is
// journalled (`persistAcceptedTaskDraft`) and again when it is replayed
// (`resolveTaskDraftAcceptIds`). A reload empties that ref while the durable
// copy (`state.accountIdByLocalId.captures`) rides `sessionStorage` back. If
// the restore path does not refill the ref, an accept tapped in that window
// is sent with no source capture: the task lands unlinked and
// `resolveCaptureItems` gets a null id, so the account keeps the capture at
// "new" and offers the thought back next session (the #771 bug, reopened).
//
// The session family has no counterpart guard: no persist path reads
// `persistedSessionIdByLocalIdRef` (a focus-session outcome is a create-once
// write keyed by its task and block), so there is no user action that could
// fail on it.
import "fake-indexeddb/auto";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowProvider } from "@/lib/WorkflowContext";
import { STORAGE_KEY } from "@/lib/workflowContext/reducerCore";
import {
  captureWorkflow,
  GOLDEN_AREA_ID,
  workflowSeed,
} from "@/__tests__/helpers/workflowReachability";
import { TriageSheet } from "./TriageSheet";

const AREA = GOLDEN_AREA_ID;
const ACCOUNT_CAPTURE_ID = "88888888-8888-4888-8888-888888888888";

const {
  mockListAreas,
  mockListCaptureItems,
  mockListPlanningItems,
  mockListExecutionReviewItems,
  mockListWinRecords,
  mockListOverrideRecords,
  mockListDurationProfiles,
  mockListSuggestionRecords,
  mockCreateSupabaseBrowserClient,
  mockSyncJournaledTaskDraftAccept,
} = vi.hoisted(() => ({
  // The account takes the accept and mints its task.
  mockSyncJournaledTaskDraftAccept: vi.fn(async () => ({
    provider: "supabase" as const,
    task: { id: "99999999-9999-4999-8999-999999999999" },
    proposal: null,
    deduplicated: false,
  })),
  mockListAreas: vi.fn(),
  mockListCaptureItems: vi.fn(),
  mockListPlanningItems: vi.fn(),
  mockListExecutionReviewItems: vi.fn(),
  mockListWinRecords: vi.fn(),
  mockListOverrideRecords: vi.fn(),
  mockListDurationProfiles: vi.fn(),
  mockListSuggestionRecords: vi.fn(),
  // These reads are only ever called with the mocked functions above (never
  // real supabase-js methods), so the "client" only needs to be truthy.
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
    syncJournaledTaskDraftAccept: mockSyncJournaledTaskDraftAccept,
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

/**
 * What `sessionStorage` holds after a capture was delivered and parsed, and
 * before the reload: a device-born capture still under its local id, its
 * pending triage draft, and the capture's account twin in the alias map.
 */
function seedSortedCaptureBeforeReload() {
  const state = captureWorkflow(
    workflowSeed(),
    "Renew the volunteer insurance certificate",
  );
  const capture = state.captureItems.at(-1)!;
  return {
    ...state,
    accountIdByLocalId: {
      captures: { [capture.id]: ACCOUNT_CAPTURE_ID },
      tasks: {},
      proposals: {},
      blocks: {},
      sessions: {},
    },
  };
}

beforeEach(() => {
  window.sessionStorage.clear();
  mockListAreas.mockResolvedValue({
    provider: "supabase",
    areas: [persistedArea],
  });
  // The first post-reload sync never lands: everything below happens in the
  // window before it, which is exactly where the bug lived.
  const never = () => new Promise<never>(() => {});
  mockListCaptureItems.mockImplementation(never);
  mockListPlanningItems.mockImplementation(never);
  mockListExecutionReviewItems.mockImplementation(never);
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

describe("#853 guard: the restored capture alias reaches the triage accept", () => {
  it("sends a triage accept tapped before the first post-reload sync with its account capture", async () => {
    const seed = seedSortedCaptureBeforeReload();
    const capture = seed.captureItems.at(-1)!;
    const draft = seed.taskDrafts.find((item) => item.status === "pending")!;
    expect(capture.id).not.toBe(ACCOUNT_CAPTURE_ID);
    expect(draft.capture_item_id).toBe(capture.id);
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(seed));

    render(
      <WorkflowProvider>
        <TriageSheet open onClose={vi.fn()} selectedAreaId={AREA} />
      </WorkflowProvider>,
    );

    const accept = await screen.findByTestId(`triage-sheet-accept-${draft.id}`);
    // The area sync has landed (the task needs an account area to be sent);
    // the row sync that would refill the aliases is still held.
    await waitFor(() =>
      expect(mockListExecutionReviewItems).toHaveBeenCalled(),
    );

    fireEvent.click(accept);

    await waitFor(() =>
      expect(
        screen.queryByTestId(`triage-sheet-item-${draft.id}`),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(mockSyncJournaledTaskDraftAccept).toHaveBeenCalled(),
    );
    expect(mockSyncJournaledTaskDraftAccept).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        area_id: persistedArea.id,
        source_capture_item_id: ACCOUNT_CAPTURE_ID,
        task_status: "backlog",
      }),
    );
  });
});
