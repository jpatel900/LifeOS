import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WhileYouWereOutSummary } from "@/lib/reEntry/summary";
import type { ReEntryDeferralPlan } from "@/lib/reEntry/defer";
import { ReEntryRitual } from "./ReEntryRitual";

/**
 * FR-028 packet F-G2c: presentation-level coverage over hand-built
 * summary/plan/outcomes props — deferral enumeration, single-primary-button
 * UX-INV-1, and the zero-red textual guard all belong here.
 */

const baseSummary: WhileYouWereOutSummary = {
  absenceDays: 5,
  lapsedBlocks: [],
  counts: { lapsedBlocks: 2, pendingTriage: 1, activeTasks: 3 },
  stalest: {
    kind: "task",
    id: "t-old",
    label: "Write the report",
    ageDays: 12,
  },
};

const basePlan: ReEntryDeferralPlan = {
  taskDeferrals: [
    {
      taskId: "t1",
      areaId: "area-1",
      taskTitle: "Draft the proposal",
      blockIds: ["b1"],
      lapsedBlockEndAts: ["2026-07-01T00:00:00.000Z"],
    },
  ],
  blockUnplans: [
    {
      blockId: "b2",
      areaId: "area-1",
      taskId: null,
      endAt: "2026-07-02T00:00:00.000Z",
    },
  ],
  requiresApproval: [],
};

function renderRitual(
  overrides: Partial<Parameters<typeof ReEntryRitual>[0]> = {},
) {
  const onAcceptRecovery = vi.fn();
  const onSwapRecovery = vi.fn();
  const onDismiss = vi.fn();

  const utils = render(
    <ReEntryRitual
      summary={baseSummary}
      plan={basePlan}
      outcomes={[]}
      demoMode={false}
      recovery={{
        taskId: "t1",
        title: "Draft the proposal",
        why: "Just moved to backlog",
      }}
      onAcceptRecovery={onAcceptRecovery}
      onSwapRecovery={onSwapRecovery}
      onDismiss={onDismiss}
      {...overrides}
    />,
  );

  return { ...utils, onAcceptRecovery, onSwapRecovery, onDismiss };
}

describe("ReEntryRitual", () => {
  it("renders the headline with absence days and calm subline", () => {
    renderRitual();

    expect(screen.getByTestId("re-entry-ritual")).toHaveTextContent(
      "Welcome back — 5 days away.",
    );
    expect(screen.getByTestId("re-entry-ritual")).toHaveTextContent(
      "Nothing is lost.",
    );
  });

  it("enumerates every planned deferral as a row", () => {
    renderRitual();

    expect(
      screen.getByTestId("re-entry-ritual-deferral-task-t1"),
    ).toHaveTextContent("Draft the proposal → backlog");
    expect(
      screen.getByTestId("re-entry-ritual-deferral-block-b2"),
    ).toHaveTextContent("Block unscheduled");
  });

  it("shows a needs-a-hand note for failed outcomes, never destructive styling", () => {
    renderRitual({
      outcomes: [
        { kind: "task_to_backlog", subjectId: "t1", ok: false, error: "boom" },
      ],
    });

    expect(
      screen.getByTestId("re-entry-ritual-deferral-task-t1"),
    ).toHaveTextContent("needs a hand");
  });

  it("shows demo-mode copy instead of outcomes when demoMode is true", () => {
    renderRitual({ demoMode: true });

    expect(
      screen.getByTestId("re-entry-ritual-deferral-task-t1"),
    ).toHaveTextContent("not saved in demo mode");
    expect(
      screen.getByTestId("re-entry-ritual-deferral-block-b2"),
    ).toHaveTextContent("not saved in demo mode");
  });

  it("lists requiresApproval entries separately and never as actionable", () => {
    renderRitual({
      plan: {
        ...basePlan,
        requiresApproval: [
          { blockId: "b3", taskId: "t2", reason: "google_backed_block" },
        ],
      },
    });

    expect(screen.getByTestId("re-entry-ritual-approvals")).toHaveTextContent(
      "kept as-is — has a Google calendar link; decide in Review",
    );
  });

  it("shows the one stalest thing when present", () => {
    renderRitual();

    expect(screen.getByTestId("re-entry-ritual-stalest")).toHaveTextContent(
      "Oldest waiting: Write the report (12 days)",
    );
  });

  it("renders exactly one primary (btn-primary equivalent) button", () => {
    renderRitual();

    const buttons = screen.getAllByRole("button");
    const primaryButtons = buttons.filter((button) =>
      button.className.includes("bg-primary"),
    );
    expect(primaryButtons).toHaveLength(1);
    expect(primaryButtons[0]).toBe(
      screen.getByTestId("re-entry-ritual-recovery-accept"),
    );
  });

  it("wires accept/swap/dismiss handlers", () => {
    const { onAcceptRecovery, onSwapRecovery, onDismiss } = renderRitual();

    fireEvent.click(screen.getByTestId("re-entry-ritual-recovery-accept"));
    expect(onAcceptRecovery).toHaveBeenCalledWith("t1");

    fireEvent.click(screen.getByTestId("re-entry-ritual-recovery-swap"));
    expect(onSwapRecovery).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("re-entry-ritual-start-day"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("renders no recovery card when recovery is null", () => {
    renderRitual({ recovery: null });

    expect(
      screen.queryByTestId("re-entry-ritual-recovery"),
    ).not.toBeInTheDocument();
  });

  it("zero-red guard: no destructive class and no guilt language", () => {
    renderRitual({
      outcomes: [
        { kind: "task_to_backlog", subjectId: "t1", ok: false, error: "boom" },
      ],
      plan: {
        ...basePlan,
        requiresApproval: [
          { blockId: "b3", taskId: "t2", reason: "google_backed_block" },
        ],
      },
    });

    const container = screen.getByTestId("re-entry-ritual");
    expect(container.innerHTML).not.toMatch(/destructive/i);
    expect(container.innerHTML).not.toMatch(/overdue/i);
    expect(container.innerHTML).not.toMatch(/\blate\b/i);
    expect(container.innerHTML).not.toMatch(/failed/i);
    expect(container.innerHTML).not.toMatch(/missed/i);
    expect(container.innerHTML).not.toMatch(/state-risk/i);
  });
});
