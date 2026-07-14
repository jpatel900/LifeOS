import { describe, expect, it } from "vitest";
import {
  acceptProposal,
  applyGoogleCalendarWriteResult,
  createLocalProposalFromTask,
  planTaskAtHour,
  updateProposal,
  type WorkflowState,
} from "@/lib/workflow";
import {
  acceptLatestDraft,
  captureWorkflow,
  workflowSeed,
} from "./helpers/workflowReachability";

/**
 * #580 — one planning model, placement wins (FR-008 amendment, design note
 * docs/implementation-planning/plan-one-planning-model.md).
 *
 * Placing a task on an hour is THE scheduling action. These reducer tests
 * pin the two state-layer halves: (1) every placement path supersedes the
 * task's pending proposals in the same transition, retained and never
 * deleted; (2) accepting a proposal IS placement — one code path, identical
 * end state.
 */

const PENDING = ["proposed", "edited"];

function activeTask(state: WorkflowState) {
  const task = state.tasks.find((item) => item.status === "active");
  if (!task) throw new Error("No active task in fixture.");
  return task;
}

function pendingProposalsFor(state: WorkflowState, taskId: string) {
  return state.timeBlockProposals.filter(
    (item) => item.task_id === taskId && PENDING.includes(item.status),
  );
}

function supersededProposalsFor(state: WorkflowState, taskId: string) {
  return state.timeBlockProposals.filter(
    (item) => item.task_id === taskId && item.status === "superseded",
  );
}

function scheduledBlocksFor(state: WorkflowState, taskId: string) {
  return state.calendarBlocks.filter(
    (block) => block.task_id === taskId && block.status === "scheduled",
  );
}

function seedTaskWithPendingProposals(): WorkflowState {
  let state = workflowSeed();
  state = captureWorkflow(state, "Placement wins proof task.");
  // acceptLatestDraft folds in the parse-created proposal draft as a pending
  // proposal — the audit's exact "parsing auto-creates a proposal" shape.
  state = acceptLatestDraft(state);
  const task = activeTask(state);
  const start = new Date();
  start.setHours(14, 0, 0, 0);
  const end = new Date(start.getTime() + 45 * 60 * 1000);
  return createLocalProposalFromTask(state, task.id, {
    proposed_start: start.toISOString(),
    proposed_end: end.toISOString(),
    rationale: "Second pending suggestion for the same task.",
  });
}

describe("#580 placement supersedes pending proposals", () => {
  it("direct placement marks ALL pending proposals for the task superseded in the same transition", () => {
    const state = seedTaskWithPendingProposals();
    const task = activeTask(state);
    const pendingBefore = pendingProposalsFor(state, task.id);
    expect(pendingBefore.length).toBeGreaterThanOrEqual(2);
    const totalProposalsBefore = state.timeBlockProposals.length;

    const placed = planTaskAtHour(state, task.id, 8);

    // Exactly one scheduled block, zero active proposals.
    expect(scheduledBlocksFor(placed, task.id)).toHaveLength(1);
    expect(pendingProposalsFor(placed, task.id)).toHaveLength(0);
    // Superseded, never deleted: every pending proposal survives with the
    // superseded status; the placement's own accepted proposal is added.
    expect(supersededProposalsFor(placed, task.id)).toHaveLength(
      pendingBefore.length,
    );
    expect(placed.timeBlockProposals).toHaveLength(totalProposalsBefore + 1);
    // Task moved to scheduled through the placement path.
    expect(
      placed.tasks.find((item) => item.id === task.id)?.status,
    ).toBe("scheduled");
  });

  it("accepting a proposal supersedes the task's other pending proposals in the same transition", () => {
    const state = seedTaskWithPendingProposals();
    const task = activeTask(state);
    const pendingBefore = pendingProposalsFor(state, task.id);
    const accepted = pendingBefore[0];
    const siblings = pendingBefore.slice(1);

    const placed = acceptProposal(state, accepted.id);

    expect(scheduledBlocksFor(placed, task.id)).toHaveLength(1);
    expect(pendingProposalsFor(placed, task.id)).toHaveLength(0);
    expect(
      placed.timeBlockProposals.find((item) => item.id === accepted.id)
        ?.status,
    ).toBe("accepted");
    for (const sibling of siblings) {
      expect(
        placed.timeBlockProposals.find((item) => item.id === sibling.id)
          ?.status,
      ).toBe("superseded");
    }
    // Nothing deleted.
    expect(placed.timeBlockProposals).toHaveLength(
      state.timeBlockProposals.length,
    );
  });

  it("the Google write mirror also supersedes sibling pending proposals (every placement path)", () => {
    const state = seedTaskWithPendingProposals();
    const task = activeTask(state);
    const pendingBefore = pendingProposalsFor(state, task.id);
    const approved = pendingBefore[0];

    const placed = applyGoogleCalendarWriteResult(
      state,
      approved.id,
      "google-event-580",
    );

    expect(pendingProposalsFor(placed, task.id)).toHaveLength(0);
    expect(supersededProposalsFor(placed, task.id)).toHaveLength(
      pendingBefore.length - 1,
    );
    expect(scheduledBlocksFor(placed, task.id)).toHaveLength(1);
  });
});

describe("#580 accept = place (one code path)", () => {
  it("accepting a proposal produces the identical end state placement itself produces", () => {
    const state = seedTaskWithPendingProposals();
    const task = activeTask(state);
    const proposal = pendingProposalsFor(state, task.id)[0];

    const viaAccept = acceptProposal(state, proposal.id);

    const block = scheduledBlocksFor(viaAccept, task.id)[0];
    // The BLOCK comes from the placement path with the proposal's start/end.
    expect(block.start_at).toBe(proposal.proposed_start);
    expect(block.end_at).toBe(proposal.proposed_end);
    expect(block.proposal_id).toBe(proposal.id);
    // Same terminal shape as a direct placement: scheduled task, one block,
    // zero active proposals.
    expect(
      viaAccept.tasks.find((item) => item.id === task.id)?.status,
    ).toBe("scheduled");
    expect(pendingProposalsFor(viaAccept, task.id)).toHaveLength(0);
  });

  it("edit-then-accept funnels through the same placement path with the edited times", () => {
    const state = seedTaskWithPendingProposals();
    const task = activeTask(state);
    const proposal = pendingProposalsFor(state, task.id)[0];
    const editedStart = new Date(proposal.proposed_start);
    editedStart.setMinutes(editedStart.getMinutes() + 30);
    const editedEnd = new Date(proposal.proposed_end);
    editedEnd.setMinutes(editedEnd.getMinutes() + 30);

    let next = updateProposal(state, proposal.id, {
      proposed_start: editedStart.toISOString(),
      proposed_end: editedEnd.toISOString(),
      rationale: "Edited before accepting.",
    });
    expect(
      next.timeBlockProposals.find((item) => item.id === proposal.id)?.status,
    ).toBe("edited");

    next = acceptProposal(next, proposal.id);

    const block = scheduledBlocksFor(next, task.id)[0];
    expect(block.start_at).toBe(editedStart.toISOString());
    expect(block.end_at).toBe(editedEnd.toISOString());
    expect(pendingProposalsFor(next, task.id)).toHaveLength(0);
  });

  it("accepting a settled (superseded/accepted/rejected) proposal is a no-op", () => {
    const state = seedTaskWithPendingProposals();
    const task = activeTask(state);
    const [first, second] = pendingProposalsFor(state, task.id);

    const placed = acceptProposal(state, first.id);
    expect(
      placed.timeBlockProposals.find((item) => item.id === second.id)?.status,
    ).toBe("superseded");

    // Superseded proposal cannot be accepted — placement already won.
    expect(acceptProposal(placed, second.id)).toBe(placed);
    // Accepted proposal cannot be re-accepted.
    expect(acceptProposal(placed, first.id)).toBe(placed);
  });

  it("editing a settled proposal is a no-op — it cannot resurrect as pending", () => {
    const state = seedTaskWithPendingProposals();
    const task = activeTask(state);
    const pendingBefore = pendingProposalsFor(state, task.id);

    const placed = planTaskAtHour(state, task.id, 8);
    const superseded = supersededProposalsFor(placed, task.id)[0];
    expect(superseded).toBeDefined();
    expect(pendingBefore.length).toBeGreaterThan(0);

    const editAttempt = updateProposal(placed, superseded.id, {
      proposed_start: superseded.proposed_start,
      proposed_end: superseded.proposed_end,
      rationale: "Trying to resurrect a superseded proposal.",
    });

    expect(editAttempt).toBe(placed);
    expect(pendingProposalsFor(editAttempt, task.id)).toHaveLength(0);
  });
});
