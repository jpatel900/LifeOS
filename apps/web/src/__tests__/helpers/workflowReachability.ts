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

export function buildWorkflowTodayCockpitModel(state: WorkflowState) {
  return buildTodayCockpitModel({
    tasks: state.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
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
