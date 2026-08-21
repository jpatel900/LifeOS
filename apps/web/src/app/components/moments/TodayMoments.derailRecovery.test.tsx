// #737-A slice 2: closing the day journals the review to IndexedDB before any
// account write. jsdom has no IndexedDB, so without this polyfill the close-day
// path would take the "the device refused to hold it" branch.
import "fake-indexeddb/auto";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  // #688: AuthAffordance (masthead sign-in door) reads the current path for
  // its ?next= return target.
  usePathname: () => "/",
}));

// #292 brief view instrumentation: TodayMoments.tsx unconditionally calls
// createBriefViewRecorder() at module scope, so every split file mocks
// @/lib/reEntry/briefView the same way the original single file did — this
// isolates these tests from Supabase client/network concerns. Only
// TodayMoments.briefView.test.tsx needs the hoisted-spy form below to assert
// on recordIfNeeded directly.
vi.mock("@/lib/reEntry/briefView", () => ({
  createBriefViewRecorder: () => ({ recordIfNeeded: vi.fn() }),
}));

import { useWorkflow, WorkflowProvider } from "@/lib/WorkflowContext";

import { stubParseCaptureFetch } from "@/__tests__/helpers/parseCaptureFetch";

import { TodayMoments } from "./TodayMoments";

import {
  FIXED_NOW,
  resetTodayMomentsMountTracking,
  useAutoSortSeededCaptures,
} from "@/__tests__/helpers/todayMomentsHarness";

// C2-S13 (#687 round-7): FILE-LEVEL, applies regardless of describe nesting
// — every split file that mounts TodayMoments more than once needs this
// reset (deepLink.ts's module-level remount-tracking flag survives across
// `it()`s in the same file); see the harness export's own doc comment for
// the full mechanism.
afterEach(() => {
  resetTodayMomentsMountTracking();
});

/**
 * Moments pass P4 — packet: derail -> recovery journey. Drives the real
 * WorkflowProvider through capture -> accept (active) -> plan (scheduled)
 * -> startTaskSession (running) -> markSession("stuck") so
 * buildFlowVM's driftReasons set trips for real, not a hand-built VM.
 */
function DriftSeedBridge() {
  const {
    state,
    submitCaptureText,
    acceptTaskDraft,
    planTaskAtHour,
    startTaskSession,
    markSession,
  } = useWorkflow();
  useAutoSortSeededCaptures();
  const draft = state.taskDrafts[0];
  const task = state.tasks[0];

  return (
    <div>
      <span data-testid="drift-seed-draft-count">
        {state.taskDrafts.length}
      </span>
      <span data-testid="drift-seed-task-status">{task?.status ?? ""}</span>
      <button
        type="button"
        data-testid="drift-seed-submit"
        onClick={() => submitCaptureText("Draft the client proposal", null)}
      >
        Seed capture
      </button>
      <button
        type="button"
        data-testid="drift-seed-accept"
        disabled={!draft}
        onClick={() => draft && acceptTaskDraft(draft.id)}
      >
        Seed accept
      </button>
      <button
        type="button"
        data-testid="drift-seed-plan"
        disabled={!task}
        onClick={() => task && planTaskAtHour(task.id, 10)}
      >
        Seed plan
      </button>
      <button
        type="button"
        data-testid="drift-seed-start-session"
        disabled={!task}
        onClick={() => task && startTaskSession(task.id)}
      >
        Seed start session
      </button>
      <button
        type="button"
        data-testid="drift-seed-mark-stuck"
        onClick={() => markSession("stuck")}
      >
        Seed mark stuck
      </button>
    </div>
  );
}

describe("TodayMoments — P4 derail -> recovery journey", () => {
  let restoreFetch: (() => void) | null = null;

  beforeEach(() => {
    restoreFetch = stubParseCaptureFetch();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    restoreFetch?.();
    restoreFetch = null;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  /**
   * Seeds one real running-then-stuck execution session through
   * WorkflowContext and renders TodayMoments on Flow at FIXED_NOW (today's
   * real calendar date, matching planTaskAtHour's real-wall-clock start).
   */
  async function seedDriftedFlow() {
    const utils = render(
      <WorkflowProvider>
        <DriftSeedBridge />
        <TodayMoments now={FIXED_NOW} initialMoment="flow" />
      </WorkflowProvider>,
    );

    fireEvent.click(screen.getByTestId("drift-seed-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("drift-seed-draft-count")).toHaveTextContent(
        "1",
      );
    });

    fireEvent.click(screen.getByTestId("drift-seed-accept"));
    await waitFor(() => {
      expect(screen.getByTestId("drift-seed-task-status")).toHaveTextContent(
        "active",
      );
    });

    fireEvent.click(screen.getByTestId("drift-seed-plan"));
    await waitFor(() => {
      expect(screen.getByTestId("drift-seed-task-status")).toHaveTextContent(
        "scheduled",
      );
    });

    fireEvent.click(screen.getByTestId("drift-seed-start-session"));
    fireEvent.click(screen.getByTestId("drift-seed-mark-stuck"));

    return utils;
  }

  it("Flow shows the drift card once the active session is marked stuck", async () => {
    await seedDriftedFlow();

    const card = await screen.findByTestId("drift-recovery-card");
    expect(card).toHaveTextContent("This block got away from you.");
    expect(card).toHaveTextContent("You marked it stuck.");
  });

  it("Reclaim keeps the session state consistent and shows the reclaim toast", async () => {
    await seedDriftedFlow();

    await screen.findByTestId("drift-recovery-card");
    fireEvent.click(screen.getByTestId("drift-recovery-reclaim"));

    expect(screen.getByTestId("today-moments-toast")).toHaveTextContent(
      "Block reclaimed",
    );
    // Still on Flow, still showing a consistent (non-crashing) drift card.
    expect(screen.getByTestId("flow-moment")).toBeInTheDocument();
  });

  it("Abandon switches the moment to Start with the fresh-start toast", async () => {
    await seedDriftedFlow();

    await screen.findByTestId("drift-recovery-card");
    fireEvent.click(screen.getByTestId("drift-recovery-abandon"));

    expect(screen.getByTestId("start-moment")).toBeInTheDocument();
    expect(screen.getByTestId("today-moments-toast")).toHaveTextContent(
      "Fresh start — pick your next move",
    );
  });

  it("the progression rail renders nodes for the first-move task on Flow", async () => {
    const utils = render(
      <WorkflowProvider>
        <DriftSeedBridge />
        <TodayMoments now={FIXED_NOW} initialMoment="flow" />
      </WorkflowProvider>,
    );

    fireEvent.click(screen.getByTestId("drift-seed-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("drift-seed-draft-count")).toHaveTextContent(
        "1",
      );
    });
    fireEvent.click(screen.getByTestId("drift-seed-accept"));
    await waitFor(() => {
      expect(screen.getByTestId("drift-seed-task-status")).toHaveTextContent(
        "active",
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("progression-rail")).toBeInTheDocument();
    });

    utils.unmount();
  });
});
