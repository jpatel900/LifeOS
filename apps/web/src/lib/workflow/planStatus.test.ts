import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildPipelineCounts } from "@/app/components/moments/pipelineCounts";
import { buildCockpitViewModel } from "@/lib/cockpit/viewModel";
import {
  acceptLatestDraft,
  captureWorkflow,
  GOLDEN_AREA_ID,
  planLatestActiveTask,
  workflowSeed,
} from "@/__tests__/helpers/workflowReachability";
import { selectTasksToPlace } from "./planStatus";

/**
 * C2-S2 — "what is left to place?" has ONE answer, wherever it is asked.
 *
 * The moments home shows the Pipeline rail's **Plan** badge and the ported
 * Plan sheet's **To place** list at the same time, side by side (the sheet is
 * a slide-over; the rail stays visible behind it at desktop width). A badge
 * reading 0 beside a list holding a row is the same class of defect C1's
 * `captureStatus.ts` guard exists to prevent for capture.
 *
 * Red-first: on `origin/main` @ c4f96315 — and on this branch before the
 * `selectTasksToPlace` extraction — the drift case below returned 1 from the
 * sheet's list and 0 from the badge, because the rule was written out three
 * separate times.
 */

const NOW = new Date("2026-08-04T12:00:00");

/**
 * The clock is pinned to `NOW`, not just read as `NOW` (lane contract clause 5,
 * "pin calendar/clock-dependent moments in specs").
 *
 * `planLatestActiveTask` -> `planTaskAtHour` builds its block from the REAL
 * `new Date()`, while every surface below is asked "what is left to place?"
 * as of `NOW`. Without this pin those two dates are the same day only on
 * 2026-08-04 itself: from 2026-08-05 onward the drift block lands on a rail
 * `NOW` calls tomorrow, so the "already holds a block on today's rail" cases
 * counted 1 instead of 0. That is how this file passed in CI on the day #804
 * merged and failed on the next day's local run.
 */
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterAll(() => {
  vi.useRealTimers();
});

/**
 * The `KNOWN_ISSUES` row 11 shape (2026-07-03 production smoke, also pinned by
 * `__tests__/cockpitScheduledTaskStatusJoin.test.ts`): the block is on today's
 * rail, the task never left `active`. The only state where the three
 * derivations could disagree — and it is a state the product really produced.
 */
function statusDriftState(): ReturnType<typeof workflowSeed> {
  let state = workflowSeed();
  state = captureWorkflow(state, "One thing, counted once.");
  state = acceptLatestDraft(state);
  state = planLatestActiveTask(state, 9);

  const plannedBlock = state.calendarBlocks.find(
    (block) => block.status === "scheduled" && block.task_id,
  );
  if (!plannedBlock) throw new Error("Expected a scheduled block.");

  return {
    ...state,
    tasks: state.tasks.map((task) =>
      task.id === plannedBlock.task_id
        ? { ...task, status: "active" as const }
        : task,
    ),
  };
}

function unplacedState(): ReturnType<typeof workflowSeed> {
  let state = workflowSeed();
  state = captureWorkflow(state, "One thing, genuinely unplaced.");
  return acceptLatestDraft(state);
}

/**
 * Every surface that answers "what is left to place?". A new one must be added
 * here, or this guard silently stops covering it.
 */
const TO_PLACE_SURFACES: ReadonlyArray<{
  name: string;
  count: (state: ReturnType<typeof workflowSeed>) => number;
}> = [
  {
    name: "shared selector (the Plan sheet's To place list)",
    count: (state) => selectTasksToPlace(state, GOLDEN_AREA_ID, NOW).length,
  },
  {
    name: "moments Pipeline rail — Plan badge",
    count: (state) =>
      buildPipelineCounts(state, GOLDEN_AREA_ID, { now: NOW }).plan,
  },
  {
    name: "cockpit masthead — Plan chip",
    count: (state) =>
      buildCockpitViewModel(state, GOLDEN_AREA_ID, true, { now: NOW }).counts
        .plan,
  },
];

describe("what is left to place has one answer (C2-S2)", () => {
  it.each(TO_PLACE_SURFACES.map((s) => [s.name, s] as const))(
    "%s counts nothing when the task already holds a block on today's rail",
    (_name, surface) => {
      expect(surface.count(statusDriftState())).toBe(0);
    },
  );

  it.each(TO_PLACE_SURFACES.map((s) => [s.name, s] as const))(
    "%s counts a genuinely unplaced do-today task",
    (_name, surface) => {
      expect(surface.count(unplacedState())).toBe(1);
    },
  );

  it("the Plan sheet's list and the rail's badge can never disagree", () => {
    for (const state of [statusDriftState(), unplacedState()]) {
      const list = selectTasksToPlace(state, GOLDEN_AREA_ID, NOW).length;
      const badge = buildPipelineCounts(state, GOLDEN_AREA_ID, {
        now: NOW,
      }).plan;
      const chip = buildCockpitViewModel(state, GOLDEN_AREA_ID, true, {
        now: NOW,
      }).counts.plan;
      expect([badge, chip]).toEqual([list, list]);
    }
  });

  it("scopes to one area, and answers nothing for no area", () => {
    const state = unplacedState();
    expect(selectTasksToPlace(state, "area-personal", NOW)).toEqual([]);
    expect(selectTasksToPlace(state, null, NOW)).toEqual([]);
  });
});
