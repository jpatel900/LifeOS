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
 * feedback where the user is looking (the hour rail slot flips to "placed").
 *
 * #580 (one planning model — placement wins) REPLACED the second half of
 * this file's original contract: the old "repeat placement is flagged but
 * still allowed" behavior (two blocks for one task, plus the 'accepting adds
 * another block' notice) is the dual model the owner retired. Placement now
 * supersedes every other pending proposal for the task atomically, so the
 * repeat-placement state is unreachable and the notice is gone.
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

  // #580: this test previously asserted the OLD dual-model behavior — the
  // second accept was allowed and created a SECOND block for the same task,
  // with a "hasExistingBlock" notice. Under "placement wins" the first accept
  // supersedes the sibling pending proposal in the same transition, so the
  // second accept is a no-op and the task ends with exactly one block.
  it("supersedes the sibling pending proposal on accept — no second block, no notice state", () => {
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
      rationale: "Second suggestion for the same task.",
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

    // Accept the first proposal: the task becomes scheduled, gets one block,
    // and every other pending proposal for it is superseded atomically.
    state = acceptProposal(state, firstProposal.id);

    const supersededSecond = state.timeBlockProposals.find(
      (item) => item.id === secondProposal.id,
    );
    expect(supersededSecond?.status).toBe("superseded");

    const vmAfterFirstAccept = buildWorkflowCockpitViewModel(state);
    // The superseded proposal leaves the Proposals panel — retained in
    // state history, never deleted.
    expect(
      vmAfterFirstAccept.proposals.some(
        (item) => item.proposal.id === secondProposal.id,
      ),
    ).toBe(false);

    // Accepting the superseded proposal is a no-op: placement already won.
    const afterSecondAccept = acceptProposal(state, secondProposal.id);
    expect(afterSecondAccept).toBe(state);

    const blocksForTask = afterSecondAccept.calendarBlocks.filter(
      (block) => block.task_id === task.id,
    );
    expect(blocksForTask).toHaveLength(1);
    expect(
      buildWorkflowCockpitViewModel(afterSecondAccept).planned.filter(
        (item) => item.task.id === task.id,
      ),
    ).toHaveLength(1);
  });
});
