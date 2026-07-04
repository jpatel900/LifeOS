import { describe, expect, it } from "vitest";
import { mergePersistedCalendarBlocks } from "@/lib/WorkflowContext";
import {
  acceptLatestDraft,
  acceptLatestProposal,
  captureWorkflow,
  proposeLatestActiveTask,
  workflowSeed,
} from "./helpers/workflowReachability";

/**
 * Issue #324: a locally-created (optimistic) calendar block and its freshly
 * persisted counterpart briefly coexist right after accept/place, until the
 * next sync round-trip catches up the local id map. This suite exercises the
 * merge helper that reconciles them, using a real local block produced
 * through the transition helpers (never a hand-typed WorkflowState) paired
 * with a plain persisted-row fixture representing what the server would echo
 * back for that same placement.
 */
function stateWithLocalBlock() {
  let state = workflowSeed();
  state = captureWorkflow(state, "Echo dedup fixture task.");
  state = acceptLatestDraft(state);
  state = proposeLatestActiveTask(state);
  state = acceptLatestProposal(state);
  return state;
}

function persistedEchoOf(
  localBlock: ReturnType<typeof stateWithLocalBlock>["calendarBlocks"][number],
  overrides: Partial<
    ReturnType<typeof stateWithLocalBlock>["calendarBlocks"][number]
  > = {},
) {
  return {
    ...localBlock,
    id: "11111111-1111-4111-8111-111111111111",
    ...overrides,
  };
}

describe("mergePersistedCalendarBlocks (issue #324 echo dedup)", () => {
  it("merges a local block into its persisted echo when task_id and start_at match", () => {
    const state = stateWithLocalBlock();
    const localBlock = state.calendarBlocks[0];
    expect(localBlock).toBeDefined();

    const persistedRow = persistedEchoOf(localBlock);

    const merged = mergePersistedCalendarBlocks(
      [persistedRow],
      [localBlock],
      new Set<string>(),
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe(persistedRow.id);
  });

  it("keeps both blocks when the persisted row has a different start_at", () => {
    const state = stateWithLocalBlock();
    const localBlock = state.calendarBlocks[0];
    const persistedRow = persistedEchoOf(localBlock, {
      start_at: new Date(
        new Date(localBlock.start_at).getTime() + 60 * 60 * 1000,
      ).toISOString(),
    });

    const merged = mergePersistedCalendarBlocks(
      [persistedRow],
      [localBlock],
      new Set<string>(),
    );

    expect(merged).toHaveLength(2);
    expect(merged.map((row) => row.id).sort()).toEqual(
      [persistedRow.id, localBlock.id].sort(),
    );
  });

  it("never dedups two persisted rows sharing task_id and start_at", () => {
    const state = stateWithLocalBlock();
    const localBlock = state.calendarBlocks[0];
    const persistedRowA = persistedEchoOf(localBlock);
    const persistedRowB = persistedEchoOf(localBlock, {
      id: "22222222-2222-4222-8222-222222222222",
    });

    const merged = mergePersistedCalendarBlocks(
      [persistedRowA, persistedRowB],
      [],
      new Set<string>(),
    );

    expect(merged).toHaveLength(2);
    expect(merged.map((row) => row.id).sort()).toEqual(
      [persistedRowA.id, persistedRowB.id].sort(),
    );
  });
});
