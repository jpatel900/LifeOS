// #737-A slice 2: closing the day journals the review to IndexedDB before any
// account write. jsdom has no IndexedDB, so without this polyfill the close-day
// path would take the "the device refused to hold it" branch.
import "fake-indexeddb/auto";

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

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

import { latestActivityTimestamp } from "@/lib/reEntry/detect";

import { SAVED_ON_THIS_DEVICE_SHORT } from "@/lib/statusVocabulary";

import { stubParseCaptureFetch } from "@/__tests__/helpers/parseCaptureFetch";

import { TodayMoments } from "./TodayMoments";

import {
  RE_ENTRY_ABSENCE_DAYS,
  renderToday,
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
 * SP-6: undo over confirm. Extends the toast slot to
 * `{ message, action?: { label, run() } }` — an Undo button renders only
 * when an action is supplied, lasts longer (6s vs 2.5s), and is a real,
 * focusable button (never auto-focused). Wired ONLY where a genuinely
 * reversing existing context action exists:
 *
 *  - Ritual recovery-accept: `promoteBacklogTask` (backlog -> active) is
 *    reversed by the existing `deferTask` action (-> backlog), which is a
 *    clean round-trip because a backlog task has no scheduled/running
 *    blocks for `deferTask`'s `cancelOpenBlocksForTask` to touch.
 *  - CloseMoment carry-forward and Capture "Captured" have no clean
 *    existing reverse (see PR body) and are intentionally NOT wired here —
 *    no test exists for them because there is nothing to undo.
 */
function BacklogRecoverySeedBridge({
  onState,
}: {
  onState: (info: {
    lastActivityAt: string | null;
    taskId: string | null;
    taskStatus: string | null;
  }) => void;
}) {
  const { state, submitCaptureText, backlogTaskDraft } = useWorkflow();
  useAutoSortSeededCaptures();
  const draft = state.taskDrafts[0];
  const task = state.tasks[0];

  onState({
    lastActivityAt: latestActivityTimestamp(state),
    taskId: task?.id ?? null,
    taskStatus: task?.status ?? null,
  });

  return (
    <div>
      <span data-testid="backlog-seed-draft-count">
        {state.taskDrafts.length}
      </span>
      <span data-testid="backlog-seed-task-status">{task?.status ?? ""}</span>
      <button
        type="button"
        data-testid="backlog-seed-submit"
        onClick={() => submitCaptureText("Draft the client proposal", null)}
      >
        Seed capture
      </button>
      <button
        type="button"
        data-testid="backlog-seed-backlog"
        disabled={!draft}
        onClick={() => draft && backlogTaskDraft(draft.id)}
      >
        Seed backlog
      </button>
    </div>
  );
}

describe("TodayMoments — SP-6 undo over confirm", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("string-only showToast still works and auto-dismisses (back-compat)", async () => {
    // Narrowed `toFake` since #737-A slice 2: closing the day journals the
    // review to IndexedDB first, and `fake-indexeddb` drives its request
    // callbacks with `setImmediate`. Vitest fakes that by default, which would
    // freeze the journal write and the toast would never appear. Faking only
    // the timers the toast dismissal actually uses keeps this test's subject
    // (auto-dismiss after 2500ms) fully controlled while leaving IndexedDB
    // running for real.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    renderToday({ initialMoment: "close" });

    fireEvent.click(screen.getByTestId("close-moment-close-day"));

    // #588: the toast now appears only once the save result resolves
    // (local-only in mock mode) — wait for the journal write and the result.
    // `waitFor` polls on `setTimeout`, which is faked here, so it would hang.
    // The journal write resolves on real `setImmediate` instead — drain that
    // queue until the result lands.
    for (let attempt = 0; attempt < 50; attempt += 1) {
      await act(async () => {
        await new Promise((resolve) => setImmediate(resolve));
      });
      if (screen.getByTestId("today-moments-toast").textContent) break;
    }
    expect(screen.getByTestId("today-moments-toast")).toHaveTextContent(
      `Day closed — ${SAVED_ON_THIS_DEVICE_SHORT}`,
    );
    expect(
      screen.queryByTestId("today-moments-toast-undo"),
    ).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2500);
    });

    expect(screen.getByTestId("today-moments-toast").textContent).toBe("");
  });

  /**
   * Seeds one real backlog task through WorkflowContext (capture -> mock
   * parse -> backlog) and returns a `now` derived from that task's
   * created_at, offset far enough forward to cross the absence threshold —
   * same recipe as `seedAbsentTaskAndDeriveNow` above, but landing the task
   * in `backlog` (via `backlogTaskDraft`) instead of `active`, so accepting
   * recovery genuinely exercises `promoteBacklogTask`.
   */
  async function seedBacklogTaskAndDeriveNow() {
    const restoreFetch = stubParseCaptureFetch();
    let seeded: {
      lastActivityAt: string | null;
      taskId: string | null;
      taskStatus: string | null;
    } = { lastActivityAt: null, taskId: null, taskStatus: null };

    const utils = render(
      <WorkflowProvider>
        <BacklogRecoverySeedBridge
          onState={(value) => {
            seeded = value;
          }}
        />
      </WorkflowProvider>,
    );

    fireEvent.click(screen.getByTestId("backlog-seed-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("backlog-seed-draft-count")).toHaveTextContent(
        "1",
      );
    });
    fireEvent.click(screen.getByTestId("backlog-seed-backlog"));

    await waitFor(() => {
      expect(seeded.taskStatus).toBe("backlog");
    });

    restoreFetch();

    const now = new Date(
      new Date(seeded.lastActivityAt as unknown as string).getTime() +
        RE_ENTRY_ABSENCE_DAYS * 24 * 60 * 60 * 1000,
    );

    return { ...utils, now, taskId: seeded.taskId as string };
  }

  it("accept recovery from backlog: toast renders an Undo button, clicking it reverses promoteBacklogTask and restores the prior visible state", async () => {
    const { rerender, now } = await seedBacklogTaskAndDeriveNow();

    rerender(
      <WorkflowProvider>
        <BacklogRecoverySeedBridge onState={() => {}} />
        <TodayMoments now={now} initialMoment="flow" />
      </WorkflowProvider>,
    );

    await waitFor(() => {
      expect(
        screen.getByTestId("re-entry-ritual-recovery"),
      ).toBeInTheDocument();
    });

    // Prior visible state, before recovery is accepted: the seeded task is
    // still in backlog.
    expect(screen.getByTestId("backlog-seed-task-status")).toHaveTextContent(
      "backlog",
    );

    fireEvent.click(screen.getByTestId("re-entry-ritual-recovery-accept"));

    await waitFor(() => {
      expect(screen.queryByTestId("re-entry-ritual")).not.toBeInTheDocument();
    });

    // Recovery-accept promoted the task off backlog (via promoteBacklogTask)
    // and moved to Start with the toast queued.
    expect(screen.getByTestId("start-moment")).toBeInTheDocument();
    expect(screen.getByTestId("backlog-seed-task-status")).toHaveTextContent(
      "active",
    );
    expect(screen.getByTestId("today-moments-toast")).toHaveTextContent(
      "Welcome back — first move queued",
    );

    const undoButton = screen.getByTestId("today-moments-toast-undo");
    expect(undoButton.tagName).toBe("BUTTON");
    // Real focusable button, but never auto-focused on toast mount.
    expect(undoButton).not.toHaveFocus();

    fireEvent.click(undoButton);

    // The toast clears immediately on Undo, and the prior visible state
    // (the task back in backlog) is restored through the real
    // WorkflowProvider — not a mocked reverse.
    expect(screen.getByTestId("today-moments-toast").textContent).toBe("");
    expect(screen.getByTestId("backlog-seed-task-status")).toHaveTextContent(
      "backlog",
    );
  });

  it("toast with an action lasts longer (6s) than a plain toast (2.5s)", async () => {
    const { rerender, now } = await seedBacklogTaskAndDeriveNow();
    vi.useFakeTimers();

    rerender(
      <WorkflowProvider>
        <BacklogRecoverySeedBridge onState={() => {}} />
        <TodayMoments now={now} initialMoment="flow" />
      </WorkflowProvider>,
    );

    await vi.waitFor(() => {
      expect(
        screen.getByTestId("re-entry-ritual-recovery"),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("re-entry-ritual-recovery-accept"));

    await vi.waitFor(() => {
      expect(screen.queryByTestId("re-entry-ritual")).not.toBeInTheDocument();
    });

    expect(screen.getByTestId("today-moments-toast-undo")).toBeInTheDocument();

    // A plain toast would have auto-dismissed by 2.5s; this one (carrying
    // an action) must still be visible.
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(screen.getByTestId("today-moments-toast-undo")).toBeInTheDocument();

    // By 6s it auto-dismisses too.
    act(() => {
      vi.advanceTimersByTime(3500);
    });
    expect(screen.getByTestId("today-moments-toast").textContent).toBe("");
  });
});
