import { afterEach, describe, expect, it, vi } from "vitest";
import { acceptDraft } from "./triage";
import {
  captureWorkflow,
  workflowSeed,
} from "@/__tests__/helpers/workflowReachability";

/**
 * Bug hunt #15 — "Do today" placed its drafted block at SORT time + 1 hour.
 * A late-evening sort put the block on tomorrow, and a sort made hours
 * earlier put it in the past. The block must be placed from the moment the
 * person accepts, and stay on today.
 */
afterEach(() => {
  vi.useRealTimers();
});

function sortAt(when: Date) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(when);
  const state = captureWorkflow(workflowSeed(), "Email the landlord");
  const draft = state.taskDrafts.find((d) => d.status === "pending")!;
  return { state, draftId: draft.id };
}

function acceptAt(
  state: ReturnType<typeof sortAt>["state"],
  draftId: string,
  when: Date,
) {
  vi.setSystemTime(when);
  return acceptDraft(state, draftId);
}

function sameLocalDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

describe("'Do today' drafted block time (bug hunt #15)", () => {
  it("places the block an hour after ACCEPT, not after the sort", () => {
    const { state, draftId } = sortAt(new Date(2026, 9, 17, 8, 0));
    const acceptedAt = new Date(2026, 9, 17, 15, 0);
    const next = acceptAt(state, draftId, acceptedAt);

    const proposal = next.timeBlockProposals[0]!;
    expect(proposal).toBeDefined();
    expect(new Date(proposal.proposed_start).getTime()).toBe(
      acceptedAt.getTime() + 60 * 60 * 1000,
    );
  });

  it("never puts a 'today' block on tomorrow after a late-evening sort", () => {
    const lateEvening = new Date(2026, 9, 17, 23, 20);
    const { state, draftId } = sortAt(lateEvening);
    const next = acceptAt(state, draftId, lateEvening);

    expect(next.tasks[0]?.status).toBe("active");
    const proposal = next.timeBlockProposals[0]!;
    expect(proposal).toBeDefined();
    const start = new Date(proposal.proposed_start);
    // It starts today, as soon as possible — not at 00:20 tomorrow.
    expect(sameLocalDay(start, lateEvening)).toBe(true);
    expect(start.getTime()).toBeGreaterThanOrEqual(lateEvening.getTime());
  });
});
