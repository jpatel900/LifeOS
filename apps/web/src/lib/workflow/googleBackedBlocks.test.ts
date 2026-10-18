import { describe, expect, it } from "vitest";
import { applyGoogleCalendarWriteResult, unplanTask } from "./planning";
import { carryForwardTask, deferTask, dropTask } from "./review";
import {
  acceptLatestDraft,
  captureWorkflow,
  workflowSeed,
} from "@/__tests__/helpers/workflowReachability";

/**
 * Calendar hunt #2 — unplan, carry forward, put off and drop used to cancel
 * a Google-backed block on this device only. The account refuses those
 * (the Google event would be left behind), so the change never landed and
 * the next sync undid it. Locally they must refuse too, until the Google
 * event is cancelled through its own approval step.
 */
function stateWithGoogleBackedBlock() {
  let state = acceptLatestDraft(
    captureWorkflow(workflowSeed(), "Dentist appointment prep"),
  );
  const proposal = state.timeBlockProposals[0]!;
  state = applyGoogleCalendarWriteResult(state, proposal.id, "lifeosevent1");
  const block = state.calendarBlocks.find((b) => b.google_event_id)!;
  expect(block.status).toBe("scheduled");
  return { state, block, taskId: block.task_id! };
}

describe("Google-backed blocks are only changed through Google (calendar hunt #2)", () => {
  it("refuses to unplan a Google-backed block", () => {
    const { state, block } = stateWithGoogleBackedBlock();
    expect(unplanTask(state, block.id)).toBe(state);
  });

  it.each([
    ["carry forward", carryForwardTask],
    ["put off", deferTask],
    ["drop", dropTask],
  ])("refuses to %s a task whose block is on Google Calendar", (_, fn) => {
    const { state, taskId } = stateWithGoogleBackedBlock();
    expect(fn(state, taskId)).toBe(state);
  });
});
