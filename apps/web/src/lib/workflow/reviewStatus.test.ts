import { describe, expect, it } from "vitest";
import { buildCockpitViewModel } from "@/lib/cockpit/viewModel";
import type { WorkflowState } from "@/lib/workflow";
import {
  acceptLatestDraft,
  backlogLatestDraft,
  captureWorkflow,
  GOLDEN_AREA_ID,
  planLatestActiveTask,
  workflowSeed,
} from "@/__tests__/helpers/workflowReachability";
import {
  countNeedsDecision,
  needsDecisionHeadline,
  selectNeedsDecision,
} from "./reviewStatus";

/**
 * C2-S3 — "what still needs a decision?" has ONE answer, wherever it is asked,
 * and the words above it can be backed by the list below it.
 *
 * This is the third guard of its family, after `captureStatus.test.ts` (C1) and
 * `planStatus.test.ts` (C2-S2), and it exists for the reason FINDING 5
 * measured: the legacy `/review` screen showed **6** in its headline, **3** on
 * its stage chip, and **3** cards, for one workload at one instant.
 */

/**
 * The inventory's measured seed: 2 active + 1 backlog + 1 scheduled task in one
 * area. Four distinct open items; three of them need a decision.
 */
function inventorySeedState(): WorkflowState {
  let state = workflowSeed();
  state = captureWorkflow(state, "First open thing.");
  state = acceptLatestDraft(state);
  state = captureWorkflow(state, "Second open thing.");
  state = acceptLatestDraft(state);
  state = captureWorkflow(state, "Third open thing.");
  state = acceptLatestDraft(state);
  state = captureWorkflow(state, "Something put off for later.");
  state = backlogLatestDraft(state);
  return planLatestActiveTask(state, 9);
}

function oneMissedBlockState(): WorkflowState {
  let state = workflowSeed();
  state = captureWorkflow(state, "The thing the day went past.");
  state = acceptLatestDraft(state);
  state = planLatestActiveTask(state, 9);

  const block = state.calendarBlocks.find((item) => item.task_id);
  if (!block) throw new Error("Expected a scheduled block.");

  // The one shape where a task could be counted twice: it is BOTH the subject
  // of a missed block and (once carried back) a do-today task.
  return {
    ...state,
    calendarBlocks: state.calendarBlocks.map((item) =>
      item.id === block.id ? { ...item, status: "missed" as const } : item,
    ),
    tasks: state.tasks.map((task) =>
      task.id === block.task_id ? { ...task, status: "active" as const } : task,
    ),
  };
}

/**
 * Every surface that answers "what still needs a decision?". A new one must be
 * added here, or this guard silently stops covering it.
 */
const NEEDS_DECISION_SURFACES: ReadonlyArray<{
  name: string;
  count: (state: WorkflowState) => number;
}> = [
  {
    name: "shared selector (the Review sheet's and /review's list)",
    count: (state) =>
      countNeedsDecision(selectNeedsDecision(state, GOLDEN_AREA_ID)),
  },
  {
    name: "cockpit view model — vm.reviewQueue",
    count: (state) =>
      buildCockpitViewModel(state, GOLDEN_AREA_ID, true).reviewQueue.length,
  },
];

describe("what needs a decision has one answer (C2-S3)", () => {
  it.each(NEEDS_DECISION_SURFACES.map((s) => [s.name, s] as const))(
    "%s counts the three deciding items on the inventory's seed",
    (_name, surface) => {
      expect(surface.count(inventorySeedState())).toBe(3);
    },
  );

  it.each(NEEDS_DECISION_SURFACES.map((s) => [s.name, s] as const))(
    "%s counts one task once when it both missed a block and is do-today",
    (_name, surface) => {
      expect(surface.count(oneMissedBlockState())).toBe(1);
    },
  );

  it("a scheduled task is open work and is deliberately not a decision", () => {
    const state = inventorySeedState();
    const scheduled = state.tasks.filter((task) => task.status === "scheduled");
    expect(scheduled).toHaveLength(1);

    const items = selectNeedsDecision(state, GOLDEN_AREA_ID);
    expect(items.map((item) => item.task.id)).not.toContain(scheduled[0].id);
  });

  it("the headline never claims a coverage the list does not have", () => {
    // FINDING 5's label half. "carry over" reads as "everything still open",
    // and the scheduled task above proves that is more than this list.
    for (const count of [0, 1, 2, 7]) {
      expect(needsDecisionHeadline(count)).not.toMatch(/carry over/i);
    }
    expect(needsDecisionHeadline(0)).toBe("Ready to close");
    expect(needsDecisionHeadline(1)).toBe("1 open item needs a decision");
    expect(needsDecisionHeadline(3)).toBe("3 open items need a decision");
  });

  it("names its set, so the Pipeline rail's differently-scoped Review node cannot be read as the same number", () => {
    // The rail counts today's finished/missed blocks ("how today went"); this
    // counts standing open work. A reader must be able to tell the two apart
    // from the strings alone.
    for (const count of [1, 4]) {
      expect(needsDecisionHeadline(count)).toMatch(/open item/);
    }
  });

  it("scopes to one area, and answers nothing for no area", () => {
    const state = inventorySeedState();
    expect(selectNeedsDecision(state, "area-personal")).toEqual([]);
    expect(selectNeedsDecision(state, null)).toEqual([]);
  });
});
