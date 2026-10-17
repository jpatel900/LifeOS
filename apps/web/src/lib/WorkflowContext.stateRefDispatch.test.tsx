// #853 follow-up — a handler that runs right after a dispatch, before React
// re-renders, must see that dispatch.
//
// The layout-effect fix (e3b5b1f) closed the render-to-effect window, but
// `stateRef` still only caught up when React rendered. The account sync
// dispatches its merge and then, in the same synchronous run, carries on
// (`listWinRecords` is the very next call). Anything that read `stateRef` in
// that gap saw the pre-merge state, and a handler writing
// `applyWorkflowState(previous)` from it wrote the merge back out.
//
// The gap is made deterministic here: the mocked `listWinRecords` runs the
// handler synchronously, i.e. after the merge was dispatched and before any
// render could happen.
//
// Scaffold (real `WorkflowProvider`, data-layer reads mocked) mirrors
// `PlanSheet.stateRefFreshness.test.tsx`.
import "fake-indexeddb/auto";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowProvider, useWorkflow } from "@/lib/WorkflowContext";
import { STORAGE_KEY } from "@/lib/workflowContext/reducerCore";
import {
  acceptLatestDraft,
  captureWorkflow,
  workflowSeed,
} from "@/__tests__/helpers/workflowReachability";

const ACCOUNT_TASK_ID = "99999999-9999-4999-8999-999999999999";

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
} = vi.hoisted(() => ({
  mockListAreas: vi.fn(),
  mockListCaptureItems: vi.fn(),
  mockListPlanningItems: vi.fn(),
  mockListExecutionReviewItems: vi.fn(),
  mockListWinRecords: vi.fn(),
  mockListOverrideRecords: vi.fn(),
  mockListDurationProfiles: vi.fn(),
  mockListSuggestionRecords: vi.fn(),
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

/** A device-born task whose account twin is already known (alias recorded). */
function seedLocalTask() {
  let state = workflowSeed();
  state = captureWorkflow(state, "Renew the volunteer insurance certificate");
  state = acceptLatestDraft(state);
  const task = { ...state.tasks.at(-1)!, first_tiny_step: "Open the folder" };
  return {
    ...state,
    tasks: [task],
    timeBlockProposals: [],
    calendarBlocks: [],
    accountIdByLocalId: {
      captures: {},
      tasks: { [task.id]: ACCOUNT_TASK_ID },
      proposals: {},
      blocks: {},
      sessions: {},
    },
  };
}

let workflow: ReturnType<typeof useWorkflow> | null = null;

function Harness() {
  workflow = useWorkflow();
  return (
    <>
      <button
        type="button"
        onClick={() => void workflow?.refreshPersistedWorkflow()}
      >
        refresh
      </button>
      <ul>
        {workflow.state.tasks.map((task) => (
          <li key={task.id} data-testid={`task-${task.id}`}>
            {task.first_tiny_step}
          </li>
        ))}
      </ul>
    </>
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
  mockListAreas.mockResolvedValue({
    provider: "supabase",
    areas: [persistedArea],
  });
  mockListCaptureItems.mockResolvedValue({
    provider: "supabase",
    captures: [],
  });
  mockListPlanningItems.mockResolvedValue({
    provider: "supabase",
    tasks: [],
    proposals: [],
    blocks: [],
  });
  mockListExecutionReviewItems.mockResolvedValue({
    provider: "supabase",
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
  workflow = null;
});

describe("#853 follow-up: stateRef reflects a dispatch before React re-renders", () => {
  it.each([
    ["right after the merge's dispatch, before any render", true],
    ["after React has rendered the merge (control)", false],
  ])("a handler run %s acts on the merged state", async (_label, inGap) => {
    const seed = seedLocalTask();
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    render(
      <WorkflowProvider>
        <Harness />
      </WorkflowProvider>,
    );
    await waitFor(() =>
      expect(
        screen.getByTestId(`task-${seed.tasks[0].id}`),
      ).toBeInTheDocument(),
    );
    // Let the mount sync finish before arming the in-gap handler.
    await waitFor(() => expect(mockListWinRecords).toHaveBeenCalled());

    // The account catches up: the task's twin arrives and the merge retires
    // the local row for it.
    mockListExecutionReviewItems.mockResolvedValue({
      provider: "supabase",
      tasks: [
        {
          ...seed.tasks[0],
          id: ACCOUNT_TASK_ID,
          area_id: persistedArea.id,
        },
      ],
      blocks: [],
      sessions: [],
      reviewEntries: [],
    });
    let ran = false;
    const edit = () => {
      ran = true;
      workflow!.updateTaskFirstTinyStep(ACCOUNT_TASK_ID, "Call the broker");
    };
    mockListWinRecords.mockImplementationOnce(() => {
      // Called synchronously right after the merge's dispatch: no render has
      // happened yet. The handler names the ACCOUNT id the merge produced.
      if (inGap) edit();
      else setTimeout(edit, 50);
      return Promise.resolve({ provider: "mock", winRecords: [] });
    });
    fireEvent.click(screen.getByRole("button", { name: "refresh" }));
    await waitFor(() => expect(ran).toBe(true));

    // Both the merge and the handler's edit survive.
    await waitFor(() =>
      expect(screen.getByTestId(`task-${ACCOUNT_TASK_ID}`)).toHaveTextContent(
        "Call the broker",
      ),
    );
    expect(
      screen.queryByTestId(`task-${seed.tasks[0].id}`),
    ).not.toBeInTheDocument();
  });
});
