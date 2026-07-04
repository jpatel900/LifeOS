import { describe, expect, it } from "vitest";
import {
  acceptLatestDraft,
  buildWorkflowCockpitViewModel,
  captureWorkflow,
  GOLDEN_AREA_ID,
  markLatestSession,
  planLatestActiveTask,
  startLatestScheduledTask,
  workflowSeed,
} from "./helpers/workflowReachability";

describe("cockpit view model flow coverage", () => {
  it("keeps running planned blocks visible for execution", () => {
    let state = workflowSeed();
    state = captureWorkflow(state, "Finish the running block proof.");
    state = acceptLatestDraft(state);
    state = planLatestActiveTask(state, 9);
    state = startLatestScheduledTask(state);

    const vm = buildWorkflowCockpitViewModel(state);

    expect(vm.planned).toHaveLength(1);
    expect(vm.planned[0].task.title).toBe("Finish the running block proof");
    expect(vm.planned[0].block.status).toBe("running");
  });

  it("exposes stuck work as review recovery", () => {
    let state = workflowSeed();
    state = captureWorkflow(state, "Recover stuck work from review.");
    state = acceptLatestDraft(state);
    state = planLatestActiveTask(state, 9);
    state = startLatestScheduledTask(state);
    state = markLatestSession(state, "stuck");

    const vm = buildWorkflowCockpitViewModel(state);

    expect(vm.reviewQueue.map((item) => item.task.title)).toContain(
      "Recover stuck work from review",
    );
    expect(vm.reviewQueue[0].reason).toBe("stuck");
  });

  it("builds the overview pipeline from every area, not only the active area", () => {
    let state = workflowSeed();
    state = captureWorkflow(state, "Main area overview proof.", GOLDEN_AREA_ID);
    state = captureWorkflow(state, "Personal overview proof.", "area-personal");

    const vm = buildWorkflowCockpitViewModel(state, "area-personal");

    expect(vm.global.inbox.map((item) => item.title)).toEqual(
      expect.arrayContaining([
        "Main area overview proof",
        "Personal overview proof",
      ]),
    );
  });
});
