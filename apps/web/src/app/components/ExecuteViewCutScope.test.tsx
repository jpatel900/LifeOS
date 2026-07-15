import { render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExecuteView } from "./LifeOSCockpit";
import type { buildCockpitViewModel } from "@/lib/cockpit/viewModel";
import type { Phase2MockCalendarBlock, Phase2MockTask } from "@/lib/types";
import type { EndSessionResult } from "./moments/endSessionPolicy";

/**
 * FR-031 slice 7 wiring test.
 *
 * `finishSession` (the DoD-cap state machine) lives in the parent
 * `LifeOSCockpit` component and is not exported -- it owns `markSession`
 * and the CUT SCOPE / DEFER `window.prompt` fork per FR-025. What this
 * slice adds is the seam between that machine and the map: `ExecuteView`
 * derives ready-made cut candidates from the active task's approved map,
 * lets the operator tap one to build a note, and passes that note to
 * `onFinish` (which `finishSession` uses as the cut-scope prompt default).
 * This test exercises that seam directly, since it is the actual code this
 * slice changed; the full `markSession`/`cap_outcome` recording path is
 * unchanged (same call sites, same "cut_scope" outcome) and covered by the
 * existing workflow suite.
 */

const approvedMapTask: Phase2MockTask = {
  id: "task-1",
  user_id: "user-1",
  area_id: "area-1",
  project_id: null,
  source_capture_item_id: null,
  title: "Ship the launch email",
  description: null,
  status: "active",
  task_type: null,
  priority: null,
  definition_of_done: "Email is sent to the full list",
  first_tiny_step: null,
  scheduled_date: null,
  waiting_on_person_id: null,
  committed_to_person_id: null,
  progression_map: {
    schema_version: "1.0",
    nodes: [
      { id: "req-1", title: "Draft copy", role: "required", done: true },
      {
        id: "opt-1",
        title: "Add localized subject lines",
        role: "optional",
        done: false,
      },
      {
        id: "opt-2",
        title: "A/B test the send time",
        role: "optional",
        done: false,
      },
    ],
    edges: [{ from: "req-1", to: "opt-1" }],
  },
  map_status: "approved",
  map_approved_at: "2026-07-01T00:00:00.000Z",
  created_at: "2026-07-01T00:00:00.000Z",
} as unknown as Phase2MockTask;

const noMapTask: Phase2MockTask = {
  ...approvedMapTask,
  id: "task-2",
  progression_map: null,
  map_status: null,
} as unknown as Phase2MockTask;

function makeBlock(taskId: string): Phase2MockCalendarBlock {
  return {
    id: `block-${taskId}`,
    task_id: taskId,
  } as unknown as Phase2MockCalendarBlock;
}

function vmWithTask(task: Phase2MockTask) {
  return {
    planned: [{ task, block: makeBlock(task.id), hour: 9 }],
  } as unknown as ReturnType<typeof buildCockpitViewModel>;
}

function renderExecuteView(
  task: Phase2MockTask,
  onFinish = vi
    .fn()
    .mockResolvedValue({ status: "closed", resolution: "ordinary" }),
) {
  render(
    <ExecuteView
      vm={vmWithTask(task)}
      activeTaskId={task.id}
      running={false}
      remaining={0}
      total={1500}
      onStart={vi.fn()}
      onToggle={vi.fn()}
      onFinish={onFinish}
      onPlan={vi.fn()}
      onCapture={vi.fn()}
      onSideCapture={vi.fn()}
      onUpdateFirstTinyStep={vi.fn()}
    />,
  );
  return onFinish;
}

describe("ExecuteView cut-scope cap moment (FR-031 slice 7)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows ready-made cut candidates at the cap for a task with an approved map", () => {
    renderExecuteView(approvedMapTask);

    expect(screen.getByTestId("cut-scope-candidates")).toBeInTheDocument();
    expect(screen.getByTestId("cut-scope-candidate-opt-1")).toHaveTextContent(
      "Add localized subject lines",
    );
    expect(screen.getByTestId("cut-scope-candidate-opt-2")).toHaveTextContent(
      "A/B test the send time",
    );
  });

  it("shows no candidates list for a task with no map -- cap banner unchanged", () => {
    renderExecuteView(noMapTask);

    expect(
      screen.queryByTestId("cut-scope-candidates"),
    ).not.toBeInTheDocument();
    // The pre-existing cap banner copy still renders.
    expect(screen.getByText(/Time cap reached/)).toBeInTheDocument();
  });

  it("tapping a candidate appends its title to the note and Save forwards it to onFinish", async () => {
    const onFinish = renderExecuteView(approvedMapTask);

    fireEvent.click(screen.getByTestId("cut-scope-candidate-opt-1"));
    expect(screen.getByTestId("cut-scope-note-preview")).toHaveTextContent(
      "Cut note: Add localized subject lines",
    );

    fireEvent.click(screen.getByTestId("cut-scope-candidate-opt-2"));
    expect(screen.getByTestId("cut-scope-note-preview")).toHaveTextContent(
      "Cut note: Add localized subject lines; A/B test the send time",
    );

    // #572: "Complete" is now reached via the end sheet ("End session" ->
    // outcome "Done" (preselected) -> Save), not an instant button.
    fireEvent.click(screen.getByTestId("cockpit-end-session"));
    fireEvent.click(screen.getByTestId("end-session-save"));

    expect(onFinish).toHaveBeenCalledWith(
      "completed",
      25,
      null,
      "Add localized subject lines; A/B test the send time",
    );
  });

  it("Save forwards an empty cut-scope draft when nothing was tapped -- cap flow behaves as before", () => {
    const onFinish = renderExecuteView(approvedMapTask);

    fireEvent.click(screen.getByTestId("cockpit-end-session"));
    fireEvent.click(screen.getByTestId("end-session-save"));

    expect(onFinish).toHaveBeenCalledWith("completed", 25, null, "");
  });

  it("keeps the sheet and its draft open when orchestration aborts", async () => {
    const onFinish = vi
      .fn<() => Promise<EndSessionResult>>()
      .mockResolvedValue({ status: "aborted", reason: "invalid_cap_choice" });
    renderExecuteView(approvedMapTask, onFinish);

    fireEvent.click(screen.getByTestId("cockpit-end-session"));
    fireEvent.change(screen.getByTestId("end-session-note"), {
      target: { value: "Keep this draft" },
    });
    fireEvent.click(screen.getByTestId("end-session-save"));

    expect(await screen.findByTestId("end-session-sheet")).toBeInTheDocument();
    expect(screen.getByTestId("end-session-note")).toHaveValue(
      "Keep this draft",
    );
    expect(onFinish).toHaveBeenCalledOnce();
  });

  it.each(["defer_unconfirmed", "defer_failed"] as const)(
    "closes the sheet after the session write settles with split result %s",
    async (resolution) => {
      const onFinish = vi
        .fn<() => Promise<EndSessionResult>>()
        .mockResolvedValue({ status: "split", resolution });
      renderExecuteView(approvedMapTask, onFinish);

      fireEvent.click(screen.getByTestId("cockpit-end-session"));
      fireEvent.click(screen.getByTestId("end-session-save"));

      await screen.findByText("Focus queue");
      expect(screen.queryByTestId("end-session-sheet")).not.toBeInTheDocument();
      expect(onFinish).toHaveBeenCalledOnce();
    },
  );
});
