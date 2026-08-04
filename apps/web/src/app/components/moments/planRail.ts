import type { Phase2MockCalendarBlock, Phase2MockTask } from "@/lib/types";

/**
 * Final UX Loop C2-S2 — the pure half of the ported Plan surface.
 *
 * The legacy `/calendar` hour rail decided what each row SAYS and what each
 * row DOES in one inline ternary inside the JSX (`PlanView.tsx:189-196` and
 * `:227-231`). Those two ternaries disagreed — which is exactly FINDING 1 of
 * the C2-S1 capability inventory (#687):
 *
 * > the hour rail's "Drop here" silently ignores drops for tasks without
 * > `first_tiny_step`
 *
 * The click handler required `!missingLaunchStep`; the label only required a
 * selected task. So with a first-move-less task selected, all eleven rows
 * invited a placement that could never happen, with no explanation and no way
 * forward from the row the user was actually looking at.
 *
 * Splitting the decision out here means the label and the action are derived
 * from ONE value, so they cannot disagree again — and it makes the rule
 * testable without a DOM.
 *
 * ## The fix is "say the truth", not "make it true" (lane contract clause 7)
 *
 * The first-move requirement is a deliberate product gate: `LaunchStepPrompt`
 * exists to satisfy it, and the same gate guards "Move to today" and "Accept".
 * Removing it is a product decision, not a lane decision, so it ships as an
 * OWNER-GATE. What this slice fixes is the lie plus the dead end: the row now
 * says what is missing, and tapping it takes the user to the one field that
 * unblocks the placement (NFR-006: plain, and recovery-oriented).
 */

export const PLAN_RAIL_HOURS = Array.from(
  { length: 11 },
  (_, index) => index + 8,
);

export interface PlanRailPlacement {
  task: Phase2MockTask;
  block: Phase2MockCalendarBlock;
  hour: number;
}

/** What tapping an hour row does. One value; the label is derived from it. */
export type PlanRailAction =
  /** A block sits here — tapping takes it off the rail. */
  | { kind: "unplan"; blockId: string; taskTitle: string }
  /** A task is chosen and ready — tapping places it. */
  | { kind: "place"; taskId: string; taskTitle: string }
  /**
   * A task is chosen but has no first move. Tapping cannot place it, so it
   * takes the user to the first-move field instead of doing nothing.
   */
  | { kind: "needsFirstMove"; taskId: string; taskTitle: string }
  /** Several things could go here, but none is chosen yet. */
  | { kind: "pickFirst" }
  /** Nothing to place at all. */
  | { kind: "idle" };

export interface PlanRailRow {
  hour: number;
  placement: PlanRailPlacement | null;
  action: PlanRailAction;
  /** True when a pending proposal wants this hour — never collapsed on mobile. */
  hasProposal: boolean;
  /** True when the row carries nothing a user needs to see on a small screen. */
  collapsible: boolean;
}

export interface BuildPlanRailInput {
  placements: PlanRailPlacement[];
  proposalHours: number[];
  /** The do-today task currently chosen for placement, if any. */
  taskToPlace: Pick<Phase2MockTask, "id" | "title" | "first_tiny_step"> | null;
  /** How many do-today tasks exist — distinguishes "pick one" from "none". */
  candidateCount: number;
}

export function hasFirstMove(
  task: Pick<Phase2MockTask, "first_tiny_step"> | null,
): boolean {
  return Boolean(task?.first_tiny_step?.trim());
}

export function buildPlanRail(input: BuildPlanRailInput): PlanRailRow[] {
  const { placements, proposalHours, taskToPlace, candidateCount } = input;
  const proposalHourSet = new Set(proposalHours);

  return PLAN_RAIL_HOURS.map((hour) => {
    const placement = placements.find((item) => item.hour === hour) ?? null;
    const hasProposal = proposalHourSet.has(hour);

    let action: PlanRailAction;
    if (placement) {
      action = {
        kind: "unplan",
        blockId: placement.block.id,
        taskTitle: placement.task.title,
      };
    } else if (taskToPlace && hasFirstMove(taskToPlace)) {
      action = {
        kind: "place",
        taskId: taskToPlace.id,
        taskTitle: taskToPlace.title,
      };
    } else if (taskToPlace) {
      action = {
        kind: "needsFirstMove",
        taskId: taskToPlace.id,
        taskTitle: taskToPlace.title,
      };
    } else if (candidateCount > 0) {
      action = { kind: "pickFirst" };
    } else {
      action = { kind: "idle" };
    }

    return {
      hour,
      placement,
      action,
      hasProposal,
      collapsible: !placement && !hasProposal,
    };
  });
}

/**
 * The row's sub-label. Derived from the SAME action the tap runs, so the words
 * and the behavior are one thing (FINDING 1).
 */
export function planRailLabel(action: PlanRailAction): string {
  switch (action.kind) {
    case "unplan":
      return "Tap to take it off";
    case "place":
      return "Tap to put it here";
    case "needsFirstMove":
      return "Add a first move to put it here";
    case "pickFirst":
      return "Pick something to place first";
    case "idle":
      return "Open hour";
  }
}

/** The first hour with nothing on it — where a drafted block starts. */
export function firstOpenHour(placements: PlanRailPlacement[]): number {
  return (
    PLAN_RAIL_HOURS.find(
      (hour) => !placements.some((item) => item.hour === hour),
    ) ?? 9
  );
}
