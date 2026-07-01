import { describe, expect, it } from "vitest";
import { buildCockpitViewModel } from "@/lib/cockpit/viewModel";
import {
  acceptDraft,
  createInitialWorkflowState,
  markCurrentSession,
  planTaskAtHour,
  startExecutionSession,
  submitCapture,
} from "@/lib/workflow";

function addAcceptedTask(
  state: ReturnType<typeof createInitialWorkflowState>,
  rawText: string,
  areaId: string,
) {
  const captured = submitCapture(state, { rawText, areaId });
  return acceptDraft(captured, captured.taskDrafts[0].id);
}

describe("cockpit view model flow coverage", () => {
  it("keeps running planned blocks visible for execution", () => {
    let state = createInitialWorkflowState();
    state = addAcceptedTask(
      state,
      "Finish the running block proof.",
      "area-main-job",
    );
    state = planTaskAtHour(state, state.tasks[0].id, 9);
    state = startExecutionSession(state, state.tasks[0].id);

    const vm = buildCockpitViewModel(state, "area-main-job", true);

    expect(vm.planned).toHaveLength(1);
    expect(vm.planned[0].task.title).toBe("Finish the running block proof");
    expect(vm.planned[0].block.status).toBe("running");
  });

  it("exposes stuck work as review recovery", () => {
    let state = createInitialWorkflowState();
    state = addAcceptedTask(
      state,
      "Recover stuck work from review.",
      "area-main-job",
    );
    state = planTaskAtHour(state, state.tasks[0].id, 9);
    state = startExecutionSession(state, state.tasks[0].id);
    state = markCurrentSession(state, "stuck", { actualMinutes: 3 });

    const vm = buildCockpitViewModel(state, "area-main-job", true);

    expect(vm.reviewQueue.map((item) => item.task.title)).toContain(
      "Recover stuck work from review",
    );
    expect(vm.reviewQueue[0].reason).toBe("stuck");
  });

  it("builds the overview pipeline from every area, not only the active area", () => {
    let state = createInitialWorkflowState();
    state = submitCapture(state, {
      rawText: "Main area overview proof.",
      areaId: "area-main-job",
    });
    state = submitCapture(state, {
      rawText: "Personal overview proof.",
      areaId: "area-personal",
    });

    const vm = buildCockpitViewModel(state, "area-personal", true);

    expect(vm.global.inbox.map((item) => item.title)).toEqual(
      expect.arrayContaining([
        "Main area overview proof",
        "Personal overview proof",
      ]),
    );
  });
});
