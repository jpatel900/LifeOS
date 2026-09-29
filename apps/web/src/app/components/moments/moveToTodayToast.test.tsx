import "fake-indexeddb/auto";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowProvider, useWorkflow } from "@/lib/WorkflowContext";
import { STORAGE_KEY } from "@/lib/workflowContext/reducerCore";
import {
  acceptLatestDraft,
  backlogLatestDraft,
  captureWorkflow,
  GOLDEN_AREA_ID,
  workflowSeed,
} from "@/__tests__/helpers/workflowReachability";
import {
  FIXED_NOW,
  resetTodayMomentsMountTracking,
} from "@/__tests__/helpers/todayMomentsHarness";
import { TodayMoments } from "./TodayMoments";
import { PlanSheet } from "./PlanSheet";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
}));

vi.mock("@/lib/reEntry/briefView", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/reEntry/briefView")>()),
  createBriefViewRecorder: () => ({ recordIfNeeded: vi.fn() }),
}));

const transition = vi.hoisted(() => ({ noOp: false }));

// Exercise the real provider and reducer for success and cap refusal. A
// no-op stands in for a stale row that no longer accepts the action.
vi.mock("@/lib/workflow", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/workflow")>();
  return {
    ...actual,
    promoteBacklogTask: (
      ...args: Parameters<typeof actual.promoteBacklogTask>
    ) => (transition.noOp ? args[0] : actual.promoteBacklogTask(...args)),
  };
});

function seedState(activeCount: number) {
  let state = workflowSeed();
  for (let index = 0; index < activeCount; index += 1) {
    state = captureWorkflow(state, `Prepare work item ${index + 1}`);
    state = acceptLatestDraft(state);
  }
  state = captureWorkflow(state, "Prepare the volunteer rota");
  state = backlogLatestDraft(state);
  const backlog = state.tasks.find((task) => task.status === "backlog")!;
  return {
    state: {
      ...state,
      tasks: state.tasks.map((task) => ({
        ...task,
        first_tiny_step: "Open the draft",
        due_at: task.id === backlog.id ? "2026-07-04T12:00:00.000Z" : null,
      })),
      timeBlockProposals: [],
      calendarBlocks: [],
    },
    taskId: backlog.id,
  };
}

function StateProbe({ taskId }: { taskId: string }) {
  const { state } = useWorkflow();
  return (
    <div>
      <span data-testid="move-task-status">
        {state.tasks.find((task) => task.id === taskId)?.status}
      </span>
      <span data-testid="move-refused-task">
        {state.wipRefusal?.refused_task_id}
      </span>
    </div>
  );
}

function renderSurface(surface: "Start" | "Plan", activeCount: number) {
  const { state, taskId } = seedState(activeCount);
  const onToast = vi.fn();
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  render(
    <WorkflowProvider>
      <StateProbe taskId={taskId} />
      {surface === "Start" ? (
        <TodayMoments initialMoment="start" now={FIXED_NOW} />
      ) : (
        <PlanSheet
          open
          onClose={vi.fn()}
          selectedAreaId={GOLDEN_AREA_ID}
          blocks={[]}
          timeDisplay="clock"
          now={FIXED_NOW}
          onToast={onToast}
        />
      )}
    </WorkflowProvider>,
  );
  return {
    taskId,
    move: () =>
      fireEvent.click(
        screen.getByTestId(
          surface === "Start"
            ? `start-back-today-move-${taskId}`
            : `plan-sheet-promote-${taskId}`,
        ),
      ),
    toast: () =>
      surface === "Start"
        ? screen.queryByTestId("today-moments-toast")?.textContent
        : onToast.mock.calls.at(-1)?.[0],
  };
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  window.localStorage.clear();
  window.sessionStorage.clear();
  transition.noOp = false;
});

afterEach(() => {
  resetTodayMomentsMountTracking();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe.each(["Start", "Plan"] as const)(
  "FR-049 — %s move feedback follows the actual transition",
  (surface) => {
    it("shows a refusal when today is full and keeps the task in backlog", () => {
      const view = renderSurface(surface, 3);

      view.move();

      expect(screen.getByTestId("move-task-status")).toHaveTextContent(
        "backlog",
      );
      expect(screen.getByTestId("move-refused-task")).toHaveTextContent(
        view.taskId,
      );
      expect(view.toast()).not.toContain("Moved to today");
      expect(view.toast()).toMatch(/today is full/i);
    });

    it("shows success only after the task becomes active", () => {
      const view = renderSurface(surface, 1);

      view.move();

      expect(screen.getByTestId("move-task-status")).toHaveTextContent(
        "active",
      );
      expect(screen.getByTestId("move-refused-task")).toBeEmptyDOMElement();
      expect(view.toast()).toContain("Moved to today");
    });

    it("does not announce success when the action makes no change", () => {
      const view = renderSurface(surface, 1);
      transition.noOp = true;

      view.move();

      expect(screen.getByTestId("move-task-status")).toHaveTextContent(
        "backlog",
      );
      expect(view.toast() ?? "").not.toContain("Moved to today");
    });
  },
);
