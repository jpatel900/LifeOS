import {
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CalendarPage from "../app/calendar/page";
import { ReviewView } from "../app/components/LifeOSCockpit";
import { WorkflowProvider } from "@/lib/WorkflowContext";
import type { PolicyChangeCandidate } from "@/lib/learning/overrideScan";
import type { Phase2MockExecutionSession } from "@/lib/types";
import {
  acceptLatestDraft,
  buildWorkflowCockpitViewModel,
  captureWorkflow,
  GOLDEN_AREA_ID,
  proposeLatestActiveTask,
  workflowSeed,
} from "./helpers/workflowReachability";

const STORAGE_KEY = "lifeos.phase2.workflow";

/**
 * S9 (#261) — Stage-1 golden-journey criterion, point 6 surfaces.
 *
 * 6a (recalibration) is seedable: it reads state.executionSessions, so a seeded
 * cockpit plan stage renders the sourced adjustment on a proposal. 6b (policy
 * proposal) reads override_records, which only load from Supabase — impossible
 * in mock mode — so it is proven at the component boundary with a seeded prop
 * (the load-wiring is covered by the WorkflowContext + composer + recorder unit
 * tests). See the #261 evidence for why the split exists.
 */

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

// A seeded state with one active task (given a launch step so the proposal
// gate opens), a proposal for it in GOLDEN_AREA_ID, and the given sessions.
function seedWithProposal(
  sessions: Phase2MockExecutionSession[],
): void {
  let state = workflowSeed();
  state = captureWorkflow(state, "Draft the quarterly plan review.");
  state = acceptLatestDraft(state);
  // FR-022 launch gate: a proposal only drafts when a first move exists.
  state = {
    ...state,
    tasks: state.tasks.map((task) =>
      task.status === "active"
        ? { ...task, first_tiny_step: "Open the planning doc" }
        : task,
    ),
  };
  state = proposeLatestActiveTask(state);
  state = { ...state, executionSessions: sessions };
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/calendar");
});

describe("S9 golden-journey point 6a: sourced duration recalibration", () => {
  it("displays a recalibration sourced from the area's real actuals on a proposal", async () => {
    // Three completed sessions in the proposal's area, each running 1.4x over.
    seedWithProposal([
      overRunSession("s1", GOLDEN_AREA_ID),
      overRunSession("s2", GOLDEN_AREA_ID),
      overRunSession("s3", GOLDEN_AREA_ID),
    ]);

    render(
      <WorkflowProvider>
        <CalendarPage />
      </WorkflowProvider>,
    );

    // Hydration from sessionStorage happens in an effect — wait for the card(s).
    // The seed drafts a proposal per active task in the area, so ≥1 card shows.
    const cards = await screen.findAllByTestId("proposal-recalibration");
    expect(cards.length).toBeGreaterThan(0);
    const card = cards[0];
    // Sourced, no invented numbers: the multiplier + evidence are shown.
    expect(card).toHaveTextContent(/estimated \d+m/);
    expect(card).toHaveTextContent(/run 1\.4x/);
    expect(card).toHaveTextContent(/completed sessions in this area/);

    // Apply-on-accept resolves that card (decision recorded; mock write is a no-op).
    fireEvent.click(within(card).getByRole("button", { name: /^Use \d+m$/ }));
    expect(screen.queryAllByTestId("proposal-recalibration")).toHaveLength(
      cards.length - 1,
    );
  });

  it("shows no recalibration when the area lacks enough actuals", async () => {
    // A proposal renders, but only one session exists — below the 3-sample
    // floor — so the card is absent (not merely absent for lack of a proposal).
    seedWithProposal([overRunSession("s1", GOLDEN_AREA_ID)]);

    render(
      <WorkflowProvider>
        <CalendarPage />
      </WorkflowProvider>,
    );

    // The proposal itself is present; only the recalibration is withheld.
    expect((await screen.findAllByText("Accept local")).length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByTestId("proposal-recalibration")).toBeNull();
  });
});

describe("S9 golden-journey point 6b: override-pattern policy proposal", () => {
  const candidate: PolicyChangeCandidate = {
    policyIdentifier: "planning.default_time_block",
    areaId: null,
    examined: 5,
    overrideCount: 3,
    latestOverrideType: "edited",
    evidence: "overridden 3 of the last 5",
  };

  function renderReview(policyProposals: PolicyChangeCandidate[]) {
    const onDecidePolicy = vi.fn();
    render(
      <ReviewView
        vm={buildWorkflowCockpitViewModel(workflowSeed())}
        policyProposals={policyProposals}
        onDecidePolicy={onDecidePolicy}
        onCarryForward={() => {}}
        onDefer={() => {}}
        onDrop={() => {}}
        onSave={() => {}}
      />,
    );
    return onDecidePolicy;
  }

  it("surfaces the proposal for a user decision and records approval", () => {
    const onDecidePolicy = renderReview([candidate]);

    const card = screen.getByTestId("policy-proposal");
    expect(card).toHaveTextContent("planning.default_time_block");
    expect(card).toHaveTextContent("overridden 3 of the last 5");

    fireEvent.click(within(card).getByRole("button", { name: "Approve change" }));
    expect(onDecidePolicy).toHaveBeenCalledWith(candidate, "accepted");
  });

  it("records a decline (propose->approve; nothing auto-applies)", () => {
    const onDecidePolicy = renderReview([candidate]);

    fireEvent.click(screen.getByRole("button", { name: "Keep as is" }));
    expect(onDecidePolicy).toHaveBeenCalledWith(candidate, "declined");
  });

  it("shows no policy surface when there is nothing to propose", () => {
    renderReview([]);
    expect(screen.queryByTestId("policy-proposals")).toBeNull();
  });
});
