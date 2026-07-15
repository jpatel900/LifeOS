import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlanView } from "./PlanView";
import { WorkflowProvider } from "@/lib/WorkflowContext";
import { buildProposalRecalibration } from "@/lib/learning/learningSurface";
import type { Phase2MockExecutionSession } from "@/lib/types";
import {
  acceptLatestDraft,
  backlogLatestDraft,
  buildWorkflowCockpitViewModel,
  captureWorkflow,
  GOLDEN_AREA_ID,
  workflowSeed,
} from "@/__tests__/helpers/workflowReachability";

// #615: every actionable control here reaches the shared >=44px hit-target
// floor via hitTarget.ts (HIT_TARGET_MIN) — never a raw min-h-9/min-h-10
// (36/40px). jsdom does not compute layout, so this is a className-level
// guard for the states the demo-mode e2e oracle cannot reach: a task
// missing its first_tiny_step (mock parse always fills one in), a backlog
// task, and a sourced duration recalibration (needs 3+ same-area completed
// sessions no single e2e run builds up). The reachable Plan-stage controls
// (Draft block/Accept local/Move later/Reject) get the real geometric proof
// in the Playwright e2e at 390px (tests/e2e/hit-targets-390.spec.ts).

function noop() {}

function overRunSession(
  id: string,
  areaId: string,
): Phase2MockExecutionSession {
  return {
    id,
    user_id: "user-demo",
    area_id: areaId,
    task_id: null,
    calendar_block_id: null,
    planned_minutes: 60,
    actual_minutes: 84, // 1.4x the estimate
    paused_minutes: 0,
    distraction_minutes: 0,
    productivity_rating: null,
    status: "completed",
    outcome: "completed",
    cap_outcome: null,
    notes: null,
  };
}

function renderPlan(
  vm: ReturnType<typeof buildWorkflowCockpitViewModel>,
  sessions: Phase2MockExecutionSession[] = [],
) {
  render(
    <WorkflowProvider>
      <PlanView
        vm={vm}
        selectedTaskId={null}
        onSelectTask={noop}
        onPlan={noop}
        onUnplan={noop}
        onPromote={noop}
        onAcceptProposal={noop}
        onRejectProposal={noop}
        onNudgeProposal={noop}
        onCreateProposal={noop}
        onUpdateFirstTinyStep={noop}
        onExecute={noop}
        onCapture={noop}
        recalibrationForProposal={(areaId, estimateMinutes) =>
          buildProposalRecalibration(sessions, areaId, estimateMinutes)
        }
        appliedDurationForArea={() => null}
        decidedRecalIds={new Set()}
        onDecideRecalibration={noop}
      />
    </WorkflowProvider>,
  );
}

describe("PlanView 44px hit targets (#615)", () => {
  it("the launch-step prompt's Save first move button carries the 44px hit-target class", () => {
    let state = workflowSeed();
    state = captureWorkflow(state, "Draft the quarterly plan review.");
    state = acceptLatestDraft(state);
    // FR-022's mock triage always fills a first move on accept — strip it
    // back off so the "missing launch step" prompt actually renders (the
    // state this control needs is otherwise unreachable through capture).
    state = {
      ...state,
      tasks: state.tasks.map((task) =>
        task.status === "active" ? { ...task, first_tiny_step: null } : task,
      ),
    };

    renderPlan(buildWorkflowCockpitViewModel(state));

    // The same LaunchStepPrompt component renders twice for this task: once
    // in "To place" (missingLaunchStep) and once on its auto-drafted
    // proposal card (both read the same task's missing first_tiny_step) —
    // both instances must carry the hit-target class.
    const saveButtons = screen.getAllByRole("button", {
      name: "Save first move",
    });
    expect(saveButtons.length).toBeGreaterThan(0);
    for (const button of saveButtons) {
      expect(button.className).toContain("min-h-[44px]");
    }
  });

  it("the backlog 'Move to today' button carries the 44px hit-target class", () => {
    let state = workflowSeed();
    state = captureWorkflow(state, "Someday reorganize the archive.");
    state = backlogLatestDraft(state);

    renderPlan(buildWorkflowCockpitViewModel(state));

    expect(
      screen.getByRole("button", { name: /Move to today:/ }).className,
    ).toContain("min-h-[44px]");
  });

  it("the sourced recalibration 'Use Xm'/'Keep Xm' buttons carry the 44px hit-target class", () => {
    let state = workflowSeed();
    state = captureWorkflow(state, "Draft the quarterly plan review.");
    // Accepting a draft with a matching parse-time proposal draft
    // auto-promotes it to a real proposal — no separate propose call needed
    // (calling one would draft a second, duplicate proposal for the task).
    state = acceptLatestDraft(state);

    const sessions = [
      overRunSession("s1", GOLDEN_AREA_ID),
      overRunSession("s2", GOLDEN_AREA_ID),
      overRunSession("s3", GOLDEN_AREA_ID),
    ];

    renderPlan(buildWorkflowCockpitViewModel(state), sessions);

    expect(
      screen.getByRole("button", { name: /^Use \d+m$/ }).className,
    ).toContain("min-h-[44px]");
    expect(
      screen.getByRole("button", { name: /^Keep \d+m$/ }).className,
    ).toContain("min-h-[44px]");
  });
});
