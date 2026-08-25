import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowProvider, useWorkflow } from "@/lib/WorkflowContext";
import { STORAGE_KEY } from "@/lib/workflowContext/reducerCore";
import type { Phase2MockExecutionSession } from "@/lib/types";
import {
  acceptLatestDraft,
  backlogLatestDraft,
  captureWorkflow,
  GOLDEN_AREA_ID,
  planLatestActiveTask,
  workflowSeed,
} from "@/__tests__/helpers/workflowReachability";
import { ReviewSheet } from "./ReviewSheet";

/**
 * C2-S3 (#687) — the ported Review surface, driven through the REAL
 * `WorkflowProvider`, so what is proved is the same reducer path `/review`
 * drives, not a hand-built view model agreeing with itself.
 *
 * Red-first on `origin/main` @ 873c6ed7: this component does not exist there,
 * and the moments home has no Review surface at all — the Pipeline rail's
 * Review node toasts "Opens with the full shell". Every assertion below fails.
 */

const AREA = GOLDEN_AREA_ID;
const NOW = new Date("2026-08-04T18:00:00");

function session(
  over: Partial<Phase2MockExecutionSession> & { id: string },
): Phase2MockExecutionSession {
  return {
    user_id: "user-demo",
    area_id: AREA,
    task_id: null,
    calendar_block_id: null,
    planned_minutes: 60,
    actual_minutes: 45,
    paused_minutes: 0,
    distraction_minutes: 0,
    productivity_rating: null,
    status: "completed",
    outcome: "completed",
    cap_outcome: null,
    notes: null,
    ...over,
  } as Phase2MockExecutionSession;
}

/**
 * The C2-S1 inventory's measured seed: 2 do-today + 1 put-off + 1 scheduled
 * task in one area. Three of the four need a decision; the scheduled one has an
 * hour and does not.
 */
function seedState() {
  let state = workflowSeed();
  state = captureWorkflow(state, "First open thing");
  state = acceptLatestDraft(state);
  state = captureWorkflow(state, "Second open thing");
  state = acceptLatestDraft(state);
  state = captureWorkflow(state, "Third open thing");
  state = acceptLatestDraft(state);
  state = captureWorkflow(state, "Something put off for later");
  state = backlogLatestDraft(state);
  return planLatestActiveTask(state, 9);
}

/** Mirrors the store back out, so assertions read state and not just the DOM. */
function StateProbe() {
  const { state } = useWorkflow();
  const count = (status: string) =>
    state.tasks.filter((task) => task.status === status).length;
  return (
    <div>
      <span data-testid="probe-active">{count("active")}</span>
      <span data-testid="probe-backlog">{count("backlog")}</span>
      <span data-testid="probe-dropped">{count("dropped")}</span>
    </div>
  );
}

const closeDay = vi.fn();

function renderSheet(
  options: {
    open?: boolean;
    state?: ReturnType<typeof workflowSeed>;
    dayClose?: Parameters<typeof ReviewSheet>[0]["dayClose"];
  } = {},
) {
  window.sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(options.state ?? seedState()),
  );
  return render(
    <WorkflowProvider>
      <StateProbe />
      <ReviewSheet
        open={options.open ?? true}
        onClose={vi.fn()}
        selectedAreaId={AREA}
        now={NOW}
        dayClose={options.dayClose ?? null}
        onCloseDay={closeDay}
      />
    </WorkflowProvider>,
  );
}

function probe(id: string) {
  return Number(screen.getByTestId(id).textContent);
}

describe("ReviewSheet — the ported Review surface", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    closeDay.mockClear();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    window.sessionStorage.clear();
  });

  it("renders nothing when closed", () => {
    renderSheet({ open: false });
    expect(screen.queryByTestId("review-sheet")).not.toBeInTheDocument();
  });

  it("FINDING 5 — the headline number is the length of the list it heads", () => {
    renderSheet();
    const rows = screen.getAllByTestId(/^review-sheet-decision-/);
    expect(rows).toHaveLength(3);
    expect(screen.getByTestId("review-sheet-headline").textContent).toBe(
      "3 open items need a decision",
    );
  });

  it("FINDING 5 — the headline never says 'carry over'", () => {
    renderSheet();
    expect(screen.getByTestId("review-sheet-headline").textContent).not.toMatch(
      /carry over/i,
    );
  });

  it("carries an item forward and leaves the rest of the review standing", () => {
    renderSheet();
    const before = screen.getAllByTestId(/^review-sheet-decision-/).length;
    const backlogRow = screen
      .getAllByTestId(/^review-sheet-carry-forward-/)
      .at(-1)!;

    fireEvent.click(backlogRow);

    // FINDING 6 cannot recur: the surface is still here, still a review, and
    // the day can still be closed from it.
    expect(screen.getByTestId("review-sheet")).toBeInTheDocument();
    expect(screen.getByTestId("review-sheet-close-day")).toBeInTheDocument();
    expect(
      screen.getAllByTestId(/^review-sheet-decision-/).length,
    ).toBeGreaterThan(0);
    expect(before).toBe(3);
  });

  it("puts an item off, and the store really moves it", () => {
    renderSheet();
    const activeBefore = probe("probe-active");
    const target = screen.getAllByTestId(/^review-sheet-defer-/)[0];

    fireEvent.click(target);

    expect(probe("probe-active")).toBe(activeBefore - 1);
    expect(probe("probe-backlog")).toBeGreaterThan(0);
  });

  it("drops an item, and the store really drops it", () => {
    renderSheet();
    expect(probe("probe-dropped")).toBe(0);

    fireEvent.click(screen.getAllByTestId(/^review-sheet-drop-/)[0]);

    expect(probe("probe-dropped")).toBe(1);
  });

  it("counts down to zero and the headline says the day is ready", () => {
    renderSheet();
    for (const button of screen.getAllByTestId(/^review-sheet-drop-/)) {
      fireEvent.click(button);
    }
    expect(screen.getByTestId("review-sheet-headline").textContent).toBe(
      "Ready to close",
    );
    expect(
      screen.getByTestId("review-sheet-decisions-empty"),
    ).toBeInTheDocument();
  });

  it("shows planned vs actual, and never a full bar for a session with no plan", () => {
    const state = {
      ...seedState(),
      executionSessions: [
        session({ id: "session-1", planned_minutes: 60, actual_minutes: 30 }),
        session({
          id: "session-2",
          planned_minutes: null,
          actual_minutes: 25,
          calendar_block_id: null,
        }),
      ],
    };
    renderSheet({ state });

    expect(
      screen.getByTestId("review-sheet-session-session-1"),
    ).toHaveTextContent("30/60 min");
    // The blockless one: its own time, no comparison, no bar.
    const blockless = screen.getByTestId("review-sheet-session-session-2");
    expect(blockless).toHaveTextContent("25 min");
    expect(blockless).not.toHaveTextContent("/0");
    expect(
      screen.getByTestId("review-sheet-session-noplan-session-2"),
    ).toBeInTheDocument();
  });

  it("never lists one session twice after a sync", () => {
    // The measured post-sync double: the optimistic row and the account row for
    // ONE finished session both sit in `state.executionSessions`.
    const state = {
      ...seedState(),
      executionSessions: [
        session({ id: "session-1", task_id: null }),
        session({ id: "794b7d18-6b4f-4a7e-9c1a-2f0f5f7a1c33", task_id: null }),
      ],
    };
    renderSheet({ state });

    const rows = screen
      .getByTestId("review-sheet-sessions")
      .querySelectorAll("li");
    expect(rows).toHaveLength(1);
    // The DURABLE record is the one kept — the account row, not the reducer's
    // optimistic copy of it.
    expect(
      screen.getByTestId(
        "review-sheet-session-794b7d18-6b4f-4a7e-9c1a-2f0f5f7a1c33",
      ),
    ).toBeInTheDocument();
  });

  it("offers the day's close, and never closes it itself", () => {
    renderSheet();
    fireEvent.click(screen.getByTestId("review-sheet-close-day"));
    // The one close path in the shell is called; the sheet holds no close
    // logic of its own, so there is nothing else to assert here — and that is
    // the point.
    expect(closeDay).toHaveBeenCalledTimes(1);
  });

  it("shows the verdict instead of the action once the day is closed", () => {
    renderSheet({
      dayClose: { periodStart: "2026-08-04", savedToAccount: true },
    });

    expect(screen.getByTestId("review-sheet-verdict")).toHaveTextContent(
      "Today is closed.",
    );
    // C1 audit P0#4: the action is spent, not merely disabled.
    expect(
      screen.queryByTestId("review-sheet-close-day"),
    ).not.toBeInTheDocument();
  });
});
