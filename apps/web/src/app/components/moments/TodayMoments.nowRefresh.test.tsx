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

import { WorkflowProvider } from "@/lib/WorkflowContext";

import { stubParseCaptureFetch } from "@/__tests__/helpers/parseCaptureFetch";

import * as momentsViewModel from "./momentsViewModel";

import { TodayMoments } from "./TodayMoments";

import {
  FIXED_NOW,
  ReEntrySeedBridge,
  resetTodayMomentsMountTracking,
  TaskSeedBridge,
} from "@/__tests__/helpers/todayMomentsHarness";
import { clearPendingWrites } from "@/lib/durability/pendingWriteJournal";
import { clearStoredTaskDrafts } from "@/lib/durability/draftStore";

// C2-S13 (#687 round-7): FILE-LEVEL, applies regardless of describe nesting
// — every split file that mounts TodayMoments more than once needs this
// reset (deepLink.ts's module-level remount-tracking flag survives across
// `it()`s in the same file); see the harness export's own doc comment for
// the full mechanism.
afterEach(() => {
  resetTodayMomentsMountTracking();
});

/**
 * SP-10: a `now` frozen at mount goes stale in a long-lived tab — relative
 * labels ("in Xm", aging waiting-on days) and the mount-time-of-day moment
 * heuristic quietly drift from reality. TodayMoments now self-refreshes
 * `now` on a slow ~60s cadence, aligned to the minute boundary, but ONLY
 * when no `now` prop is injected — every other describe block above renders
 * with an explicit `now`/`FIXED_NOW`, so this is the only place the default
 * (production) clock path is exercised.
 *
 * These tests spy on the momentsViewModel builders (rather than seeding a
 * controllable today-calendar-block through real capture/parse/accept
 * flows, which has no test seam that pins start/end times to "now + a few
 * minutes" without touching momentsViewModel.ts/WorkflowContext.tsx) to
 * observe the actual `now` value TodayMoments passes down each render. This
 * directly proves the packet's core claim — "the updated `now` flows into
 * the VM builders" — without the fragility of deriving an aging label from
 * deep domain seeding.
 */
describe("TodayMoments — SP-10 live timestamp refresh", () => {
  beforeEach(async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    window.localStorage.clear();
    window.sessionStorage.clear();
    // #861: `fake-indexeddb/auto` backs ONE module-global store shared by every
    // `it` in this file, and the journeys below drive real WorkflowContext
    // actions that journal device-durable writes. Left uncleared, an earlier
    // test's write is read back by the next test's `WorkflowProvider` mount
    // effect (`refreshJournalledDurableState`, fired un-awaited on mount), so a
    // later test can see durable state it never created. Same clear
    // `durableWinsReviewsGuard.test.tsx` has always done.
    await clearPendingWrites();
    // #914: `TaskSeedBridge`/`ReEntrySeedBridge` seed a real `taskDrafts`
    // entry, mirrored to a SECOND, separate IndexedDB store
    // (`lifeos-triage-drafts`, `lib/durability/draftStore.ts`) that
    // `clearPendingWrites()` above does not touch — see
    // `TodayMoments.journeys.test.tsx`'s own comment for the full mechanism
    // and the shuffled-order repro that found it there. Hardening here: no
    // observed leak in this file's own assertions, but the same seed path.
    await clearStoredTaskDrafts();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
    window.localStorage.clear();
    window.sessionStorage.clear();
    await clearPendingWrites();
    await clearStoredTaskDrafts();
  });

  it("without a now prop, buildStartVM/buildFlowVM/buildCloseVM are re-invoked with a later `now` after 61s of fake time (relative/aging labels stay true)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-05T15:00:00.000Z"));

    const startSpy = vi.spyOn(momentsViewModel, "buildStartVM");
    const flowSpy = vi.spyOn(momentsViewModel, "buildFlowVM");
    const closeSpy = vi.spyOn(momentsViewModel, "buildCloseVM");

    render(
      <WorkflowProvider>
        <TodayMoments initialMoment="start" />
      </WorkflowProvider>,
    );

    const firstNow = startSpy.mock.calls[0][1].now;

    act(() => {
      vi.setSystemTime(new Date("2026-07-05T15:01:01.000Z"));
      vi.advanceTimersByTime(61_000);
    });

    const lastStartNow =
      startSpy.mock.calls[startSpy.mock.calls.length - 1][1].now;
    const lastFlowNow =
      flowSpy.mock.calls[flowSpy.mock.calls.length - 1][1].now;
    const lastCloseNow =
      closeSpy.mock.calls[closeSpy.mock.calls.length - 1][1].now;

    expect(lastStartNow.getTime()).toBeGreaterThan(firstNow.getTime());
    expect(lastFlowNow.getTime()).toBeGreaterThan(firstNow.getTime());
    expect(lastCloseNow.getTime()).toBeGreaterThan(firstNow.getTime());
  });

  it("with a fixed now prop, the VM builders are never re-invoked with a different `now` even after 61s of fake time (deterministic tests stay deterministic)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-05T15:00:00.000Z"));

    const startSpy = vi.spyOn(momentsViewModel, "buildStartVM");

    render(
      <WorkflowProvider>
        <TodayMoments now={FIXED_NOW} initialMoment="start" />
      </WorkflowProvider>,
    );

    const callsBefore = startSpy.mock.calls.length;
    const nowBefore = startSpy.mock.calls[0][1].now;
    expect(nowBefore).toBe(FIXED_NOW);

    act(() => {
      vi.setSystemTime(new Date("2026-07-05T16:30:00.000Z"));
      vi.advanceTimersByTime(90 * 60_000);
    });

    // No new renders driven by a self-refresh timer: every call (if any,
    // e.g. from an unrelated effect) still carries the exact injected prop.
    for (const call of startSpy.mock.calls) {
      expect(call[1].now).toBe(FIXED_NOW);
    }
    // And no timer fired at all beyond whatever ran during mount.
    expect(startSpy.mock.calls.length).toBe(callsBefore);
  });

  it("does not auto-switch the displayed moment after 2h of fake time passes (heuristic runs at mount only)", () => {
    vi.useFakeTimers();
    // 15:00 local heuristic input is hour-of-day on the *host* clock via
    // Date#getHours; pin a system time whose local hour reliably lands in
    // the "flow" window's neighboring "start" bucket is unnecessary — we
    // only need mount-vs-post-tick stability, not a specific bucket. Assert
    // whatever moment is showing right after mount stays showing after the
    // clock ticks across a heuristic-relevant boundary.
    vi.setSystemTime(new Date("2026-07-05T09:00:00.000Z"));

    render(
      <WorkflowProvider>
        <TodayMoments />
      </WorkflowProvider>,
    );

    const momentTestIdBefore = [
      "start-moment",
      "flow-moment",
      "close-moment",
    ].find((testId) => screen.queryByTestId(testId) !== null);
    expect(momentTestIdBefore).toBeDefined();

    act(() => {
      // Cross from before 11:00 to after 17:00 — the heuristic's widest
      // possible swing (start -> close) — over many 61s ticks.
      vi.setSystemTime(new Date("2026-07-05T19:00:00.000Z"));
      vi.advanceTimersByTime(2 * 60 * 60_000 + 60_000);
    });

    const momentTestIdAfter = [
      "start-moment",
      "flow-moment",
      "close-moment",
    ].find((testId) => screen.queryByTestId(testId) !== null);
    expect(momentTestIdAfter).toBe(momentTestIdBefore);
  });

  it("a per-second countdown surface (the Flow moment's active-session timer) is unaffected by the 60s now-refresh cadence", async () => {
    // Fake timers for the whole test (so the countdown's own setInterval and
    // the new 60s now-refresh timeout share one controllable clock), driving
    // the async parse-capture fetch resolution via vi.waitFor (timer-system
    // aware) rather than mixing in real-timer waitFor.
    vi.useFakeTimers();
    const restoreFetch = stubParseCaptureFetch();

    render(
      <WorkflowProvider>
        <TaskSeedBridge />
        <TodayMoments initialMoment="start" />
      </WorkflowProvider>,
    );

    fireEvent.click(screen.getByTestId("seed-submit"));
    await vi.waitFor(() => {
      expect(screen.getByTestId("seed-draft-count")).toHaveTextContent("1");
    });
    fireEvent.click(screen.getByTestId("seed-accept"));

    await vi.waitFor(() => {
      expect(screen.getByTestId("first-move-card")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("first-move-start"));

    expect(screen.getByTestId("flow-moment")).toBeInTheDocument();
    expect(screen.getByTestId("current-block-hero")).toBeInTheDocument();

    restoreFetch();

    // Isolate the tick cadence: advance 61s. The per-second countdown
    // (session.remaining, driven by TodayMoments' own
    // setInterval(...,1000) — see CurrentBlockHero/ScheduleBlock, which read
    // `session.remaining`/`Date.now()` directly, never the `now` prop) must
    // move by exactly 61 seconds of its own per-second ticking — not by a
    // single 60s jump (which would indicate it had been coupled to the new
    // now-refresh effect instead of its own interval) and not stay frozen.
    const before = screen.getByTestId("current-block-hero-time").textContent;
    expect(before).toBe("25:00");

    act(() => {
      vi.advanceTimersByTime(61_000);
    });

    const after = screen.getByTestId("current-block-hero-time").textContent;
    expect(after).toBe("23:59");
  });

  it("the re-entry ritual stays latched and stable (same summary/plan) while `now` ticks every 60s under it, with no now prop injected", async () => {
    // Real timers for the seed/fetch journey (mirrors
    // seedAbsentTaskAndDeriveNow above) — fake timers only arm once we're
    // ready to mount the no-now-prop TodayMoments and observe the ritual
    // across ticks.
    const restoreFetch = stubParseCaptureFetch();

    let lastActivityAt: string | null = null;
    render(
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

    restoreFetch();

    // Jump the system clock 4 days forward (past the 3-day absence
    // threshold) BEFORE mounting the no-now-prop TodayMoments, so the
    // ritual latches at mount against a stale-but-real "now".
    vi.useFakeTimers();
    vi.setSystemTime(
      new Date(
        new Date(lastActivityAt as unknown as string).getTime() +
          4 * 24 * 60 * 60 * 1000,
      ),
    );

    render(
      <WorkflowProvider>
        <ReEntrySeedBridge onState={() => {}} />
        <TodayMoments />
      </WorkflowProvider>,
    );

    await vi.waitFor(() => {
      expect(screen.getByTestId("re-entry-ritual")).toBeInTheDocument();
    });

    const summaryBefore = screen.getByTestId("re-entry-ritual").textContent;

    act(() => {
      vi.advanceTimersByTime(3 * 61_000);
    });

    // Still latched, still showing the ritual (not re-evaluated back to
    // "not absent", not swapped for a different summary/plan).
    expect(screen.getByTestId("re-entry-ritual")).toBeInTheDocument();
    expect(screen.getByTestId("re-entry-ritual").textContent).toBe(
      summaryBefore,
    );
    expect(
      screen.queryByTestId("today-moments-area-switcher"),
    ).not.toBeInTheDocument();
  });
});
