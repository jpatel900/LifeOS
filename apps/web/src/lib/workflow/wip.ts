import type { Phase2TaskDraft } from "@lifeos/schemas";
import type { Phase2MockCalendarBlock, Phase2MockTask } from "../types";
import {
  WIP_ENFORCEMENT_LIMIT,
  WIP_ENFORCEMENT_POLICY_ID,
  nowIso,
  type WipRefusal,
  type WipSlotHolder,
  type WorkflowState,
} from "./shared";

export function getWipSlotHolders(state: WorkflowState): WipSlotHolder[] {
  const openBlocksByTask = new Map<string, Phase2MockCalendarBlock>();
  for (const block of state.calendarBlocks) {
    if (!block.task_id || !["scheduled", "running"].includes(block.status)) {
      continue;
    }
    if (!openBlocksByTask.has(block.task_id)) {
      openBlocksByTask.set(block.task_id, block);
    }
  }

  return state.tasks
    .filter(
      (task) =>
        ["active", "scheduled"].includes(task.status) ||
        openBlocksByTask.has(task.id) ||
        state.executionSessions.some(
          (session) =>
            session.task_id === task.id && session.status === "running",
        ),
    )
    .map((task) => ({
      task_id: task.id,
      title: task.title,
      status: task.status,
      block_id: openBlocksByTask.get(task.id)?.id ?? null,
    }))
    .slice(0, WIP_ENFORCEMENT_LIMIT);
}

export function withWipRefusal(
  state: WorkflowState,
  task: Phase2MockTask | Phase2TaskDraft,
  activationPath: WipRefusal["activation_path"],
): WorkflowState {
  const slotHolders = getWipSlotHolders(state);
  if (slotHolders.length < WIP_ENFORCEMENT_LIMIT) {
    return state;
  }

  return {
    ...state,
    wipRefusal: {
      policy_id: WIP_ENFORCEMENT_POLICY_ID,
      refused_task_id: task.id,
      refused_task_title: task.title,
      activation_path: activationPath,
      slot_holders: slotHolders,
      created_at: nowIso(),
    },
    reviewLog: [
      `WIP refused ${task.title}: ${WIP_ENFORCEMENT_LIMIT} slots already active`,
      ...state.reviewLog,
    ],
  };
}

export function canAdmitWipTask(state: WorkflowState, admittedTaskId?: string) {
  return (
    getWipSlotHolders(state).filter(
      (holder) => holder.task_id !== admittedTaskId,
    ).length < WIP_ENFORCEMENT_LIMIT
  );
}

export function clearWipRefusal(state: WorkflowState): WorkflowState {
  return { ...state, wipRefusal: null };
}
