import { buildCockpitViewModel } from "@/lib/cockpit/viewModel";
import { buildTodayCockpitModel } from "@/lib/today/buildTodayCockpitModel";
import {
  acceptDraft,
  acceptProposal,
  appendRawCapture,
  backlogDraft,
  createInitialWorkflowState,
  createLocalProposalFromTask,
  createRawCaptureItem,
  dropTask,
  markCurrentSession,
  planTaskAtHour,
  promoteBacklogTask,
  rejectProposal,
  saveReview,
  startExecutionSession,
  submitCapture,
  unplanTask,
  updateProposal,
  type WorkflowState,
} from "@/lib/workflow";

export const GOLDEN_AREA_ID = "area-main-job";

export function workflowSeed(): WorkflowState {
  return createInitialWorkflowState();
}

export function rawCaptureWorkflow(
  state: WorkflowState,
  rawText: string,
  areaId = GOLDEN_AREA_ID,
): WorkflowState {
  return appendRawCapture(state, createRawCaptureItem({ rawText, areaId }));
}

export function captureWorkflow(
  state: WorkflowState,
  rawText: string,
  areaId = GOLDEN_AREA_ID,
): WorkflowState {
  return submitCapture(state, { rawText, areaId });
}

export function acceptedReversibleDecisionDueAt(
  state: WorkflowState,
  dueAt: string,
): WorkflowState {
  return {
    ...state,
    tasks: [
      {
        id: "task-decision-reversible",
        user_id: "user-demo",
        area_id: GOLDEN_AREA_ID,
        project_id: null,
        source_capture_item_id: null,
        title: "Choose the reversible decision lane",
        description: null,
        status: "active",
        priority_score: 2,
        priority_confidence: null,
        task_type: "decision",
        is_reversible: true,
        energy_type: null,
        estimated_minutes_low: 10,
        estimated_minutes_high: 20,
        due_at: dueAt,
        definition_of_done: "Record the decision choice.",
        first_tiny_step: "Write the choice in one sentence",
        created_at: "2026-07-05T08:00:00.000Z",
        updated_at: "2026-07-05T08:00:00.000Z",
      },
      ...state.tasks,
    ],
  };
}

export function acceptLatestDraft(state: WorkflowState): WorkflowState {
  const draft = state.taskDrafts.find((item) => item.status === "pending");
  if (!draft) {
    throw new Error(
      "No pending task draft is reachable from the workflow state.",
    );
  }
  return acceptDraft(state, draft.id);
}

export function backlogLatestDraft(state: WorkflowState): WorkflowState {
  const draft = state.taskDrafts.find((item) => item.status === "pending");
  if (!draft) {
    throw new Error(
      "No pending task draft is reachable from the workflow state.",
    );
  }
  return backlogDraft(state, draft.id);
}

export function promoteLatestBacklogTask(state: WorkflowState): WorkflowState {
  const task = state.tasks.find((item) => item.status === "backlog");
  if (!task) {
    throw new Error("No backlog task is reachable from the workflow state.");
  }
  return promoteBacklogTask(state, task.id);
}

export function planLatestActiveTask(
  state: WorkflowState,
  hour = 9,
): WorkflowState {
  const task = state.tasks.find((item) => item.status === "active");
  if (!task) {
    throw new Error("No active task is reachable from the workflow state.");
  }
  return planTaskAtHour(state, task.id, hour);
}

export function proposeLatestActiveTask(state: WorkflowState): WorkflowState {
  const task = state.tasks.find((item) => item.status === "active");
  if (!task) {
    throw new Error("No active task is reachable from the workflow state.");
  }
  const start = new Date();
  start.setHours(10, 0, 0, 0);
  const end = new Date(start.getTime() + 45 * 60 * 1000);
  return createLocalProposalFromTask(state, task.id, {
    proposed_start: start.toISOString(),
    proposed_end: end.toISOString(),
    rationale: "Reachability helper proposal.",
  });
}

export function editLatestProposal(state: WorkflowState): WorkflowState {
  const proposal = state.timeBlockProposals.find(
    (item) => item.status === "proposed",
  );
  if (!proposal) {
    throw new Error("No proposed block is reachable from the workflow state.");
  }
  const start = new Date(proposal.proposed_start);
  const end = new Date(proposal.proposed_end);
  start.setMinutes(start.getMinutes() + 15);
  end.setMinutes(end.getMinutes() + 15);
  return updateProposal(state, proposal.id, {
    proposed_start: start.toISOString(),
    proposed_end: end.toISOString(),
    rationale: `${proposal.rationale} Edited by reachability helper.`,
  });
}

export function rejectLatestProposal(state: WorkflowState): WorkflowState {
  const proposal = state.timeBlockProposals.find((item) =>
    ["proposed", "edited"].includes(item.status),
  );
  if (!proposal) {
    throw new Error(
      "No rejectable proposal is reachable from the workflow state.",
    );
  }
  return rejectProposal(state, proposal.id);
}

export function unplanLatestScheduledBlock(
  state: WorkflowState,
): WorkflowState {
  const block = state.calendarBlocks.find(
    (item) => item.status === "scheduled",
  );
  if (!block) {
    throw new Error("No scheduled block is reachable from the workflow state.");
  }
  return unplanTask(state, block.id);
}

export function dropLatestTask(state: WorkflowState): WorkflowState {
  const task = state.tasks[0];
  if (!task) {
    throw new Error("No task is reachable from the workflow state.");
  }
  return dropTask(state, task.id);
}

export function acceptLatestProposal(state: WorkflowState): WorkflowState {
  const proposal = state.timeBlockProposals.find((item) =>
    ["proposed", "edited"].includes(item.status),
  );
  if (!proposal) {
    throw new Error("No open proposal is reachable from the workflow state.");
  }
  return acceptProposal(state, proposal.id);
}

export function startLatestScheduledTask(state: WorkflowState): WorkflowState {
  const task = state.tasks.find((item) => item.status === "scheduled");
  if (!task) {
    throw new Error("No scheduled task is reachable from the workflow state.");
  }
  return startExecutionSession(state, task.id);
}

export function markLatestSession(
  state: WorkflowState,
  status: Parameters<typeof markCurrentSession>[1],
): WorkflowState {
  return markCurrentSession(state, status, { actualMinutes: 3 });
}

export function buildWorkflowCockpitViewModel(
  state: WorkflowState,
  selectedAreaId: string | null = GOLDEN_AREA_ID,
  dark = true,
) {
  return buildCockpitViewModel(state, selectedAreaId, dark);
}

export function buildWorkflowTodayCockpitModel(
  state: WorkflowState,
  options: { now?: Date } = {},
) {
  return buildTodayCockpitModel({
    now: options.now,
    tasks: state.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      taskType: task.task_type,
      dueAt: task.due_at,
      isReversible: task.is_reversible ?? null,
    })),
    drafts: [
      ...state.taskDrafts.map((draft) => ({
        id: draft.id,
        title: draft.title,
        kind: "task" as const,
      })),
      ...state.projectDrafts.map((draft) => ({
        id: draft.id,
        title: draft.title,
        kind: "project" as const,
      })),
    ].filter(
      (draft) =>
        state.taskDrafts.some(
          (taskDraft) =>
            taskDraft.id === draft.id && taskDraft.status === "pending",
        ) ||
        state.projectDrafts.some(
          (projectDraft) =>
            projectDraft.id === draft.id && projectDraft.status === "pending",
        ),
    ),
    proposals: state.timeBlockProposals.map((proposal) => ({
      id: proposal.id,
      taskId: proposal.task_id,
      status: proposal.status,
    })),
    blocks: state.calendarBlocks.map((block) => ({
      id: block.id,
      taskId: block.task_id,
      startAt: block.start_at,
      endAt: block.end_at,
      status: block.status,
    })),
    sessions: state.executionSessions.map((session) => ({
      id: session.id,
      taskId: session.task_id,
      calendarBlockId: session.calendar_block_id,
      status: session.status,
      outcome: session.outcome,
    })),
    health: {
      state: state.healthChecks.some((check) => check.status === "critical")
        ? "attention"
        : "ok",
    },
  });
}

// #580 (one planning model — placement wins): read-only query helpers over a
// reached WorkflowState, used by the placement-invariant guard tests. Live
// here (not in the test files) so their `WorkflowState` parameter typing
// stays inside the allowlisted reachability boundary.
const PENDING_PROPOSAL_STATUSES_FOR_TESTS = ["proposed", "edited"];

export function activeTaskFor(state: WorkflowState) {
  const task = state.tasks.find((item) => item.status === "active");
  if (!task) {
    throw new Error("No active task is reachable from the workflow state.");
  }
  return task;
}

export function pendingProposalsFor(state: WorkflowState, taskId: string) {
  return state.timeBlockProposals.filter(
    (item) =>
      item.task_id === taskId &&
      PENDING_PROPOSAL_STATUSES_FOR_TESTS.includes(item.status),
  );
}

export function supersededProposalsFor(state: WorkflowState, taskId: string) {
  return state.timeBlockProposals.filter(
    (item) => item.task_id === taskId && item.status === "superseded",
  );
}

export function scheduledBlocksFor(state: WorkflowState, taskId: string) {
  return state.calendarBlocks.filter(
    (block) => block.task_id === taskId && block.status === "scheduled",
  );
}

// #580: an active task with two pending proposals — the audit's exact
// "parsing auto-creates a proposal, then a second suggestion arrives" shape,
// used by the placement-supersedes guard tests.
export function seedTaskWithTwoPendingProposals(): WorkflowState {
  let state = workflowSeed();
  state = captureWorkflow(state, "Placement wins proof task.");
  // acceptLatestDraft folds in the parse-created proposal draft as a pending
  // proposal — the audit's exact "parsing auto-creates a proposal" shape.
  state = acceptLatestDraft(state);
  const task = activeTaskFor(state);
  const start = new Date();
  start.setHours(14, 0, 0, 0);
  const end = new Date(start.getTime() + 45 * 60 * 1000);
  return createLocalProposalFromTask(state, task.id, {
    proposed_start: start.toISOString(),
    proposed_end: end.toISOString(),
    rationale: "Second pending suggestion for the same task.",
  });
}

export function goldenJourneyState(): WorkflowState {
  let state = workflowSeed();
  state = captureWorkflow(state, "Golden capture needs triage and planning.");
  state = acceptLatestDraft(state);
  state = proposeLatestActiveTask(state);
  state = acceptLatestProposal(state);
  state = startLatestScheduledTask(state);
  state = markLatestSession(state, "completed");
  return saveReview(state);
}
