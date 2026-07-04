import { describe, expect, it } from "vitest";
import { acceptProposal, createLocalProposalFromTask } from "@/lib/workflow";
import {
  acceptLatestDraft,
  acceptLatestProposal,
  buildWorkflowCockpitViewModel,
  captureWorkflow,
  proposeLatestActiveTask,
  workflowSeed,
} from "./helpers/workflowReachability";

/**
 * Issue #324: accepting a proposal in Plan must leave visible, durable
 * feedback where the user is looking (the hour rail slot flips to "placed"),
 * and placing a task that already has a scheduled block must surface a
 * non-blocking notice while still allowing the second placement to happen.
 */
describe("Plan placement feedback and repeat-placement notice (issue #324)", () => {
  it("shows the placed-state feedback on the hour rail after accepting a proposal", () => {
    let state = workflowSeed();
    state = captureWorkflow(state, "Placement feedback proof task.");
    state = acceptLatestDraft(state);
    state = proposeLatestActiveTask(state);
    const acceptedProposalId = state.timeBlockProposals.find((item) =>
      ["proposed", "edited"].includes(item.status),
    )?.id;
    if (!acceptedProposalId) {
      throw new Error("No open proposal reachable before accepting.");
    }
    state = acceptLatestProposal(state);

    const vm = buildWorkflowCockpitViewModel(state);

    expect(vm.planned).toHaveLength(1);
    expect(vm.planned[0].task.title).toBe("Placement feedback proof task");
    expect(vm.planned[0].block.status).toBe("scheduled");
    // The accepted proposal itself clears out of the Proposals panel — the
    // hour rail slot for the task is the durable, inline confirmation left
    // where the user is looking.
    expect(
      vm.proposals.some(
        (proposal) => proposal.proposal.id === acceptedProposalId,
      ),
    ).toBe(false);
  });

  it("flags a repeat placement and still allows it to happen", () => {
    let state = workflowSeed();
    state = captureWorkflow(state, "Repeat placement proof task.");
    state = acceptLatestDraft(state);

    const task = state.tasks.find((item) => item.status === "active");
    if (!task) {
      throw new Error("No active task reachable for repeat placement fixture.");
    }

    const firstStart = new Date();
    firstStart.setHours(9, 0, 0, 0);
    const firstEnd = new Date(firstStart.getTime() + 30 * 60 * 1000);
    state = createLocalProposalFromTask(state, task.id, {
      proposed_start: firstStart.toISOString(),
      proposed_end: firstEnd.toISOString(),
      rationale: "First placement.",
    });

    const secondStart = new Date();
    secondStart.setHours(14, 0, 0, 0);
    const secondEnd = new Date(secondStart.getTime() + 30 * 60 * 1000);
    state = createLocalProposalFromTask(state, task.id, {
      proposed_start: secondStart.toISOString(),
      proposed_end: secondEnd.toISOString(),
      rationale: "Second placement, task already scheduled.",
    });

    const firstProposal = state.timeBlockProposals.find(
      (item) => item.proposed_start === firstStart.toISOString(),
    );
    const secondProposal = state.timeBlockProposals.find(
      (item) => item.proposed_start === secondStart.toISOString(),
    );
    if (!firstProposal || !secondProposal) {
      throw new Error("Both proposals must be reachable before accepting.");
    }

    // Accept the first proposal: the task becomes scheduled and gets one block.
    state = acceptProposal(state, firstProposal.id);

    const vmBeforeSecondAccept = buildWorkflowCockpitViewModel(state);
    const secondProposalView = vmBeforeSecondAccept.proposals.find(
      (item) => item.proposal.id === secondProposal.id,
    );

    expect(secondProposalView).toBeDefined();
    expect(secondProposalView?.hasExistingBlock).toBe(true);

    // Accepting the second proposal must still be allowed to happen — the
    // notice informs, it never blocks — and it creates a second block for
    // the same task rather than being silently dropped.
    state = acceptProposal(state, secondProposal.id);

    const vmAfterSecondAccept = buildWorkflowCockpitViewModel(state);
    const blocksForTask = state.calendarBlocks.filter(
      (block) => block.task_id === task.id,
    );

    expect(blocksForTask).toHaveLength(2);
    // Both blocks stay visible on the hour rail — the repeat placement is
    // informed, not blocked or silently dropped.
    expect(
      vmAfterSecondAccept.planned.filter((item) => item.task.id === task.id),
    ).toHaveLength(2);
  });
});
