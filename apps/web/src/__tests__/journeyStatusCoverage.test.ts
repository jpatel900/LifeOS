import {
  CALENDAR_BLOCK_STATUSES,
  CAPTURE_ITEM_STATUSES,
  TASK_STATUSES,
  TIME_BLOCK_PROPOSAL_STATUSES,
} from "../../../../packages/schemas/src/entities";
import { describe, expect, it } from "vitest";
import {
  acceptLatestDraft,
  acceptLatestProposal,
  backlogLatestDraft,
  captureWorkflow,
  dropLatestTask,
  editLatestProposal,
  markLatestSession,
  planLatestActiveTask,
  promoteLatestBacklogTask,
  proposeLatestActiveTask,
  rawCaptureWorkflow,
  rejectLatestProposal,
  startLatestScheduledTask,
  unplanLatestScheduledBlock,
  workflowSeed,
} from "./helpers/workflowReachability";

const JOURNEY_UNREACHED_STATUSES = {
  captureItems: [
    // Existing mock submit path creates triage_required captures, not parsed-only persisted captures.
    "parsed",
    // No transition-driven helper archives captures yet; keep visible until a real transition reaches it.
    "archived",
  ],
  tasks: [
    // V1 workflow creates accepted tasks directly, so no persisted task row legitimately reaches schema "draft".
    "draft",
    // No transition-driven helper archives tasks yet; keep visible until a real transition reaches it.
    "archived",
  ],
  // #580 (one planning model): "superseded" left this allowlist — placement
  // (plan/accept) now supersedes sibling pending proposals, so the journeys
  // below reach it through a real transition.
  timeBlockProposals: [],
  calendarBlocks: [],
};

function collectStatuses(states: ReturnType<typeof workflowSeed>[]) {
  return {
    captureItems: new Set(
      states.flatMap((state) => state.captureItems.map((item) => item.status)),
    ),
    tasks: new Set(
      states.flatMap((state) => state.tasks.map((item) => item.status)),
    ),
    timeBlockProposals: new Set(
      states.flatMap((state) =>
        state.timeBlockProposals.map((item) => item.status),
      ),
    ),
    calendarBlocks: new Set(
      states.flatMap((state) =>
        state.calendarBlocks.map((item) => item.status),
      ),
    ),
  };
}

function expectCoveredOrGrandfathered(
  enumName: keyof typeof JOURNEY_UNREACHED_STATUSES,
  schemaStatuses: readonly string[],
  reached: Set<string>,
) {
  const grandfathered = new Set(JOURNEY_UNREACHED_STATUSES[enumName]);
  const missing = schemaStatuses.filter(
    (status) => !reached.has(status) && !grandfathered.has(status),
  );

  expect(missing, `${enumName} missing transition-reached statuses`).toEqual(
    [],
  );
}

function expectGrandfatheredStillUnreached(
  enumName: keyof typeof JOURNEY_UNREACHED_STATUSES,
  reached: Set<string>,
) {
  const reachedGrandfathered = JOURNEY_UNREACHED_STATUSES[enumName].filter(
    (status) => reached.has(status),
  );

  expect(
    reachedGrandfathered,
    `${enumName} unreached-status allowlist is shrink-only; remove reached entries`,
  ).toEqual([]);
}

describe("workflow journey status coverage", () => {
  it("reaches every schema status through a transition-driven journey or explicitly grandfathers it", () => {
    const states = [workflowSeed()];
    const record = (state: ReturnType<typeof workflowSeed>) => {
      states.push(state);
      return state;
    };

    record(rawCaptureWorkflow(workflowSeed(), "Raw capture before parsing."));

    let accepted = record(
      captureWorkflow(workflowSeed(), "Accepted task journey."),
    );
    accepted = record(acceptLatestDraft(accepted));
    accepted = record(proposeLatestActiveTask(accepted));
    accepted = record(editLatestProposal(accepted));
    accepted = record(acceptLatestProposal(accepted));
    accepted = record(startLatestScheduledTask(accepted));
    record(markLatestSession(accepted, "completed"));

    let missed = record(
      captureWorkflow(workflowSeed(), "Missed block journey."),
    );
    missed = record(acceptLatestDraft(missed));
    missed = record(planLatestActiveTask(missed, 10));
    missed = record(startLatestScheduledTask(missed));
    record(markLatestSession(missed, "missed"));

    let blocked = record(
      captureWorkflow(workflowSeed(), "Blocked task journey."),
    );
    blocked = record(acceptLatestDraft(blocked));
    blocked = record(planLatestActiveTask(blocked, 11));
    blocked = record(startLatestScheduledTask(blocked));
    record(markLatestSession(blocked, "stuck"));

    let backlogged = record(
      captureWorkflow(workflowSeed(), "Backlog this task."),
    );
    backlogged = record(backlogLatestDraft(backlogged));
    record(promoteLatestBacklogTask(backlogged));

    let rejectedProposal = record(
      captureWorkflow(workflowSeed(), "Reject this proposed time block."),
    );
    rejectedProposal = record(acceptLatestDraft(rejectedProposal));
    rejectedProposal = record(proposeLatestActiveTask(rejectedProposal));
    record(rejectLatestProposal(rejectedProposal));

    let cancelledBlock = record(
      captureWorkflow(workflowSeed(), "Cancel this scheduled block."),
    );
    cancelledBlock = record(acceptLatestDraft(cancelledBlock));
    cancelledBlock = record(planLatestActiveTask(cancelledBlock, 12));
    record(unplanLatestScheduledBlock(cancelledBlock));

    let dropped = record(captureWorkflow(workflowSeed(), "Drop this task."));
    dropped = record(acceptLatestDraft(dropped));
    record(dropLatestTask(dropped));

    const reached = collectStatuses(states);

    expectCoveredOrGrandfathered(
      "captureItems",
      CAPTURE_ITEM_STATUSES,
      reached.captureItems,
    );
    expectCoveredOrGrandfathered("tasks", TASK_STATUSES, reached.tasks);
    expectCoveredOrGrandfathered(
      "timeBlockProposals",
      TIME_BLOCK_PROPOSAL_STATUSES,
      reached.timeBlockProposals,
    );
    expectCoveredOrGrandfathered(
      "calendarBlocks",
      CALENDAR_BLOCK_STATUSES,
      reached.calendarBlocks,
    );
  });

  it("keeps the unreached-status allowlist shrink-only", () => {
    const states = [workflowSeed()];
    let state = states[0];
    state = captureWorkflow(state, "Shrink-only smoke journey.");
    states.push(state);
    state = acceptLatestDraft(state);
    states.push(state);
    state = proposeLatestActiveTask(state);
    states.push(state);
    state = editLatestProposal(state);
    states.push(state);
    state = acceptLatestProposal(state);
    states.push(state);
    state = startLatestScheduledTask(state);
    states.push(state);
    states.push(markLatestSession(state, "completed"));

    const reached = collectStatuses(states);

    expectGrandfatheredStillUnreached("captureItems", reached.captureItems);
    expectGrandfatheredStillUnreached("tasks", reached.tasks);
    expectGrandfatheredStillUnreached(
      "timeBlockProposals",
      reached.timeBlockProposals,
    );
    expectGrandfatheredStillUnreached("calendarBlocks", reached.calendarBlocks);
  });
});
