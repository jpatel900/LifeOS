import { describe, expect, it } from "vitest";
import { buildPipelineCounts } from "@/app/components/moments/pipelineCounts";
import {
  acceptLatestDraft,
  buildWorkflowCockpitViewModel,
  captureWorkflow,
  planLatestActiveTask,
  workflowSeed,
  GOLDEN_AREA_ID,
} from "./helpers/workflowReachability";

/**
 * Final UX Loop C2-S2 — FINDING 3 from the C2-S1 capability inventory
 * (issue #687, comment "C2-S1 capability inventory — port premises").
 *
 * The legacy `/calendar` masthead chip labelled **"Plan"** was
 * `plan: today.length` — the count of ACTIVE tasks, not of anything planned.
 * The inventory's flagged instance: the chip read **2** while the hour rail
 * directly beneath it held **1** block.
 *
 * The inventory's ratified verdict is that `pipelineCounts.ts` holds the
 * truthful semantics for this stage: "active tasks that do NOT already have an
 * open block on today's rail". The port carries THAT definition, not the
 * legacy one.
 *
 * ## Why the divergence is reachable, not theoretical
 *
 * Placement normally flips a task `active` -> `scheduled`, so an active task
 * usually has no block. But `KNOWN_ISSUES` row 11 (2026-07-03 production
 * smoke, already pinned by `cockpitScheduledTaskStatusJoin.test.ts`) is
 * exactly the state where it does: a stale `accept_time_block_proposal` left
 * `calendar_blocks` at `scheduled` while the linked task stayed `active`. In
 * that state the legacy chip counts a task the user has already placed —
 * which is the lie in its plainest form.
 *
 * Red-first: on `origin/main` @ c4f96315 the first assertion below reads 1
 * (`today.length`) where the truthful count is 0.
 */

function statusDriftState() {
  let state = workflowSeed();
  state = captureWorkflow(state, "Prove the Plan chip counts plans.");
  state = acceptLatestDraft(state);
  state = planLatestActiveTask(state, 9);

  const plannedBlock = state.calendarBlocks.find(
    (block) => block.status === "scheduled" && block.task_id,
  );
  if (!plannedBlock) {
    throw new Error("Expected a scheduled block after planning.");
  }

  // The KNOWN_ISSUES row 11 shape: the block is on today's rail, the task
  // never left "active".
  return {
    ...state,
    tasks: state.tasks.map((task) =>
      task.id === plannedBlock.task_id
        ? { ...task, status: "active" as const }
        : task,
    ),
  };
}

describe("cockpit stage chips tell the truth (C2-S2 port premises)", () => {
  it("FINDING 3 — the Plan chip never counts a task already on today's rail", () => {
    const state = statusDriftState();
    const vm = buildWorkflowCockpitViewModel(state);

    // The task IS on today's hour rail.
    expect(
      state.calendarBlocks.filter((block) => block.status === "scheduled"),
    ).toHaveLength(1);

    // ...so nothing is left to plan.
    expect(vm.counts.plan).toBe(0);
  });

  it("FINDING 3 — the Plan chip and the moments Plan node agree, on the same state", () => {
    const state = statusDriftState();
    const vm = buildWorkflowCockpitViewModel(state);
    const momentsCounts = buildPipelineCounts(state, GOLDEN_AREA_ID);

    expect(vm.counts.plan).toBe(momentsCounts.plan);
  });

  it("still counts a genuinely unplaced do-today task", () => {
    let state = workflowSeed();
    state = captureWorkflow(state, "One thing that is genuinely unplaced.");
    state = acceptLatestDraft(state);

    const vm = buildWorkflowCockpitViewModel(state);
    expect(vm.counts.plan).toBe(1);
    expect(vm.counts.plan).toBe(
      buildPipelineCounts(state, GOLDEN_AREA_ID).plan,
    );
  });
});
