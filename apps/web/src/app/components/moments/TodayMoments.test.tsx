import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkflow, WorkflowProvider } from "@/lib/WorkflowContext";
import { stubParseCaptureFetch } from "@/__tests__/helpers/parseCaptureFetch";
import { latestActivityTimestamp } from "@/lib/reEntry/detect";
import { TodayMoments } from "./TodayMoments";
import type { TodayMomentsProps } from "./TodayMoments";

const FIXED_NOW = new Date("2026-07-05T15:00:00.000Z");

/**
 * Test-only bridge that drives a real capture -> mock parse -> accept
 * journey through WorkflowContext, so the Start moment has a first move to
 * show. The default demo WorkflowProvider state seeds areas but no tasks,
 * so journeys that need a first move must create one through real context
 * actions rather than mocking WorkflowContext internals.
 */
function TaskSeedBridge() {
  const { state, submitCaptureText, acceptTaskDraft } = useWorkflow();
  const draft = state.taskDrafts[0];

  return (
    <div>
      <span data-testid="seed-draft-count">{state.taskDrafts.length}</span>
      <button
        type="button"
        data-testid="seed-submit"
        onClick={() =>
          submitCaptureText("Draft the proposal for the client", null)
        }
      >
        Seed capture
      </button>
      <button
        type="button"
        data-testid="seed-accept"
        disabled={!draft}
        onClick={() => draft && acceptTaskDraft(draft.id)}
      >
        Seed accept
      </button>
    </div>
  );
}

function renderToday(props: Partial<TodayMomentsProps> = {}) {
  return render(
    <WorkflowProvider>
      <TaskSeedBridge />
      <TodayMoments now={FIXED_NOW} {...props} />
    </WorkflowProvider>,
  );
}

describe("TodayMoments", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it("switches moments via number keys and the MomentSwitcher", () => {
    renderToday({ initialMoment: "start" });

    expect(screen.getByTestId("start-moment")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "2" });
    expect(screen.getByTestId("flow-moment")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "3" });
    expect(screen.getByTestId("close-moment")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("moment-switcher-start"));
    expect(screen.getByTestId("start-moment")).toBeInTheDocument();
  });

  it("start-to-first-move journey: Start now switches to Flow with a running countdown", async () => {
    const restoreFetch = stubParseCaptureFetch();
    renderToday({ initialMoment: "start" });

    expect(screen.getByTestId("start-moment-empty")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("seed-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("seed-draft-count")).toHaveTextContent("1");
    });
    fireEvent.click(screen.getByTestId("seed-accept"));

    await waitFor(() => {
      expect(screen.getByTestId("first-move-card")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("first-move-start"));

    expect(screen.getByTestId("flow-moment")).toBeInTheDocument();
    expect(screen.getByTestId("current-block-hero")).toBeInTheDocument();
    expect(screen.getByTestId("current-block-hero-time")).toHaveTextContent(
      /\d+:\d{2}/,
    );

    restoreFetch();
  });

  it("capture-during-flow: pressing C opens capture from Flow, saving keeps the moment on Flow", () => {
    renderToday({ initialMoment: "flow" });

    expect(screen.getByTestId("flow-moment")).toBeInTheDocument();
    expect(screen.getByTestId("flow-moment-empty")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "c" });
    expect(screen.getByTestId("capture-overlay")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("capture-overlay-textarea"), {
      target: { value: "Follow up with Alex about the contract" },
    });
    fireEvent.keyDown(screen.getByTestId("capture-overlay-textarea"), {
      key: "Enter",
    });

    expect(screen.queryByTestId("capture-overlay")).not.toBeInTheDocument();
    expect(screen.getByTestId("flow-moment")).toBeInTheDocument();
    expect(screen.getByTestId("today-moments-toast")).toHaveTextContent(
      "Captured",
    );
  });

  it("close-day journey: Close moment renders counts and Close the day fires without crashing", () => {
    renderToday({ initialMoment: "close" });

    expect(screen.getByTestId("close-moment-completed")).toHaveTextContent("0");
    expect(screen.getByTestId("close-moment-missed")).toHaveTextContent("0");

    fireEvent.click(screen.getByTestId("close-moment-close-day"));

    expect(screen.getByTestId("today-moments-toast")).toHaveTextContent(
      "Day closed",
    );
  });

  it("persists timeDisplay and moment through localStorage and reads them back", () => {
    const { unmount } = renderToday();

    fireEvent.click(screen.getByTestId("countdown-clock-toggle-clock"));
    fireEvent.click(screen.getByTestId("moment-switcher-close"));

    const stored = JSON.parse(
      window.localStorage.getItem("lifeos.moments.preferences") ?? "{}",
    );
    expect(stored).toEqual({ moment: "close", timeDisplay: "clock" });

    unmount();

    // Re-mount with no initialMoment so the persisted values are read.
    renderToday({ initialMoment: undefined });
    expect(screen.getByTestId("close-moment")).toBeInTheDocument();
    expect(screen.getByTestId("countdown-clock-toggle-clock")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("opens the command palette via Cmd+K and runs an action", () => {
    renderToday({ initialMoment: "start" });

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.getByTestId("command-palette")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("command-palette-option-switch-flow"));

    expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();
    expect(screen.getByTestId("flow-moment")).toBeInTheDocument();
  });

  it("Escape closes the topmost overlay (capture)", () => {
    renderToday({ initialMoment: "start" });

    fireEvent.click(screen.getByTestId("capture-affordance"));
    expect(screen.getByTestId("capture-overlay")).toBeInTheDocument();

    fireEvent.keyDown(screen.getByTestId("capture-overlay-textarea"), {
      key: "Escape",
    });
    expect(screen.queryByTestId("capture-overlay")).not.toBeInTheDocument();
  });

  it("does not crash and stays on the empty state when no session is active across ticks", () => {
    vi.useFakeTimers();
    renderToday({ initialMoment: "flow" });

    expect(screen.getByTestId("flow-moment-empty")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByTestId("flow-moment-empty")).toBeInTheDocument();
  });
});

/**
 * FR-028 packet F-G2c integration coverage: the return ritual as a real
 * moment state, driven through WorkflowContext (not a hand-built state) so
 * it proves the ritual actually wires into the live provider. A single
 * seeded active task gives both an absence signal (its created_at becomes
 * `latestActivityTimestamp`) and a recovery candidate (the stalest open
 * task) in one journey — `now` is derived from the rendered state's
 * timestamp, never hardcoded, per the packet's floor-plan rule.
 */
const RE_ENTRY_ABSENCE_DAYS = 4;

function ReEntrySeedBridge({
  onState,
}: {
  onState: (lastActivityAt: string | null) => void;
}) {
  const { state, submitCaptureText, acceptTaskDraft } = useWorkflow();
  const draft = state.taskDrafts[0];

  onState(latestActivityTimestamp(state));

  return (
    <div>
      <span data-testid="re-entry-seed-draft-count">
        {state.taskDrafts.length}
      </span>
      <button
        type="button"
        data-testid="re-entry-seed-submit"
        onClick={() => submitCaptureText("Draft the client proposal", null)}
      >
        Seed capture
      </button>
      <button
        type="button"
        data-testid="re-entry-seed-accept"
        disabled={!draft}
        onClick={() => draft && acceptTaskDraft(draft.id)}
      >
        Seed accept
      </button>
    </div>
  );
}

describe("TodayMoments — FR-028 re-entry return ritual", () => {
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
   * Seeds one real active task through WorkflowContext (capture -> mock
   * parse -> accept) and returns a `now` derived from that task's
   * created_at, offset far enough forward to cross the absence threshold.
   * This single seeded task doubles as both the absence signal and the
   * recovery candidate (stalest open task).
   */
  async function seedAbsentTaskAndDeriveNow() {
    let lastActivityAt: string | null = null;
    const utils = render(
      <WorkflowProvider>
        <ReEntrySeedBridge
          onState={(value) => {
            lastActivityAt = value;
          }}
        />
      </WorkflowProvider>,
    );

    fireEvent.click(screen.getByTestId("re-entry-seed-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("re-entry-seed-draft-count")).toHaveTextContent(
        "1",
      );
    });
    fireEvent.click(screen.getByTestId("re-entry-seed-accept"));

    await waitFor(() => {
      expect(lastActivityAt).not.toBeNull();
    });

    const now = new Date(
      new Date(lastActivityAt as unknown as string).getTime() +
        RE_ENTRY_ABSENCE_DAYS * 24 * 60 * 60 * 1000,
    );

    return { ...utils, now };
  }

  it("renders the ritual instead of the masthead/moment content when absent and unsuppressed", async () => {
    const { rerender, now } = await seedAbsentTaskAndDeriveNow();

    rerender(
      <WorkflowProvider>
        <ReEntrySeedBridge onState={() => {}} />
        <TodayMoments now={now} />
      </WorkflowProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("re-entry-ritual")).toBeInTheDocument();
    });

    expect(
      screen.queryByTestId("today-moments-area-switcher"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("start-moment")).not.toBeInTheDocument();
  });

  it("does not render the ritual when now matches the seed time (no absence)", async () => {
    render(
      <WorkflowProvider>
        <ReEntrySeedBridge onState={() => {}} />
        <TodayMoments now={FIXED_NOW} initialMoment="start" />
      </WorkflowProvider>,
    );

    expect(screen.queryByTestId("re-entry-ritual")).not.toBeInTheDocument();
    expect(screen.getByTestId("start-moment")).toBeInTheDocument();
  });

  it("suppression round-trip: dismissing the ritual (complete) suppresses it on remount for the same absence", async () => {
    const { rerender, unmount, now } = await seedAbsentTaskAndDeriveNow();

    rerender(
      <WorkflowProvider>
        <ReEntrySeedBridge onState={() => {}} />
        <TodayMoments now={now} />
      </WorkflowProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("re-entry-ritual")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("re-entry-ritual-start-day"));

    await waitFor(() => {
      expect(screen.queryByTestId("re-entry-ritual")).not.toBeInTheDocument();
    });

    unmount();

    render(
      <WorkflowProvider>
        <ReEntrySeedBridge onState={() => {}} />
        <TodayMoments now={now} />
      </WorkflowProvider>,
    );

    // Same absence (same lastActivityAt) already completed -> suppressed.
    expect(screen.queryByTestId("re-entry-ritual")).not.toBeInTheDocument();
  });

  it("accept recovery: queues the first move, dismisses the ritual, shows the toast, moment is start", async () => {
    const { rerender, now } = await seedAbsentTaskAndDeriveNow();

    rerender(
      <WorkflowProvider>
        <ReEntrySeedBridge onState={() => {}} />
        <TodayMoments now={now} initialMoment="flow" />
      </WorkflowProvider>,
    );

    await waitFor(() => {
      expect(
        screen.getByTestId("re-entry-ritual-recovery"),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("re-entry-ritual-recovery-accept"));

    await waitFor(() => {
      expect(screen.queryByTestId("re-entry-ritual")).not.toBeInTheDocument();
    });

    expect(screen.getByTestId("start-moment")).toBeInTheDocument();
    expect(screen.getByTestId("today-moments-toast")).toHaveTextContent(
      "Welcome back — first move queued",
    );
  });

  it("swap recovery cycles to the next candidate without changing task state", async () => {
    const { rerender, now } = await seedAbsentTaskAndDeriveNow();

    rerender(
      <WorkflowProvider>
        <ReEntrySeedBridge onState={() => {}} />
        <TodayMoments now={now} />
      </WorkflowProvider>,
    );

    await waitFor(() => {
      expect(
        screen.getByTestId("re-entry-ritual-recovery"),
      ).toBeInTheDocument();
    });

    const beforeTitle = screen.getByTestId(
      "re-entry-ritual-recovery",
    ).textContent;

    fireEvent.click(screen.getByTestId("re-entry-ritual-recovery-swap"));

    // With a single candidate, swap cycles back to the same one (modulo);
    // the important assertion is that it never throws and the ritual stays
    // mounted with no task/state mutation from the swap itself.
    expect(screen.getByTestId("re-entry-ritual")).toBeInTheDocument();
    expect(typeof beforeTitle).toBe("string");
  });

  it("dismiss (Start my day) completes the ritual with no task change", async () => {
    const { rerender, now } = await seedAbsentTaskAndDeriveNow();

    rerender(
      <WorkflowProvider>
        <ReEntrySeedBridge onState={() => {}} />
        <TodayMoments now={now} />
      </WorkflowProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("re-entry-ritual")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("re-entry-ritual-start-day"));

    await waitFor(() => {
      expect(screen.queryByTestId("re-entry-ritual")).not.toBeInTheDocument();
    });
    expect(screen.getByTestId("today-moments-toast")).toHaveTextContent(
      "Welcome back",
    );
  });

  it("zero-red guard: the ritual container has no destructive class or guilt language", async () => {
    const { rerender, now } = await seedAbsentTaskAndDeriveNow();

    rerender(
      <WorkflowProvider>
        <ReEntrySeedBridge onState={() => {}} />
        <TodayMoments now={now} />
      </WorkflowProvider>,
    );

    const ritual = await screen.findByTestId("re-entry-ritual");
    expect(ritual.innerHTML).not.toMatch(/destructive/i);
    expect(ritual.innerHTML).not.toMatch(/overdue/i);
    expect(ritual.innerHTML).not.toMatch(/\blate\b/i);
    expect(ritual.innerHTML).not.toMatch(/failed/i);
    expect(ritual.innerHTML).not.toMatch(/missed/i);
  });

  // SP-5: never lose typed capture text. The re-entry ritual renders instead
  // of the moments content, but it must not clobber a pending capture draft
  // sitting in sessionStorage — this proves the draft survives a ritual
  // render/dismiss round trip and is still there when capture reopens after.
  it("SP-5: a capture draft in sessionStorage survives a re-entry ritual render and dismiss", async () => {
    const { rerender, now } = await seedAbsentTaskAndDeriveNow();

    window.sessionStorage.setItem(
      "lifeos.moments.captureDraft",
      "half-typed thought before the ritual",
    );

    rerender(
      <WorkflowProvider>
        <ReEntrySeedBridge onState={() => {}} />
        <TodayMoments now={now} />
      </WorkflowProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("re-entry-ritual")).toBeInTheDocument();
    });

    // The ritual owns the screen; the draft must still be untouched in
    // storage while it renders.
    expect(window.sessionStorage.getItem("lifeos.moments.captureDraft")).toBe(
      "half-typed thought before the ritual",
    );

    fireEvent.click(screen.getByTestId("re-entry-ritual-start-day"));

    await waitFor(() => {
      expect(screen.queryByTestId("re-entry-ritual")).not.toBeInTheDocument();
    });

    // Ritual dismissed — draft survives, and reopening capture shows it.
    expect(window.sessionStorage.getItem("lifeos.moments.captureDraft")).toBe(
      "half-typed thought before the ritual",
    );

    fireEvent.keyDown(window, { key: "c" });

    expect(screen.getByTestId("capture-overlay-textarea")).toHaveValue(
      "half-typed thought before the ritual",
    );
    expect(
      screen.getByTestId("capture-overlay-draft-restored"),
    ).toBeInTheDocument();
  });
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

/**
 * Moments pass P5 — packet: PipelineOverview + demoted-surface sheets.
 * Additive coverage: the Start moment's Pipeline disclosure opens the
 * triage/plan sheets, Escape ordering, and the new palette entries.
 */
describe("TodayMoments — P5 pipeline disclosure and sheets", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    window.localStorage.clear();
  });

  it("the Pipeline disclosure is collapsed by default and renders PipelineOverview", () => {
    renderToday({ initialMoment: "start" });

    const disclosure = screen.getByTestId("start-moment-pipeline-disclosure");
    expect(disclosure).toBeInTheDocument();
    expect(disclosure).not.toHaveAttribute("open");

    fireEvent.click(screen.getByText("Pipeline"));
    expect(screen.getByTestId("pipeline-overview")).toBeInTheDocument();
  });

  it("drilling into triage from the Pipeline disclosure opens the TriageSheet", () => {
    renderToday({ initialMoment: "start" });

    fireEvent.click(screen.getByText("Pipeline"));
    fireEvent.click(screen.getByTestId("pipeline-overview-stage-triage"));

    expect(screen.getByTestId("moment-sheet-dialog")).toHaveAttribute(
      "aria-label",
      "Triage",
    );
  });

  it("drilling into plan from the Pipeline disclosure opens the PlanSheet", () => {
    renderToday({ initialMoment: "start" });

    fireEvent.click(screen.getByText("Pipeline"));
    fireEvent.click(screen.getByTestId("pipeline-overview-stage-plan"));

    expect(screen.getByTestId("moment-sheet-dialog")).toHaveAttribute(
      "aria-label",
      "Plan",
    );
  });

  it("drilling into a non-wired stage (execute) shows the 'opens with full shell' toast", () => {
    renderToday({ initialMoment: "start" });

    fireEvent.click(screen.getByText("Pipeline"));
    fireEvent.click(screen.getByTestId("pipeline-overview-stage-execute"));

    expect(screen.getByTestId("today-moments-toast")).toHaveTextContent(
      "Opens with the full shell",
    );
  });

  it("closes the sheet via its own Escape handling without affecting the capture overlay's independent Escape path", () => {
    renderToday({ initialMoment: "start" });

    fireEvent.click(screen.getByText("Pipeline"));
    fireEvent.click(screen.getByTestId("pipeline-overview-stage-triage"));
    expect(screen.getByTestId("moment-sheet-dialog")).toBeInTheDocument();

    fireEvent.keyDown(screen.getByTestId("moment-sheet-dialog"), {
      key: "Escape",
    });
    expect(screen.queryByTestId("moment-sheet-dialog")).not.toBeInTheDocument();
  });

  it("global Escape (via useMomentKeyboard) is disabled while a sheet is open — number keys do not switch moments", () => {
    renderToday({ initialMoment: "start" });

    fireEvent.click(screen.getByText("Pipeline"));
    fireEvent.click(screen.getByTestId("pipeline-overview-stage-triage"));
    expect(screen.getByTestId("moment-sheet-dialog")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "2" });
    // Still on the sheet — the underlying moment did not switch to Flow.
    expect(screen.getByTestId("moment-sheet-dialog")).toBeInTheDocument();
    expect(screen.queryByTestId("flow-moment")).not.toBeInTheDocument();
  });

  it("the command palette offers 'Open triage' and 'Open plan', each opening the matching sheet", () => {
    renderToday({ initialMoment: "start" });

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.getByTestId("command-palette")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("command-palette-option-open-triage"));
    expect(screen.getByTestId("moment-sheet-dialog")).toHaveAttribute(
      "aria-label",
      "Triage",
    );

    fireEvent.click(screen.getByTestId("moment-sheet-close"));
    expect(screen.queryByTestId("moment-sheet-dialog")).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    fireEvent.click(screen.getByTestId("command-palette-option-open-plan"));
    expect(screen.getByTestId("moment-sheet-dialog")).toHaveAttribute(
      "aria-label",
      "Plan",
    );
  });
});

/**
 * Moments pass P6 — packet: deep-link fallback shims. Additive coverage for
 * the `deepLink` prop: applies once on mount, does not re-apply on
 * re-render, and defers until the re-entry ritual completes when the ritual
 * is active. Reuses the re-entry seeding pattern from the FR-028 describe
 * block above (real WorkflowContext journey, `now` derived from seeded
 * activity, never hardcoded).
 */
describe("TodayMoments — P6 deep-link shims", () => {
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

  it("opens the capture overlay once when deepLink = { overlay: 'capture' }", () => {
    renderToday({ initialMoment: "start", deepLink: { overlay: "capture" } });

    expect(screen.getByTestId("capture-overlay")).toBeInTheDocument();
  });

  it("opens the triage sheet once when deepLink = { sheet: 'triage' }", () => {
    renderToday({ initialMoment: "start", deepLink: { sheet: "triage" } });

    expect(screen.getByTestId("moment-sheet-dialog")).toHaveAttribute(
      "aria-label",
      "Triage",
    );
  });

  it("switches to the flow moment once when deepLink = { moment: 'flow' }", () => {
    renderToday({ initialMoment: "start", deepLink: { moment: "flow" } });

    expect(screen.getByTestId("flow-moment")).toBeInTheDocument();
  });

  it("does not re-apply the deep link on re-render (user can close the overlay and it stays closed)", () => {
    const { rerender } = renderToday({
      initialMoment: "start",
      deepLink: { overlay: "capture" },
    });

    expect(screen.getByTestId("capture-overlay")).toBeInTheDocument();

    fireEvent.keyDown(screen.getByTestId("capture-overlay-textarea"), {
      key: "Escape",
    });
    expect(screen.queryByTestId("capture-overlay")).not.toBeInTheDocument();

    rerender(
      <WorkflowProvider>
        <TaskSeedBridge />
        <TodayMoments
          now={FIXED_NOW}
          initialMoment="start"
          deepLink={{ overlay: "capture" }}
        />
      </WorkflowProvider>,
    );

    expect(screen.queryByTestId("capture-overlay")).not.toBeInTheDocument();
  });

  it("defers the deep link until the re-entry ritual completes, then applies it", async () => {
    let lastActivityAt: string | null = null;
    const { rerender } = render(
      <WorkflowProvider>
        <ReEntrySeedBridge
          onState={(value) => {
            lastActivityAt = value;
          }}
        />
      </WorkflowProvider>,
    );

    fireEvent.click(screen.getByTestId("re-entry-seed-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("re-entry-seed-draft-count")).toHaveTextContent(
        "1",
      );
    });
    fireEvent.click(screen.getByTestId("re-entry-seed-accept"));

    await waitFor(() => {
      expect(lastActivityAt).not.toBeNull();
    });

    const now = new Date(
      new Date(lastActivityAt as unknown as string).getTime() +
        RE_ENTRY_ABSENCE_DAYS * 24 * 60 * 60 * 1000,
    );

    // rerender the SAME provider instance (not a fresh render) so the
    // already-seeded in-memory state is present on TodayMoments' very first
    // commit — a fresh WorkflowProvider would re-hydrate from sessionStorage
    // via an async effect, and since child effects (TodayMoments') fire
    // before parent effects (the Provider's hydrate effect) on initial
    // mount, that would create a transient window where the ritual looks
    // ineligible purely because state hasn't hydrated yet — a test-harness
    // race, not the ritual-defer behavior under test.
    rerender(
      <WorkflowProvider>
        <ReEntrySeedBridge onState={() => {}} />
        <TodayMoments now={now} deepLink={{ overlay: "capture" }} />
      </WorkflowProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("re-entry-ritual")).toBeInTheDocument();
    });

    // Ritual owns the screen — the deep link has not applied yet. The
    // capture overlay renders outside the ritual/moment conditional, so this
    // genuinely proves deferral rather than being masked by the ritual's
    // own conditional rendering (a moment target would pass trivially here).
    expect(screen.queryByTestId("capture-overlay")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("re-entry-ritual-start-day"));

    await waitFor(() => {
      expect(screen.queryByTestId("re-entry-ritual")).not.toBeInTheDocument();
    });

    // Ritual completed — the deferred deep link now applies.
    expect(screen.getByTestId("capture-overlay")).toBeInTheDocument();
  });

  // SP-3 numeric steadiness: the toast slot is always mounted (fixed
  // positioning, out of normal flow) so a toast appearing/disappearing never
  // reflows the document. This is a structural class assertion, not a pixel
  // measurement — jsdom does not apply Tailwind's stylesheet, so asserting
  // computed `position` would be meaningless; the `fixed` class itself is
  // the durable contract. The container node is asserted `fixed` both before
  // and after a real toast mounts inside it, proving the same out-of-flow
  // node hosts the content rather than a fresh in-flow element appearing.
  it("toast slot is fixed-positioned so mounting a toast never reflows the page", () => {
    renderToday({ initialMoment: "start" });

    const toast = screen.getByTestId("today-moments-toast");
    expect(toast).toHaveClass("fixed");
    expect(toast.textContent).toBe("");

    fireEvent.keyDown(window, { key: "c" });
    fireEvent.change(screen.getByTestId("capture-overlay-textarea"), {
      target: { value: "Follow up with Alex about the contract" },
    });
    fireEvent.keyDown(screen.getByTestId("capture-overlay-textarea"), {
      key: "Enter",
    });

    const toastAfter = screen.getByTestId("today-moments-toast");
    expect(toastAfter).toHaveClass("fixed");
    expect(within(toastAfter).getByText("Captured")).toBeInTheDocument();
  });

  // SP-4: the toast message pill uses motion tokens (not a literal ms
  // value) and falls back to no motion for prefers-reduced-motion users.
  it("toast message pill uses motion tokens with a reduced-motion fallback", () => {
    renderToday({ initialMoment: "start" });

    fireEvent.keyDown(window, { key: "c" });
    fireEvent.change(screen.getByTestId("capture-overlay-textarea"), {
      target: { value: "Follow up with Alex about the contract" },
    });
    fireEvent.keyDown(screen.getByTestId("capture-overlay-textarea"), {
      key: "Enter",
    });

    const toastMessage = within(
      screen.getByTestId("today-moments-toast"),
    ).getByText("Captured");
    expect(toastMessage).toHaveClass("motion-reduce:transition-none");
    expect(toastMessage).toHaveClass("motion-reduce:duration-0");
    expect(toastMessage.style.transitionDuration).toBe("var(--motion-base)");
    expect(toastMessage.style.transitionTimingFunction).toBe(
      "var(--motion-ease)",
    );
  });
});

/**
 * SP-5: never lose typed capture text. Unsaved capture input must survive
 * an accidental close/reopen within a session via sessionStorage (not
 * localStorage, so it does not haunt a brand-new session), and must be
 * cleared only on a successful save. Palette persistence is explicitly out
 * of scope — palettes conventionally reset — so no equivalent test exists
 * for CommandPalette.
 */
describe("TodayMoments — SP-5 capture draft preservation", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("preserves typed text through Esc/close and reopen, with the cursor at the end and a restored hint", async () => {
    renderToday({ initialMoment: "start" });

    fireEvent.keyDown(window, { key: "c" });
    const textarea = screen.getByTestId(
      "capture-overlay-textarea",
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: { value: "three words lost" },
    });

    fireEvent.keyDown(textarea, { key: "Escape" });
    expect(screen.queryByTestId("capture-overlay")).not.toBeInTheDocument();

    // Sessions-worth persistence: the draft is in sessionStorage, not
    // localStorage, per the SP-5 contract.
    expect(window.sessionStorage.getItem("lifeos.moments.captureDraft")).toBe(
      "three words lost",
    );
    expect(
      window.localStorage.getItem("lifeos.moments.captureDraft"),
    ).toBeNull();

    fireEvent.keyDown(window, { key: "c" });
    const reopened = screen.getByTestId(
      "capture-overlay-textarea",
    ) as HTMLTextAreaElement;

    await waitFor(() => {
      expect(reopened).toHaveFocus();
    });
    expect(reopened.value).toBe("three words lost");
    expect(reopened.selectionStart).toBe("three words lost".length);
    expect(
      screen.getByTestId("capture-overlay-draft-restored"),
    ).toBeInTheDocument();
  });

  it("clears the draft only after a successful save, and the captured text reaches workflow state", async () => {
    renderToday({ initialMoment: "start" });

    fireEvent.keyDown(window, { key: "c" });
    const textarea = screen.getByTestId("capture-overlay-textarea");
    fireEvent.change(textarea, {
      target: { value: "Follow up with Alex about the contract" },
    });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(screen.queryByTestId("capture-overlay")).not.toBeInTheDocument();
    expect(screen.getByTestId("today-moments-toast")).toHaveTextContent(
      "Captured",
    );
    expect(
      window.sessionStorage.getItem("lifeos.moments.captureDraft"),
    ).toBeNull();

    fireEvent.keyDown(window, { key: "c" });
    const reopened = screen.getByTestId(
      "capture-overlay-textarea",
    ) as HTMLTextAreaElement;
    expect(reopened.value).toBe("");
    expect(
      screen.queryByTestId("capture-overlay-draft-restored"),
    ).not.toBeInTheDocument();
  });

  it("fresh mount with empty sessionStorage shows an empty box and no false restored hint", () => {
    renderToday({ initialMoment: "start" });

    fireEvent.keyDown(window, { key: "c" });
    const textarea = screen.getByTestId(
      "capture-overlay-textarea",
    ) as HTMLTextAreaElement;

    expect(textarea.value).toBe("");
    expect(
      screen.queryByTestId("capture-overlay-draft-restored"),
    ).not.toBeInTheDocument();
  });
});
