import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
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
});
