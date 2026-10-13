import "fake-indexeddb/auto";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Area, Task } from "@lifeos/schemas";
import { WorkflowProvider, useWorkflow } from "@/lib/WorkflowContext";
import { clearPendingWrites } from "@/lib/durability/pendingWriteJournal";
import { STORAGE_KEY } from "@/lib/workflowContext/reducerCore";
import {
  acceptLatestDraft,
  backlogLatestDraft,
  captureWorkflow,
  workflowSeed,
} from "@/__tests__/helpers/workflowReachability";
import { ReviewSheet } from "./ReviewSheet";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  listAreas: vi.fn(),
  listCaptures: vi.fn(),
  listPlanning: vi.fn(),
  listExecution: vi.fn(),
  listWins: vi.fn(),
  listOverrides: vi.fn(),
  listDurations: vi.fn(),
  listSuggestions: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: mocks.createClient,
}));
vi.mock("@/lib/data/workflow", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data/workflow")>()),
  listAreas: mocks.listAreas,
  listCaptureItems: mocks.listCaptures,
  listPlanningItems: mocks.listPlanning,
  listExecutionReviewItems: mocks.listExecution,
  listWinRecords: mocks.listWins,
  listOverrideRecords: mocks.listOverrides,
  listDurationProfiles: mocks.listDurations,
  listSuggestionRecords: mocks.listSuggestions,
}));

const USER_ID = "22222222-2222-4222-8222-222222222222";
const AREA_ID = "11111111-1111-4111-8111-111111111111";
const TASK_ID = "33333333-3333-4333-8333-333333333333";
const area = {
  id: AREA_ID,
  user_id: USER_ID,
  name: "Main Job",
  slug: "main-job",
  description: null,
  color: null,
  icon: null,
  sort_order: 0,
  is_active: true,
  created_at: "2026-09-01T12:00:00.000Z",
  updated_at: "2026-09-01T12:00:00.000Z",
} satisfies Area;

function accountTask(status: "active" | "backlog"): Task {
  return {
    id: TASK_ID,
    user_id: USER_ID,
    area_id: AREA_ID,
    project_id: null,
    source_capture_item_id: null,
    title: "Synthetic review task",
    description: null,
    status,
    priority_score: null,
    priority_confidence: null,
    task_type: null,
    energy_type: null,
    estimated_minutes_low: null,
    estimated_minutes_high: null,
    due_at: null,
    definition_of_done: null,
    first_tiny_step: null,
    created_at: "2026-09-01T12:00:00.000Z",
    updated_at: "2026-09-01T12:00:00.000Z",
  };
}

let workflow: ReturnType<typeof useWorkflow>;
function TaskStatusProbe() {
  workflow = useWorkflow();
  const { state, areasReadbackSettled, syncStatus } = workflow;
  return (
    <div>
      <span data-testid="account-read-settled">
        {String(areasReadbackSettled)}
      </span>
      <span data-testid="account-message">{syncStatus.message}</span>
      <span data-testid="account-status">{syncStatus.account}</span>
      <span data-testid="task-status">
        {state.tasks.find((task) => task.id === TASK_ID)?.status ?? "missing"}
      </span>
    </div>
  );
}

const toast = vi.fn();
function mountReview() {
  return render(
    <WorkflowProvider>
      <TaskStatusProbe />
      <ReviewSheet
        open
        onClose={vi.fn()}
        selectedAreaId={null}
        now={new Date("2026-09-29T18:00:00.000Z")}
        dayClose={null}
        onCloseDay={vi.fn()}
        onToast={toast}
      />
    </WorkflowProvider>,
  );
}

describe("ReviewSheet account save truth", () => {
  let storedTask: Task;
  let finishAccountWrite: (result: {
    data: { task: Task; blocks: [] } | null;
    error: { message: string } | null;
  }) => void = () => {
    throw new Error("Review transition RPC was not called.");
  };
  const rpc = vi.fn();
  let client: unknown;

  beforeEach(async () => {
    await clearPendingWrites();
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.history.replaceState(null, "", "/");
    toast.mockClear();
    rpc.mockReset();
    rpc.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishAccountWrite = resolve;
        }),
    );
    client = {
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: USER_ID } },
          error: null,
        })),
      },
      rpc,
    };
    mocks.createClient.mockReturnValue(client);
    mocks.listAreas.mockResolvedValue({ provider: "supabase", areas: [area] });
    mocks.listCaptures.mockResolvedValue({
      provider: "supabase",
      captures: [],
    });
    mocks.listPlanning.mockResolvedValue({
      provider: "supabase",
      tasks: [],
      proposals: [],
      blocks: [],
    });
    mocks.listExecution.mockImplementation(async () => ({
      provider: "supabase",
      tasks: [{ ...storedTask }],
      blocks: [],
      sessions: [],
      reviewEntries: [],
    }));
    mocks.listWins.mockResolvedValue({ provider: "supabase", winRecords: [] });
    mocks.listOverrides.mockResolvedValue({
      provider: "supabase",
      overrideRecords: [],
    });
    mocks.listDurations.mockResolvedValue({
      provider: "supabase",
      durationProfiles: [],
    });
    mocks.listSuggestions.mockResolvedValue({
      provider: "supabase",
      suggestionRecords: [],
    });
  });

  afterEach(async () => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    await clearPendingWrites();
    vi.clearAllMocks();
  });

  it("control: a confirmed account transition is visible after remount", async () => {
    storedTask = accountTask("backlog");
    const view = mountReview();
    await waitFor(() =>
      expect(screen.getByTestId("account-read-settled")).toHaveTextContent(
        "true",
      ),
    );
    expect(screen.getByTestId("task-status")).toHaveTextContent("backlog");

    fireEvent.click(
      screen.getByTestId(`review-sheet-carry-forward-${TASK_ID}`),
    );
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    storedTask = accountTask("active");
    await act(async () => {
      finishAccountWrite({
        data: { task: storedTask, blocks: [] },
        error: null,
      });
    });

    view.unmount();
    window.sessionStorage.clear();
    mountReview();
    await waitFor(() =>
      expect(screen.getByTestId("account-read-settled")).toHaveTextContent(
        "true",
      ),
    );
    expect(screen.getByTestId("task-status")).toHaveTextContent("active");
  });

  it.each([
    {
      initial: "backlog" as const,
      action: "carry-forward",
      optimistic: "active",
      success: "Carried forward",
    },
    {
      initial: "active" as const,
      action: "defer",
      optimistic: "backlog",
      success: "Put off for later",
    },
  ])(
    "does not claim $action reached the account when its write fails, including after remount",
    async ({ initial, action, optimistic, success }) => {
      storedTask = accountTask(initial);
      const view = mountReview();
      await waitFor(() =>
        expect(screen.getByTestId("task-status")).toHaveTextContent(initial),
      );
      await waitFor(() =>
        expect(screen.getByTestId("account-read-settled")).toHaveTextContent(
          "true",
        ),
      );

      fireEvent.click(screen.getByTestId(`review-sheet-${action}-${TASK_ID}`));
      await waitFor(() =>
        expect(rpc).toHaveBeenCalledWith("apply_task_review_transition", {
          p_task_id: TASK_ID,
          p_target_status: optimistic,
        }),
      );
      const toastBeforeAccountAnswer = toast.mock.calls.map(
        ([message]) => message,
      );

      await act(async () => {
        finishAccountWrite({
          data: null,
          error: { message: "Forced account refusal" },
        });
      });
      expect(storedTask).toEqual(accountTask(initial));
      expect(screen.getByTestId("account-status")).toHaveTextContent(
        "sync-error",
      );
      expect(screen.getByTestId("account-message").textContent).not.toBe("");
      expect(toast).toHaveBeenCalledWith(
        "Could not save your choice to your account. Try again.",
      );

      view.unmount();
      // A fresh document reads the account, not the optimistic tab copy.
      window.sessionStorage.clear();
      mountReview();
      await waitFor(() =>
        expect(screen.getByTestId("account-read-settled")).toHaveTextContent(
          "true",
        ),
      );
      expect(screen.getByTestId("task-status")).toHaveTextContent(initial);
      expect(toastBeforeAccountAnswer).not.toContain(success);
      expect(toast).not.toHaveBeenCalledWith(success);
    },
  );
  it.each([
    {
      action: "carry-forward",
      initial: "backlog",
      target: "active",
      success: "Carried forward",
    },
    {
      action: "defer",
      initial: "active",
      target: "backlog",
      success: "Put off for later",
    },
  ] as const)(
    "waits for $action account confirmation and reloads the confirmed task",
    async ({ action, initial, target, success }) => {
      storedTask = accountTask(initial);
      const view = mountReview();
      await waitFor(() =>
        expect(screen.getByTestId("account-read-settled")).toHaveTextContent(
          "true",
        ),
      );
      fireEvent.click(
        screen.getByTestId("review-sheet-" + action + "-" + TASK_ID),
      );
      await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
      expect(screen.getByTestId("task-status")).toHaveTextContent(target);
      expect(storedTask.status).toBe(initial);
      expect(toast).not.toHaveBeenCalled();
      storedTask = accountTask(target);
      await act(async () =>
        finishAccountWrite({
          data: { task: storedTask, blocks: [] },
          error: null,
        }),
      );
      expect(toast).toHaveBeenCalledWith(success);
      view.unmount();
      window.sessionStorage.clear();
      mountReview();
      await waitFor(() =>
        expect(screen.getByTestId("account-read-settled")).toHaveTextContent(
          "true",
        ),
      );
      expect(screen.getByTestId("task-status")).toHaveTextContent(target);
      expect(
        workflow.state.tasks.find((task) => task.id === TASK_ID)?.title,
      ).toBe("Synthetic review task");
    },
  );

  it.each([
    { action: "carry-forward", initial: "backlog", target: "active" },
    { action: "defer", initial: "active", target: "backlog" },
  ] as const)(
    "reports a confirmed $action write separately from a failed readback",
    async ({ action, initial, target }) => {
      storedTask = accountTask(initial);
      const view = mountReview();
      await waitFor(() =>
        expect(screen.getByTestId("account-read-settled")).toHaveTextContent(
          "true",
        ),
      );
      fireEvent.click(
        screen.getByTestId("review-sheet-" + action + "-" + TASK_ID),
      );
      await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
      expect(toast).not.toHaveBeenCalled();
      mocks.listExecution.mockRejectedValueOnce(
        new Error("Synthetic private read failure"),
      );
      storedTask = accountTask(target);
      await act(async () =>
        finishAccountWrite({
          data: { task: storedTask, blocks: [] },
          error: null,
        }),
      );
      expect(toast).toHaveBeenCalledWith(
        "Saved to your account. The latest view could not load. Try refreshing.",
      );
      expect(toast).not.toHaveBeenCalledWith(
        "Could not save your choice to your account. Try again.",
      );
      expect(screen.getByTestId("account-status")).toHaveTextContent(
        "sync-error",
      );
      expect(screen.getByTestId("account-message").textContent).not.toContain(
        "Synthetic private",
      );
      view.unmount();
      window.sessionStorage.clear();
      mountReview();
      await waitFor(() =>
        expect(screen.getByTestId("account-read-settled")).toHaveTextContent(
          "true",
        ),
      );
      expect(screen.getByTestId("task-status")).toHaveTextContent(target);
    },
  );

  it.each(["carryForwardTask", "deferTask"] as const)(
    "returns unchanged for %s when the task is absent",
    async (action) => {
      storedTask = accountTask("backlog");
      mountReview();
      await waitFor(() =>
        expect(screen.getByTestId("account-read-settled")).toHaveTextContent(
          "true",
        ),
      );
      const before = workflow.state;
      await act(async () =>
        expect(await workflow[action]("missing-task")).toBe("unchanged"),
      );
      expect(workflow.state).toBe(before);
      expect(rpc).not.toHaveBeenCalled();
      expect(toast).not.toHaveBeenCalled();
    },
  );

  it.each([
    { action: "carry-forward", hasClient: false },
    { action: "defer", hasClient: false },
    { action: "carry-forward", hasClient: true },
    { action: "defer", hasClient: true },
  ])(
    "reports $action locally without an account receipt (client: $hasClient)",
    async ({ action, hasClient }) => {
      mocks.createClient.mockReturnValue(null);
      const state = backlogLatestDraft(
        captureWorkflow(workflowSeed(), "Synthetic local review task"),
      );
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      const taskId = state.tasks[0]!.id;
      mountReview();
      await waitFor(() =>
        expect(
          screen.getByTestId("review-sheet-" + action + "-" + taskId),
        ).toBeVisible(),
      );
      if (hasClient) mocks.createClient.mockReturnValue(client);
      fireEvent.click(
        screen.getByTestId("review-sheet-" + action + "-" + taskId),
      );
      await waitFor(() =>
        expect(toast).toHaveBeenCalledWith(
          "Changed here. Account save is not confirmed.",
        ),
      );
      expect(rpc).not.toHaveBeenCalled();
      expect(
        workflow.state.tasks.find((task) => task.id === taskId)?.title,
      ).toBe("Synthetic local review task");
    },
  );

  function afterEarlierTriageRefusal(state = workflowSeed()) {
    for (let index = 0; index < 3; index += 1) {
      state = acceptLatestDraft(
        captureWorkflow(state, "Synthetic active task " + index),
      );
    }
    state = acceptLatestDraft(
      captureWorkflow(state, "Synthetic earlier refused draft"),
    );
    expect(state.wipRefusal?.activation_path).toBe("triage_accept_to_today");
    expect(state.wipRefusal?.slot_holders).toHaveLength(3);
    return state;
  }

  it("a stale triage refusal does not block a confirmed carry-forward account write", async () => {
    storedTask = accountTask("backlog");
    const state = afterEarlierTriageRefusal();
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const view = mountReview();
    await waitFor(() =>
      expect(screen.getByTestId("account-read-settled")).toHaveTextContent(
        "true",
      ),
    );
    expect(workflow.state.wipRefusal).toEqual(state.wipRefusal);
    expect(screen.getByTestId("task-status")).toHaveTextContent("backlog");

    fireEvent.click(
      screen.getByTestId("review-sheet-carry-forward-" + TASK_ID),
    );
    expect(screen.getByTestId("task-status")).toHaveTextContent("active");
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("apply_task_review_transition", {
        p_task_id: TASK_ID,
        p_target_status: "active",
      }),
    );
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(storedTask.status).toBe("backlog");
    expect(toast).not.toHaveBeenCalled();
    expect(workflow.state.wipRefusal).toEqual(state.wipRefusal);

    storedTask = accountTask("active");
    await act(async () => {
      finishAccountWrite({
        data: { task: storedTask, blocks: [] },
        error: null,
      });
    });
    expect(toast).toHaveBeenCalledExactlyOnceWith("Carried forward");
    expect(workflow.state.wipRefusal).toEqual(state.wipRefusal);
    view.unmount();
    window.sessionStorage.clear();
    mountReview();
    await waitFor(() =>
      expect(screen.getByTestId("account-read-settled")).toHaveTextContent(
        "true",
      ),
    );
    expect(screen.getByTestId("task-status")).toHaveTextContent("active");
    expect(
      workflow.state.tasks.find((task) => task.id === TASK_ID)?.title,
    ).toBe(storedTask.title);
  });

  it("a stale triage refusal reports the actual local-only carry-forward result", async () => {
    mocks.createClient.mockReturnValue(null);
    const initial = backlogLatestDraft(
      captureWorkflow(workflowSeed(), "Synthetic local review task"),
    );
    const task = initial.tasks[0]!;
    const state = afterEarlierTriageRefusal(initial);
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    mountReview();
    await waitFor(() =>
      expect(
        screen.getByTestId("review-sheet-carry-forward-" + task.id),
      ).toBeVisible(),
    );
    expect(
      workflow.state.tasks.find((item) => item.id === task.id)?.status,
    ).toBe("backlog");
    fireEvent.click(
      screen.getByTestId("review-sheet-carry-forward-" + task.id),
    );
    await waitFor(() =>
      expect(toast).toHaveBeenCalledExactlyOnceWith(
        "Changed here. Account save is not confirmed.",
      ),
    );
    expect(
      workflow.state.tasks.find((item) => item.id === task.id)?.status,
    ).toBe("active");
    expect(workflow.state.wipRefusal).toEqual(state.wipRefusal);
    expect(rpc).not.toHaveBeenCalled();
  });
});
