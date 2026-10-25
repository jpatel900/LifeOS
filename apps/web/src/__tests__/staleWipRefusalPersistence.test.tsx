// Bug hunt #2 — a refused "Do today" left `state.wipRefusal` set, and every
// later transition was gated on `!next.wipRefusal`. Transitions that do not
// touch the refusal carry it along (`{ ...state }`), so after ONE refusal,
// "Move to today", carry-forward and the Plan proposal actions were applied
// on this device only, with no notice, and the next sync undid them.
//
// The gate must ask "did THIS action get refused?", not "is there any
// refusal on the state?".
import "fake-indexeddb/auto";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkflow, WorkflowProvider } from "@/lib/WorkflowContext";
import { deferTask } from "@/lib/workflow";
import { accountSnapshotKey } from "@/lib/workflowContext/accountSnapshot";
import {
  acceptLatestDraft,
  backlogLatestDraft,
  captureWorkflow,
  workflowSeed,
} from "@/__tests__/helpers/workflowReachability";

const ACCOUNT_TASK_ID = "77777777-7777-4777-8777-777777777777";
const ACCOUNT_USER_ID = "00000000-0000-0000-0000-000000000001";

const {
  mockListAreas,
  mockListCaptureItems,
  mockListPlanningItems,
  mockListExecutionReviewItems,
  mockListWinRecords,
  mockListOverrideRecords,
  mockListDurationProfiles,
  mockListSuggestionRecords,
  mockApplyTaskReviewTransition,
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
  mockApplyTaskReviewTransition: vi.fn(async () => undefined),
  mockCreateSupabaseBrowserClient: vi.fn(() => ({
    mocked: true,
    auth: {
      getUser: async () => ({
        data: { user: { id: "00000000-0000-0000-0000-000000000001" } },
        error: null,
      }),
    },
  })),
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
    applyTaskReviewTransition: mockApplyTaskReviewTransition,
  };
});

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: mockCreateSupabaseBrowserClient,
}));

/**
 * Three tasks on today, one in the backlog, then a refused "Do today" (the
 * WIP cap), then one of the active tasks is put off — which frees a slot but
 * leaves the old refusal on the state.
 */
function seedStaleRefusal() {
  let state = workflowSeed();
  for (const text of [
    "Draft the quarterly report",
    "Book the dentist",
    "Fix the leaking tap",
  ]) {
    state = acceptLatestDraft(captureWorkflow(state, text));
  }
  state = backlogLatestDraft(captureWorkflow(state, "Renew the passport"));
  const backlogTask = state.tasks.find((task) => task.status === "backlog")!;

  state = acceptLatestDraft(captureWorkflow(state, "Call the plumber"));
  expect(state.wipRefusal).not.toBeNull();

  const active = state.tasks.find((task) => task.status === "active")!;
  state = deferTask(state, active.id);
  // The precondition the bug needs: a slot is free, the refusal is stale.
  expect(state.wipRefusal).not.toBeNull();

  return {
    state: {
      ...state,
      accountIdByLocalId: {
        ...state.accountIdByLocalId,
        tasks: {
          ...state.accountIdByLocalId.tasks,
          [backlogTask.id]: ACCOUNT_TASK_ID,
        },
      },
    },
    backlogTaskId: backlogTask.id,
  };
}

function PromoteBridge({ taskId }: { taskId: string }) {
  const { state, promoteBacklogTask } = useWorkflow();
  const task = state.tasks.find((item) => item.id === taskId);
  return (
    <div>
      <span data-testid="task-status">{task?.status ?? ""}</span>
      <button
        type="button"
        data-testid="promote"
        onClick={() => promoteBacklogTask(taskId)}
      >
        Move to today
      </button>
    </div>
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
  mockListAreas.mockResolvedValue({ provider: "supabase", areas: [] });
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

describe("bug hunt #2: an old 'today is full' refusal does not block later saves", () => {
  it("sends 'Move to today' to the account after an earlier refusal", async () => {
    const { state, backlogTaskId } = seedStaleRefusal();
    window.sessionStorage.setItem(
      accountSnapshotKey(`account:${ACCOUNT_USER_ID}`),
      JSON.stringify(state),
    );

    render(
      <WorkflowProvider>
        <PromoteBridge taskId={backlogTaskId} />
      </WorkflowProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("task-status")).toHaveTextContent("backlog"),
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId("promote"));
    });

    expect(screen.getByTestId("task-status")).toHaveTextContent("active");
    await waitFor(() =>
      expect(mockApplyTaskReviewTransition).toHaveBeenCalledWith(
        expect.anything(),
        ACCOUNT_TASK_ID,
        "active",
      ),
    );
  });
});
