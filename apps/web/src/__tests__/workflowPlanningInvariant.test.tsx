import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkflow, WorkflowProvider } from "@/lib/WorkflowContext";
import { createLocalProposalFromTask } from "@/lib/workflow";
import {
  acceptLatestDraft,
  captureWorkflow,
  workflowSeed,
} from "./helpers/workflowReachability";

vi.mock("next/navigation", () => ({
  usePathname: () => "/calendar",
  useRouter: () => ({ push: vi.fn() }),
}));

const STORAGE_KEY = "lifeos.phase2.workflow";
const PENDING = ["proposed", "edited"];

/**
 * #580 guard invariant (FR-008 "one planning model", state layer): a task
 * NEVER simultaneously has an active (pending) proposal and a scheduled
 * block. This probe drives the real WorkflowContext — the same reducer +
 * dispatch surface every shell uses — through the tempting states the old
 * dual model allowed (pending proposals surviving a direct placement, accept
 * on a task with siblings, edit-then-accept) and asserts the invariant after
 * every step, so no surface can recreate the split.
 */
function PlanningInvariantProbe() {
  const { state, planTaskAtHour, acceptLocalProposal, editLocalProposal } =
    useWorkflow();

  const violations = state.tasks.filter(
    (task) =>
      state.timeBlockProposals.some(
        (proposal) =>
          proposal.task_id === task.id && PENDING.includes(proposal.status),
      ) &&
      state.calendarBlocks.some(
        (block) =>
          block.task_id === task.id &&
          ["scheduled", "running"].includes(block.status),
      ),
  );
  const taskId =
    state.tasks.find((task) => ["active", "scheduled"].includes(task.status))
      ?.id ?? null;
  const pendingForTask = state.timeBlockProposals.filter(
    (proposal) =>
      proposal.task_id === taskId && PENDING.includes(proposal.status),
  );
  const supersededForTask = state.timeBlockProposals.filter(
    (proposal) =>
      proposal.task_id === taskId && proposal.status === "superseded",
  );
  const scheduledBlocksForTask = state.calendarBlocks.filter(
    (block) => block.task_id === taskId && block.status === "scheduled",
  );
  const firstPending = pendingForTask[0] ?? null;

  return (
    <div>
      <span data-testid="violation-count">{violations.length}</span>
      <span data-testid="pending-count">{pendingForTask.length}</span>
      <span data-testid="superseded-count">{supersededForTask.length}</span>
      <span data-testid="block-count">{scheduledBlocksForTask.length}</span>
      <button
        type="button"
        data-testid="place-at-8"
        onClick={() => taskId && planTaskAtHour(taskId, 8)}
      >
        Place at 8
      </button>
      <button
        type="button"
        data-testid="accept-first-pending"
        onClick={() => firstPending && acceptLocalProposal(firstPending.id)}
      >
        Accept first pending
      </button>
      <button
        type="button"
        data-testid="edit-first-pending"
        onClick={() => {
          if (!firstPending) return;
          const start = new Date(firstPending.proposed_start);
          start.setMinutes(start.getMinutes() + 30);
          const end = new Date(firstPending.proposed_end);
          end.setMinutes(end.getMinutes() + 30);
          editLocalProposal(firstPending.id, {
            proposed_start: start.toISOString(),
            proposed_end: end.toISOString(),
            rationale: "Edited by the invariant probe.",
          });
        }}
      >
        Edit first pending
      </button>
    </div>
  );
}

function renderProbeWithPendingProposals() {
  let state = workflowSeed();
  state = captureWorkflow(state, "Invariant guard proof task.");
  // Parse-created proposal folds in on accept — the audit's exact shape.
  state = acceptLatestDraft(state);
  const task = state.tasks.find((item) => item.status === "active");
  if (!task) throw new Error("No active task in guard fixture.");
  const start = new Date();
  start.setHours(14, 0, 0, 0);
  const end = new Date(start.getTime() + 45 * 60 * 1000);
  state = createLocalProposalFromTask(state, task.id, {
    proposed_start: start.toISOString(),
    proposed_end: end.toISOString(),
    rationale: "Second pending suggestion (tempting state).",
  });
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));

  return render(
    <WorkflowProvider>
      <PlanningInvariantProbe />
    </WorkflowProvider>,
  );
}

function counts() {
  return {
    violations: Number(screen.getByTestId("violation-count").textContent),
    pending: Number(screen.getByTestId("pending-count").textContent),
    superseded: Number(screen.getByTestId("superseded-count").textContent),
    blocks: Number(screen.getByTestId("block-count").textContent),
  };
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("#580 planning invariant guard (WorkflowContext state layer)", () => {
  it("direct placement with pending proposals never leaves an active proposal beside the block", () => {
    renderProbeWithPendingProposals();

    expect(counts()).toMatchObject({
      violations: 0,
      pending: 2,
      blocks: 0,
    });

    fireEvent.click(screen.getByTestId("place-at-8"));

    expect(counts()).toEqual({
      violations: 0,
      pending: 0,
      superseded: 2,
      blocks: 1,
    });
  });

  it("accept goes through placement: block appears, sibling superseded, invariant holds", () => {
    renderProbeWithPendingProposals();

    fireEvent.click(screen.getByTestId("accept-first-pending"));

    expect(counts()).toEqual({
      violations: 0,
      pending: 0,
      superseded: 1,
      blocks: 1,
    });
  });

  it("edit-then-accept funnels through the same placement path and keeps the invariant", () => {
    renderProbeWithPendingProposals();

    fireEvent.click(screen.getByTestId("edit-first-pending"));
    // Editing keeps the proposal pending — still zero blocks, no violation.
    expect(counts()).toMatchObject({
      violations: 0,
      pending: 2,
      blocks: 0,
    });

    fireEvent.click(screen.getByTestId("accept-first-pending"));

    expect(counts()).toEqual({
      violations: 0,
      pending: 0,
      superseded: 1,
      blocks: 1,
    });
  });

  it("editing after placement cannot resurrect a superseded proposal into the pending set", () => {
    renderProbeWithPendingProposals();

    fireEvent.click(screen.getByTestId("place-at-8"));
    // No pending proposal remains, so the edit action has nothing to grab —
    // and the reducer additionally refuses to edit settled proposals.
    fireEvent.click(screen.getByTestId("edit-first-pending"));

    expect(counts()).toEqual({
      violations: 0,
      pending: 0,
      superseded: 2,
      blocks: 1,
    });
  });
});
