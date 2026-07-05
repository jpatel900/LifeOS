import type { WorkflowState } from "@/lib/workflow";

/**
 * Moments pass P4 — packet: ProgressionRail v0 node derivation.
 *
 * Pure builder over `WorkflowState` for a single task id. No fetch, no
 * write, no ambient Date.now — this module derives "how far along is this
 * task" from data already in state. The trailing speculative node is a
 * client-side placeholder (plan §6 R5): it signals that AI could decompose
 * this task further, but no real breakdown source exists yet, so it never
 * flips to "done" and never triggers a fetch.
 */

export type ProgressionNodeStatus = "done" | "current" | "next" | "speculative";

export interface ProgressionNode {
  id: string;
  label: string;
  status: ProgressionNodeStatus;
  kind: "real" | "speculative";
}

const RUNNING_OR_PAUSED = new Set(["running", "paused"]);

/**
 * Deterministic v0 mapping, in order: Captured, Triaged, Planned, In focus,
 * Done, then exactly one trailing speculative node. Only the first
 * non-done real node is highlighted as "current"/"next" — later real nodes
 * are forced to "next" even if their own underlying signal (e.g. a running
 * session) would otherwise suggest "current". This keeps the frontier rule
 * simple: progress reads left-to-right with a single active edge.
 */
export function buildProgressionNodes(
  state: WorkflowState,
  taskId: string | null,
): ProgressionNode[] {
  if (!taskId) return [];

  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return [];

  const plannedByBlock = state.calendarBlocks.some(
    (block) => block.task_id === taskId && block.status !== "cancelled",
  );

  const taskSessions = state.executionSessions.filter(
    (session) => session.task_id === taskId,
  );
  const latestTaskSession = taskSessions[0] ?? null;
  const hasCompletedSession = taskSessions.some(
    (session) => session.status === "completed",
  );
  const inFocusCurrent =
    latestTaskSession !== null &&
    RUNNING_OR_PAUSED.has(latestTaskSession.status);
  const inFocusDone = hasCompletedSession;

  const taskDone = task.status === "done";

  const realDoneFlags = [
    true, // Captured — the task exists.
    true, // Triaged — a task in state.tasks has passed triage by construction.
    plannedByBlock,
    inFocusDone,
    taskDone,
  ];

  const realLabels = ["Captured", "Triaged", "Planned", "In focus", "Done"];

  // Index of the first non-done real node — the single frontier edge.
  const frontierIndex = realDoneFlags.findIndex((done) => !done);

  const realNodes: ProgressionNode[] = realLabels.map((label, index) => {
    const done = realDoneFlags[index];
    if (done) {
      return {
        id: `real-${index}`,
        label,
        status: "done",
        kind: "real",
      };
    }

    const isFrontier = index === frontierIndex;
    const status: ProgressionNodeStatus =
      isFrontier && index === 3 && inFocusCurrent ? "current" : "next";

    return {
      id: `real-${index}`,
      label,
      status,
      kind: "real",
    };
  });

  const speculativeNode: ProgressionNode = {
    id: "speculative-breakdown",
    label: "Break it down further",
    status: "speculative",
    kind: "speculative",
  };

  return [...realNodes, speculativeNode];
}
