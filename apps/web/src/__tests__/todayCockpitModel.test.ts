import { describe, expect, it } from "vitest";
import {
  acceptLatestDraft,
  backlogLatestDraft,
  buildWorkflowTodayCockpitModel,
  captureWorkflow,
  goldenJourneyState,
  markLatestSession,
  planLatestActiveTask,
  promoteLatestBacklogTask,
  proposeLatestActiveTask,
  startLatestScheduledTask,
  workflowSeed,
} from "./helpers/workflowReachability";

describe("buildTodayCockpitModel", () => {
  it("recommends Capture for an empty workflow seed", () => {
    const model = buildWorkflowTodayCockpitModel(workflowSeed());

    expect(model.next.kind).toBe("capture");
    expect(model.next.href).toBe("/capture");
  });

  it("prioritizes recovery over needs-decision", () => {
    let state = workflowSeed();
    state = captureWorkflow(state, "Recover blocked plan.");
    state = acceptLatestDraft(state);
    state = planLatestActiveTask(state, 9);
    state = startLatestScheduledTask(state);
    state = markLatestSession(state, "stuck");
    state = captureWorkflow(state, "Pending triage decision.");

    const model = buildWorkflowTodayCockpitModel(state);

    expect(model.next.kind).toBe("recovery");
    expect(model.next.href).toBe("/execute");
  });

  it("prioritizes needs-decision over unplanned tasks", () => {
    let state = workflowSeed();
    state = captureWorkflow(state, "Active task without a plan.");
    state = acceptLatestDraft(state);
    state = captureWorkflow(state, "Draft awaiting triage.");

    const model = buildWorkflowTodayCockpitModel(state);

    expect(model.next.kind).toBe("needs_decision");
    expect(model.next.href).toBe("/triage");
  });

  it("prioritizes running or paused session over planned blocks", () => {
    let state = workflowSeed();
    state = captureWorkflow(state, "Task to pause during execution.");
    state = acceptLatestDraft(state);
    state = planLatestActiveTask(state, 9);
    state = startLatestScheduledTask(state);
    state = markLatestSession(state, "paused");

    const model = buildWorkflowTodayCockpitModel(state);

    expect(model.next.kind).toBe("current_work");
    expect(model.now.kind).toBe("session");
  });

  it("does not classify tasks with active proposal or block as unplanned", () => {
    let state = workflowSeed();
    state = captureWorkflow(state, "Actually unplanned.");
    state = backlogLatestDraft(state);
    state = promoteLatestBacklogTask(state);
    state = captureWorkflow(state, "With proposal.");
    state = acceptLatestDraft(state);
    const proposedTaskId = state.tasks[0].id;
    state = proposeLatestActiveTask(state);
    state = captureWorkflow(state, "With block.");
    state = acceptLatestDraft(state);
    const blockedTaskId = state.tasks[0].id;
    state = planLatestActiveTask(state, 9);

    const model = buildWorkflowTodayCockpitModel(state);

    expect(model.unplanned.items.map((task) => task.id)).not.toContain(
      proposedTaskId,
    );
    expect(model.unplanned.items.map((task) => task.id)).not.toContain(
      blockedTaskId,
    );
    expect(model.unplanned.items).toHaveLength(1);
  });

  it("exposes today blocks from real planning transitions", () => {
    let state = workflowSeed();
    state = captureWorkflow(state, "Today block from planning.");
    state = acceptLatestDraft(state);
    state = planLatestActiveTask(state, 9);

    const model = buildWorkflowTodayCockpitModel(state);

    expect(model.todayBlocks).toHaveLength(1);
    expect(model.todayBlocks[0].status).toBe("scheduled");
  });

  it("keeps backlog out of unplanned active work", () => {
    let state = workflowSeed();
    state = captureWorkflow(state, "Backlog proof.");
    state = backlogLatestDraft(state);

    const model = buildWorkflowTodayCockpitModel(state);

    expect(model.unplanned.items).toHaveLength(0);
  });

  it("covers the golden capture to review journey seed", () => {
    const model = buildWorkflowTodayCockpitModel(goldenJourneyState());

    expect(model.todayBlocks.map((block) => block.status)).toContain(
      "completed",
    );
    expect(model.next.href).toBe("/capture");
  });
});
