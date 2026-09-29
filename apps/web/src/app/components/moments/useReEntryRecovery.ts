"use client";

import { useMemo } from "react";
import type { WorkflowState } from "@/lib/workflow";
import { hasLaunchSequenceStep } from "@/lib/workflow/shared";
import type { RecoveryCandidate } from "./ReEntryRitual";
import type { UseReEntryRitualResult } from "./useReEntryRitual";

export function useReEntryRecovery(input: {
  state: WorkflowState;
  ritual: UseReEntryRitualResult;
  updateTaskFirstTinyStep(taskId: string, step: string): void;
  promoteBacklogTask(taskId: string): WorkflowState;
  clearWipRefusal(): void;
  showToast(message: string, action?: { label: string; run(): void }): void;
  deferTask(taskId: string): void;
  setMoment(moment: "start"): void;
}) {
  const { state, ritual } = input;
  const candidates = useMemo<RecoveryCandidate[]>(() => {
    if (!ritual.summary || !ritual.plan) return [];
    const ids = [
      ritual.summary.stalest?.kind === "task"
        ? ritual.summary.stalest.id
        : null,
      ...ritual.plan.taskDeferrals.map((item) => item.taskId),
      ...state.tasks
        .filter((task) =>
          ["backlog", "active", "scheduled", "blocked"].includes(task.status),
        )
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((task) => task.id),
    ];
    return [...new Set(ids)].flatMap((id) => {
      const task = state.tasks.find((item) => item.id === id);
      if (!task || !["backlog", "active", "scheduled"].includes(task.status))
        return [];
      return [
        {
          taskId: task.id,
          title: task.title,
          why: "One small step to get going",
          firstStep:
            ritual.checkpoint?.edits[task.id] ?? task.first_tiny_step ?? "",
        },
      ];
    });
  }, [state.tasks, ritual.summary, ritual.plan, ritual.checkpoint]);
  const recovery =
    candidates.find(
      (item) => item.taskId === ritual.checkpoint?.selectedTaskId,
    ) ??
    candidates[0] ??
    null;
  const onAcceptRecovery = (taskId: string) => {
    const task = state.tasks.find((item) => item.id === taskId);
    if (
      !task ||
      recovery?.taskId !== taskId ||
      !hasLaunchSequenceStep(recovery.firstStep)
    )
      return;
    input.updateTaskFirstTinyStep(taskId, recovery.firstStep);
    if (task.status === "backlog") input.clearWipRefusal();
    const next =
      task.status === "backlog" ? input.promoteBacklogTask(taskId) : state;
    const activated = ["active", "scheduled"].includes(
      next.tasks.find((item) => item.id === taskId)?.status ?? "",
    );
    // Resolve only from the ordinary transition's actual task result.
    if (!activated && next.wipRefusal?.refused_task_id === taskId) {
      input.showToast("Today is full. Finish or put off a task first.");
      return;
    }
    if (!activated) return;
    ritual.complete({
      decision: "accepted",
      taskId,
      areaId: task.area_id,
      firstStep: recovery.firstStep,
      edited: Object.hasOwn(ritual.checkpoint?.edits ?? {}, taskId),
    });
    input.setMoment("start");
    input.showToast(
      "Welcome back — first move queued on this device",
      task.status === "backlog"
        ? { label: "Undo", run: () => input.deferTask(taskId) }
        : undefined,
    );
  };
  return {
    recovery,
    onAcceptRecovery,
    onEditRecovery: (taskId: string, step: string) => {
      if (recovery?.taskId === taskId)
        ritual.editRecovery(taskId, recovery.firstStep, step);
    },
    onSwapRecovery: () => {
      if (recovery && candidates.length > 1)
        ritual.selectRecovery(
          candidates[(candidates.indexOf(recovery) + 1) % candidates.length]
            .taskId,
        );
    },
  };
}
