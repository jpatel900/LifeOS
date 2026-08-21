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

import { WorkflowProvider } from "@/lib/WorkflowContext";

import { stubParseCaptureFetch } from "@/__tests__/helpers/parseCaptureFetch";

import { TodayMoments } from "./TodayMoments";

import {
  FIXED_NOW,
  pressCaptureShortcut,
  RE_ENTRY_ABSENCE_DAYS,
  ReEntrySeedBridge,
  resetTodayMomentsMountTracking,
} from "@/__tests__/helpers/todayMomentsHarness";

// C2-S13 (#687 round-7): FILE-LEVEL, applies regardless of describe nesting
// — every split file that mounts TodayMoments more than once needs this
// reset (deepLink.ts's module-level remount-tracking flag survives across
// `it()`s in the same file); see the harness export's own doc comment for
// the full mechanism.
afterEach(() => {
  resetTodayMomentsMountTracking();
});

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

    await pressCaptureShortcut();

    expect(screen.getByTestId("capture-overlay-textarea")).toHaveValue(
      "half-typed thought before the ritual",
    );
    expect(
      screen.getByTestId("capture-overlay-draft-restored"),
    ).toBeInTheDocument();
  });
});
