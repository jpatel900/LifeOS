import { describe, expect, it } from "vitest";
import {
  acceptDraft,
  acceptProposal,
  applyGoogleCalendarCancelResult,
  applyGoogleCalendarWriteResult,
  createInitialWorkflowState,
  rejectProposal,
  submitCapture,
  type WorkflowState,
} from "@/lib/workflow";

const GOOGLE_EVENT_ID = `lifeos${"a1b2c3d4".repeat(4)}`;

function stateWithOpenProposal(): WorkflowState {
  let state = createInitialWorkflowState();
  state = submitCapture(state, {
    rawText: "Prepare sponsor recap for Friday",
    areaId: "area-main-job",
  });
  return acceptDraft(state, state.taskDrafts[0].id);
}

describe("applyGoogleCalendarWriteResult", () => {
  it("accepts the proposal and creates a scheduled block carrying the Google event id", () => {
    const state = stateWithOpenProposal();
    const proposal = state.timeBlockProposals[0];

    const next = applyGoogleCalendarWriteResult(
      state,
      proposal.id,
      GOOGLE_EVENT_ID,
    );

    const nextProposal = next.timeBlockProposals.find(
      (item) => item.id === proposal.id,
    );
    const block = next.calendarBlocks.find(
      (item) => item.proposal_id === proposal.id,
    );
    const task = next.tasks.find((item) => item.id === proposal.task_id);

    expect(nextProposal?.status).toBe("accepted");
    expect(block?.google_event_id).toBe(GOOGLE_EVENT_ID);
    expect(block?.status).toBe("scheduled");
    expect(task?.status).toBe("scheduled");
  });

  it("attaches the Google event id to the existing block when the proposal was accepted locally first", () => {
    let state = stateWithOpenProposal();
    const proposal = state.timeBlockProposals[0];
    state = acceptProposal(state, proposal.id);
    const localBlock = state.calendarBlocks.find(
      (item) => item.proposal_id === proposal.id,
    );
    expect(localBlock?.google_event_id).toBeNull();

    const next = applyGoogleCalendarWriteResult(
      state,
      proposal.id,
      GOOGLE_EVENT_ID,
    );

    const blocks = next.calendarBlocks.filter(
      (item) => item.proposal_id === proposal.id,
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].id).toBe(localBlock?.id);
    expect(blocks[0].google_event_id).toBe(GOOGLE_EVENT_ID);
  });

  it("leaves state unchanged for rejected or unknown proposals", () => {
    let state = stateWithOpenProposal();
    const proposal = state.timeBlockProposals[0];
    state = rejectProposal(state, proposal.id);

    expect(
      applyGoogleCalendarWriteResult(state, proposal.id, GOOGLE_EVENT_ID),
    ).toBe(state);
    expect(
      applyGoogleCalendarWriteResult(
        state,
        "proposal-missing",
        GOOGLE_EVENT_ID,
      ),
    ).toBe(state);
  });
});

describe("applyGoogleCalendarCancelResult", () => {
  it("cancels the block and releases the task back to the plannable pool", () => {
    let state = stateWithOpenProposal();
    const proposal = state.timeBlockProposals[0];
    state = applyGoogleCalendarWriteResult(state, proposal.id, GOOGLE_EVENT_ID);
    const block = state.calendarBlocks.find(
      (item) => item.proposal_id === proposal.id,
    );

    const next = applyGoogleCalendarCancelResult(state, block!.id);

    const nextBlock = next.calendarBlocks.find((item) => item.id === block!.id);
    const task = next.tasks.find((item) => item.id === proposal.task_id);
    expect(nextBlock?.status).toBe("cancelled");
    expect(task?.status).toBe("active");
  });

  it("leaves state unchanged for blocks without a Google event id", () => {
    let state = stateWithOpenProposal();
    const proposal = state.timeBlockProposals[0];
    state = acceptProposal(state, proposal.id);
    const localBlock = state.calendarBlocks.find(
      (item) => item.proposal_id === proposal.id,
    );

    expect(applyGoogleCalendarCancelResult(state, localBlock!.id)).toBe(state);
  });

  it("leaves state unchanged when the block is already cancelled", () => {
    let state = stateWithOpenProposal();
    const proposal = state.timeBlockProposals[0];
    state = applyGoogleCalendarWriteResult(state, proposal.id, GOOGLE_EVENT_ID);
    const block = state.calendarBlocks.find(
      (item) => item.proposal_id === proposal.id,
    );
    state = applyGoogleCalendarCancelResult(state, block!.id);

    expect(applyGoogleCalendarCancelResult(state, block!.id)).toBe(state);
  });
});
