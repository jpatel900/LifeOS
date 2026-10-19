import { describe, expect, it } from "vitest";
import { markCurrentSession, startExecutionSession } from "./execution";
import {
  applyGoogleCalendarCancelResult,
  applyGoogleCalendarWriteResult,
  unplanTask,
} from "./planning";
import { carryForwardTask, deferTask, dropTask } from "./review";
import {
  acceptLatestDraft,
  captureWorkflow,
  planLatestActiveTask,
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

/**
 * #1096 (design A): a focus session that ends skipped, missed or partial on a
 * Google-backed block used to mark the block `missed` on this device. That
 * closed the only LifeOS row pointing at the Google event, so every guard
 * above (they only look at open blocks) let the task be put off or dropped
 * while the event stayed on the calendar. The block now stays `scheduled`
 * and linked, the same rule "Stuck" follows, and the account does the same
 * (migration 20261018140000).
 */
type SessionEnd = "skipped" | "missed" | "partial";
const UNFINISHED_ENDS: SessionEnd[] = ["skipped", "missed", "partial"];

function endSessionOnGoogleBackedBlock(end: SessionEnd) {
  const { state: placed, block, taskId } = stateWithGoogleBackedBlock();
  const started = startExecutionSession(placed, taskId);
  expect(
    started.calendarBlocks.find((item) => item.id === block.id)?.status,
  ).toBe("running");
  const state = markCurrentSession(started, end, { actualMinutes: 10 });
  return { state, blockId: block.id, taskId };
}

function endSessionOnOrdinaryBlock(end: SessionEnd) {
  const planned = planLatestActiveTask(
    acceptLatestDraft(captureWorkflow(workflowSeed(), "Write the summary")),
  );
  const block = planned.calendarBlocks.find((item) => item.task_id)!;
  expect(block.google_event_id).toBeFalsy();
  const started = startExecutionSession(planned, block.task_id!);
  const state = markCurrentSession(started, end, { actualMinutes: 10 });
  return { state, blockId: block.id, taskId: block.task_id! };
}

describe("#1096 focus-session outcomes on a Google-backed block (design A)", () => {
  it.each(UNFINISHED_ENDS)(
    "a %s session leaves the Google-backed block scheduled with its event id",
    (end) => {
      const { state, blockId } = endSessionOnGoogleBackedBlock(end);
      const block = state.calendarBlocks.find((item) => item.id === blockId);
      expect(block?.status).toBe("scheduled");
      expect(block?.google_event_id).toBe("lifeosevent1");
      const session = state.executionSessions[0]!;
      expect(session.status).toBe(end);
    },
  );

  it.each([
    ["carry forward", carryForwardTask],
    ["put off", deferTask],
    ["drop", dropTask],
  ])(
    "after a skipped session, %s is still refused until the Google event is cancelled",
    (_, fn) => {
      const { state, taskId } = endSessionOnGoogleBackedBlock("skipped");
      expect(fn(state, taskId)).toBe(state);
    },
  );

  it('after a skipped session, Review\'s "Cancel Google event" still reaches the block', () => {
    const { state, blockId, taskId } = endSessionOnGoogleBackedBlock("skipped");
    const cancelled = applyGoogleCalendarCancelResult(state, blockId);
    expect(cancelled).not.toBe(state);
    expect(
      cancelled.calendarBlocks.find((item) => item.id === blockId)?.status,
    ).toBe("cancelled");
    // With the event cancelled through approval, the ordinary choices work.
    const deferred = deferTask(cancelled, taskId);
    expect(deferred.tasks.find((task) => task.id === taskId)?.status).toBe(
      "backlog",
    );
  });

  it.each(UNFINISHED_ENDS)(
    "a %s session on an ordinary block still marks it missed",
    (end) => {
      const { state, blockId } = endSessionOnOrdinaryBlock(end);
      expect(
        state.calendarBlocks.find((item) => item.id === blockId)?.status,
      ).toBe("missed");
    },
  );
});
