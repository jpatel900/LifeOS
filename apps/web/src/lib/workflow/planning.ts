import {
  Phase2TimeBlockProposalSchema,
  type Phase2TimeBlockProposal,
} from "@lifeos/schemas";
import type { Phase2MockCalendarBlock, Phase2MockTask } from "../types";
import {
  hasLaunchSequenceStep,
  nextId,
  nowIso,
  type WorkflowState,
} from "./shared";
import { canAdmitWipTask, withWipRefusal } from "./wip";

// #580 (one planning model — placement wins, FR-008): the statuses that make
// a proposal "active" — still awaiting a decision and feeding placement.
const PENDING_PROPOSAL_STATUSES = ["proposed", "edited"] as const;

function isPendingProposal(proposal: Phase2TimeBlockProposal) {
  return (PENDING_PROPOSAL_STATUSES as readonly string[]).includes(
    proposal.status,
  );
}

// #580: placement supersedes — every pending proposal for the task flips to
// "superseded" in the SAME state transition that creates the block. Retained
// (never deleted) so the decision stays visible in history; the excluded id
// is the proposal being accepted (it becomes "accepted" instead).
function supersedePendingProposalsForTask(
  proposals: Phase2TimeBlockProposal[],
  taskId: string,
  excludeProposalId: string | null,
): Phase2TimeBlockProposal[] {
  return proposals.map((item) =>
    item.task_id === taskId &&
    item.id !== excludeProposalId &&
    isPendingProposal(item)
      ? { ...item, status: "superseded" as const }
      : item,
  );
}

// #580: THE single placement path (FR-008 "one planning model"). Both direct
// hour-rail placement (`planTaskAtHour`) and proposal acceptance
// (`acceptProposal`) funnel here: schedule the task, create exactly one
// block, and supersede every other pending proposal for the task atomically.
// Callers own the guards (task lookup, launch step, WIP admission).
function placeTaskOnSchedule(
  state: WorkflowState,
  task: Phase2MockTask,
  input: {
    start: string;
    end: string;
    /** Accepting an existing proposal — it flips to "accepted" and the block
     *  points at it. When null (direct placement) a new already-accepted
     *  proposal is recorded, matching the pre-#580 audit trail. */
    acceptedProposal: Phase2TimeBlockProposal | null;
    rationale: string;
    logMessage: string;
  },
): WorkflowState {
  const createdAt = nowIso();
  let proposals: Phase2TimeBlockProposal[];
  let proposalId: string;

  if (input.acceptedProposal) {
    proposalId = input.acceptedProposal.id;
    proposals = state.timeBlockProposals.map((item) =>
      item.id === proposalId ? { ...item, status: "accepted" as const } : item,
    );
  } else {
    proposalId = nextId("proposal");
    const proposal = Phase2TimeBlockProposalSchema.parse({
      id: proposalId,
      user_id: task.user_id,
      area_id: task.area_id,
      task_id: task.id,
      proposed_start: input.start,
      proposed_end: input.end,
      rationale: input.rationale,
      conflict_flag: false,
      status: "accepted",
      created_at: createdAt,
    });
    proposals = [proposal, ...state.timeBlockProposals];
  }

  proposals = supersedePendingProposalsForTask(proposals, task.id, proposalId);

  const block: Phase2MockCalendarBlock = {
    id: nextId("block"),
    user_id: input.acceptedProposal?.user_id ?? task.user_id,
    area_id: input.acceptedProposal?.area_id ?? task.area_id,
    task_id: task.id,
    proposal_id: proposalId,
    google_event_id: null,
    start_at: input.start,
    end_at: input.end,
    status: "scheduled",
    created_at: createdAt,
    updated_at: createdAt,
  };

  return {
    ...state,
    tasks: state.tasks.map((item) =>
      item.id === task.id
        ? { ...item, status: "scheduled", updated_at: createdAt }
        : item,
    ),
    timeBlockProposals: proposals,
    calendarBlocks: [block, ...state.calendarBlocks],
    reviewLog: [input.logMessage, ...state.reviewLog],
  };
}

export function planTaskAtHour(
  state: WorkflowState,
  taskId: string,
  hour: number,
): WorkflowState {
  const task = state.tasks.find(
    (item) => item.id === taskId && item.status === "active",
  );
  if (!task || hour < 8 || hour > 18) {
    return state;
  }
  if (!hasLaunchSequenceStep(task.first_tiny_step)) {
    return state;
  }
  if (!canAdmitWipTask(state, task.id)) {
    return withWipRefusal(state, task, "plan_scheduling");
  }

  const start = new Date();
  start.setHours(hour, 0, 0, 0);
  const minutes =
    task.estimated_minutes_high ?? task.estimated_minutes_low ?? 45;
  const end = new Date(start.getTime() + minutes * 60 * 1000);

  return placeTaskOnSchedule(state, task, {
    start: start.toISOString(),
    end: end.toISOString(),
    acceptedProposal: null,
    rationale: `Placed on the local hour rail at ${hour}:00.`,
    logMessage: `Planned task: ${task.title}`,
  });
}

export function updateTaskFirstTinyStep(
  state: WorkflowState,
  taskId: string,
  firstTinyStep: string,
): WorkflowState {
  const trimmed = firstTinyStep.trim();
  if (!trimmed || !state.tasks.some((task) => task.id === taskId)) {
    return state;
  }

  return {
    ...state,
    tasks: state.tasks.map((task) =>
      task.id === taskId
        ? { ...task, first_tiny_step: trimmed, updated_at: nowIso() }
        : task,
    ),
  };
}

export function unplanTask(
  state: WorkflowState,
  blockId: string,
): WorkflowState {
  const block = state.calendarBlocks.find(
    (item) => item.id === blockId && item.status === "scheduled",
  );
  if (!block?.task_id) {
    return state;
  }

  const task = state.tasks.find((item) => item.id === block.task_id);
  return {
    ...state,
    calendarBlocks: state.calendarBlocks.map((item) =>
      item.id === blockId
        ? { ...item, status: "cancelled", updated_at: nowIso() }
        : item,
    ),
    tasks: state.tasks.map((item) =>
      item.id === block.task_id
        ? { ...item, status: "active", updated_at: nowIso() }
        : item,
    ),
    reviewLog: task
      ? [`Unplanned task: ${task.title}`, ...state.reviewLog]
      : state.reviewLog,
  };
}

export function createLocalProposalFromTask(
  state: WorkflowState,
  taskId: string,
  input: {
    proposed_start: string;
    proposed_end: string;
    rationale: string;
  },
): WorkflowState {
  const task = state.tasks.find(
    (item) => item.id === taskId && item.status === "active",
  );
  if (!task || !hasLaunchSequenceStep(task.first_tiny_step)) {
    return state;
  }

  const proposal = Phase2TimeBlockProposalSchema.parse({
    id: nextId("proposal"),
    user_id: task.user_id,
    area_id: task.area_id,
    task_id: task.id,
    proposed_start: input.proposed_start,
    proposed_end: input.proposed_end,
    rationale: input.rationale,
    conflict_flag: false,
    status: "proposed",
    created_at: nowIso(),
  });

  return {
    ...state,
    timeBlockProposals: [proposal, ...state.timeBlockProposals],
    reviewLog: [
      `Drafted local block for task: ${task.title}`,
      ...state.reviewLog,
    ],
  };
}

export function updateProposal(
  state: WorkflowState,
  proposalId: string,
  changes: Pick<
    Phase2TimeBlockProposal,
    "proposed_start" | "proposed_end" | "rationale"
  >,
): WorkflowState {
  const proposal = state.timeBlockProposals.find(
    (item) => item.id === proposalId,
  );
  // #580 guard: only an active (pending) proposal can be edited. Editing a
  // settled proposal (accepted/rejected/superseded) would resurrect it as
  // pending — for a scheduled task that would recreate the dual model the
  // invariant forbids.
  if (!proposal || !isPendingProposal(proposal)) {
    return state;
  }

  return {
    ...state,
    timeBlockProposals: state.timeBlockProposals.map((item) =>
      item.id === proposalId
        ? Phase2TimeBlockProposalSchema.parse({
            ...item,
            ...changes,
            status: "edited",
          })
        : item,
    ),
  };
}

export function rejectProposal(
  state: WorkflowState,
  proposalId: string,
): WorkflowState {
  const proposal = state.timeBlockProposals.find(
    (item) => item.id === proposalId,
  );
  return {
    ...state,
    timeBlockProposals: state.timeBlockProposals.map((item) =>
      item.id === proposalId ? { ...item, status: "rejected" } : item,
    ),
    reviewLog: proposal
      ? [`Rejected proposal for task ${proposal.task_id}`, ...state.reviewLog]
      : state.reviewLog,
  };
}

export function acceptProposal(
  state: WorkflowState,
  proposalId: string,
): WorkflowState {
  const proposal = state.timeBlockProposals.find(
    (item) => item.id === proposalId,
  );
  // #580: accept = place. Only an active (pending) proposal can be accepted;
  // accepted, rejected, and superseded proposals are settled history.
  if (!proposal || !isPendingProposal(proposal)) {
    return state;
  }
  const task = state.tasks.find((item) => item.id === proposal.task_id);
  if (!task || !hasLaunchSequenceStep(task.first_tiny_step)) {
    return state;
  }
  if (!canAdmitWipTask(state, task.id)) {
    return withWipRefusal(state, task, "plan_scheduling");
  }

  // #580: accepting IS placement — the same single code path as the hour
  // rail, called with the proposal's start/end. The block comes from the
  // placement path; the proposal itself flips to "accepted" and every other
  // pending proposal for the task is superseded in the same transition.
  return placeTaskOnSchedule(state, task, {
    start: proposal.proposed_start,
    end: proposal.proposed_end,
    acceptedProposal: proposal,
    rationale: proposal.rationale,
    logMessage: `Accepted local proposal for task ${proposal.task_id}`,
  });
}

/**
 * Records the outcome of an approved, server-executed Google Calendar event
 * insert. The external write itself happens only in the server route after
 * explicit approval; this transition just mirrors the result locally.
 */
export function applyGoogleCalendarWriteResult(
  state: WorkflowState,
  proposalId: string,
  googleEventId: string,
): WorkflowState {
  const proposal = state.timeBlockProposals.find(
    (item) => item.id === proposalId,
  );
  if (
    !proposal ||
    !["proposed", "edited", "accepted"].includes(proposal.status)
  ) {
    return state;
  }

  const task = state.tasks.find((item) => item.id === proposal.task_id);
  const updatedAt = nowIso();
  const existingBlock = state.calendarBlocks.find(
    (block) => block.proposal_id === proposal.id,
  );
  const block: Phase2MockCalendarBlock = existingBlock
    ? {
        ...existingBlock,
        google_event_id: googleEventId,
        updated_at: updatedAt,
      }
    : {
        id: nextId("block"),
        user_id: proposal.user_id,
        area_id: proposal.area_id,
        task_id: proposal.task_id,
        proposal_id: proposal.id,
        google_event_id: googleEventId,
        start_at: proposal.proposed_start,
        end_at: proposal.proposed_end,
        status: "scheduled",
        created_at: updatedAt,
        updated_at: updatedAt,
      };

  return {
    ...state,
    // #580: this is also a placement path (a scheduled block appears), so
    // sibling pending proposals for the task are superseded in the same
    // transition. The Flow 8 approval gate itself is untouched — this
    // transition still only mirrors an already-approved server-side write.
    timeBlockProposals: supersedePendingProposalsForTask(
      state.timeBlockProposals.map((item) =>
        item.id === proposalId ? { ...item, status: "accepted" } : item,
      ),
      proposal.task_id,
      proposalId,
    ),
    tasks: state.tasks.map((item) =>
      item.id === proposal.task_id
        ? { ...item, status: "scheduled", updated_at: updatedAt }
        : item,
    ),
    calendarBlocks: existingBlock
      ? state.calendarBlocks.map((item) =>
          item.id === existingBlock.id ? block : item,
        )
      : [block, ...state.calendarBlocks],
    reviewLog: [
      `Approved Google Calendar event: ${task?.title ?? proposal.task_id}`,
      ...state.reviewLog,
    ],
  };
}

/**
 * Records the outcome of an approved, server-executed Google Calendar event
 * cancel. Only blocks that still carry a Google event id qualify; the task is
 * released back to the plannable pool like a local unplan.
 */
export function applyGoogleCalendarCancelResult(
  state: WorkflowState,
  blockId: string,
): WorkflowState {
  const block = state.calendarBlocks.find(
    (item) =>
      item.id === blockId &&
      ["scheduled", "running"].includes(item.status) &&
      Boolean(item.google_event_id),
  );
  if (!block) {
    return state;
  }

  const task = state.tasks.find((item) => item.id === block.task_id);
  const updatedAt = nowIso();
  return {
    ...state,
    calendarBlocks: state.calendarBlocks.map((item) =>
      item.id === blockId
        ? { ...item, status: "cancelled", updated_at: updatedAt }
        : item,
    ),
    tasks: state.tasks.map((item) =>
      item.id === block.task_id
        ? { ...item, status: "active", updated_at: updatedAt }
        : item,
    ),
    reviewLog: [
      `Cancelled Google Calendar event: ${task?.title ?? block.id}`,
      ...state.reviewLog,
    ],
  };
}
