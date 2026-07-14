import { nowIso, type WorkflowState } from "./shared";
import { acceptDraft } from "./triage";
import { acceptProposal } from "./planning";
import { startExecutionSession } from "./execution";

function planFirstProposalForTask(
  state: WorkflowState,
  taskId: string,
): WorkflowState {
  const proposal = state.timeBlockProposals.find(
    (item) =>
      item.task_id === taskId && ["proposed", "edited"].includes(item.status),
  );
  return proposal ? acceptProposal(state, proposal.id) : state;
}

export function swapWipSlot(
  state: WorkflowState,
  slotTaskId: string,
): WorkflowState {
  const refusal = state.wipRefusal;
  if (!refusal) {
    return state;
  }

  const releasedTask = state.tasks.find((task) => task.id === slotTaskId);
  const releasedAt = nowIso();
  const releasedState: WorkflowState = {
    ...state,
    tasks: state.tasks.map((task) =>
      task.id === slotTaskId
        ? { ...task, status: "backlog", updated_at: releasedAt }
        : task,
    ),
    calendarBlocks: state.calendarBlocks.map((block) =>
      block.task_id === slotTaskId &&
      ["scheduled", "running"].includes(block.status)
        ? { ...block, status: "cancelled", updated_at: releasedAt }
        : block,
    ),
    executionSessions: state.executionSessions.map((session) =>
      session.task_id === slotTaskId && session.status === "running"
        ? { ...session, status: "stopped", outcome: "stopped" }
        : session,
    ),
    wipRefusal: null,
  };

  const admitted =
    refusal.activation_path === "triage_accept_to_today"
      ? acceptDraft(releasedState, refusal.refused_task_id)
      : refusal.activation_path === "execute_start"
        ? startExecutionSession(releasedState, refusal.refused_task_id)
        : planFirstProposalForTask(releasedState, refusal.refused_task_id);

  return {
    ...admitted,
    wipRefusal: null,
    reviewLog: [
      `WIP swap: released ${releasedTask?.title ?? slotTaskId} for ${refusal.refused_task_title}`,
      ...admitted.reviewLog,
    ],
  };
}
