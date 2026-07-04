import { describe, expect, it } from "vitest";
import {
  acceptLatestDraft,
  buildWorkflowCockpitViewModel,
  captureWorkflow,
  planLatestActiveTask,
  workflowSeed,
} from "./helpers/workflowReachability";

function plannedJourneyState() {
  let state = workflowSeed();
  state = captureWorkflow(state, "Prove scheduled blocks stay visible.");
  state = acceptLatestDraft(state);
  return planLatestActiveTask(state, 9);
}

// KNOWN_ISSUES row 11 (2026-07-03 production smoke): a stale
// accept_time_block_proposal function left calendar_blocks rows in
// status "scheduled" while the linked task stayed "active". The view
// model joins planned blocks through task status "scheduled", so every
// scheduled surface went blank while Review still counted the task.
describe("cockpit planned join against task status drift", () => {
  it("renders planned blocks when the accepted task is scheduled", () => {
    const vm = buildWorkflowCockpitViewModel(plannedJourneyState());

    expect(vm.planned).toHaveLength(1);
    expect(vm.planned[0].block.status).toBe("scheduled");
    expect(vm.counts.execute).toBe(1);
  });

  it("drops every scheduled surface while Review still counts the task when the block's task stays active", () => {
    const state = plannedJourneyState();
    const plannedBlock = state.calendarBlocks.find(
      (block) => block.status === "scheduled" && block.task_id,
    );
    expect(plannedBlock).toBeDefined();

    const driftedState = {
      ...state,
      tasks: state.tasks.map((task) =>
        task.id === plannedBlock?.task_id
          ? { ...task, status: "active" as const }
          : task,
      ),
    };

    const vm = buildWorkflowCockpitViewModel(driftedState);

    // Plan hour rail, Today "Scheduled" band, and Execute focus queue
    // all derive from vm.planned, so the scheduled block disappears.
    expect(vm.planned).toHaveLength(0);
    expect(vm.counts.execute).toBe(0);

    // The task falls back into "To place" as an active task.
    expect(vm.today.map((task) => task.id)).toContain(plannedBlock?.task_id);

    // Review's carry-over math still counts the task via vm.today, which
    // is why the smoke read Review as "seeing" the same blocks.
    const total =
      vm.done.length +
      vm.planned.length +
      vm.today.length +
      vm.reviewQueue.length;
    expect(total - vm.done.length).toBeGreaterThan(0);
  });
});
