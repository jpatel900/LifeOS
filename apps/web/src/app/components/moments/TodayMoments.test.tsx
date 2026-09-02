// #737-A slice 2: closing the day journals the review to IndexedDB before any
// account write. jsdom has no IndexedDB, so without this polyfill the close-day
// path would take the "the device refused to hold it" branch.
import "fake-indexeddb/auto";

import { act, fireEvent, screen } from "@testing-library/react";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// C3 (onboarding own-URL): `replace` is hoisted out so the new hand-off
// test below can assert on it directly — every other test in this file
// stays on the pre-existing `push`-only shape (never called by
// TodayMoments.tsx itself, only by children it mounts).
const routerMock = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
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

import {
  renderToday,
  resetTodayMomentsMountTracking,
} from "@/__tests__/helpers/todayMomentsHarness";
import { writeOnboardingOutcomeToast } from "@/lib/onboarding/onboarding";

// C2-S13 (#687): FILE-LEVEL, applies to every `describe` below regardless of
// nesting. `resetTodayMomentsMountTracking` (harness) resets both
// `window.history` and deepLink.ts's module-level remount-tracking flag —
// Vitest keeps ONE module instance loaded for every `it()` in a file, so
// without this the flag would read `true` (a "remount") for every test
// after the first real TodayMoments mount in the file. See the harness
// export's own doc comment for the full mechanism.
afterEach(() => {
  resetTodayMomentsMountTracking();
});

describe("TodayMoments", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    window.localStorage.clear();
    window.sessionStorage.clear();
    routerMock.push.mockClear();
    routerMock.replace.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  // #592: login now routes an authenticated user straight to this
  // component (`/`), so this is the route-level guarantee that an existing
  // account — the seeded demo state has areas — is never forced back into
  // the onboarding ritual. The zero-state-only trigger itself is unit
  // tested in useOnboardingRitual.test.ts; this confirms it holds when
  // TodayMoments is mounted the way the real `/` route mounts it.
  it("does not show the onboarding ritual for an authenticated existing user landing on Today", () => {
    renderToday({ initialMoment: "start" });

    expect(screen.queryByTestId("onboarding-ritual")).not.toBeInTheDocument();
    expect(screen.getByTestId("today-moments")).toBeInTheDocument();
  });

  // C3 (Part of #687, C3 card 10, red-first): before this slice the ritual
  // rendered INLINE right here, on `/`, with no address of its own. This
  // pins the hand-off half of the own-URL contract — a zero-state session
  // landing on Today must hop to `/welcome` (a client-side `replace`, no
  // reload) instead of ever painting the ritual, or ordinary Today content,
  // in place. `/welcome` itself independently re-derives the same
  // eligibility and actually renders the ritual — see
  // `app/welcome/page.test.tsx`.
  it("hands a zero-state session off to /welcome instead of rendering the ritual inline (C3 own-URL)", async () => {
    window.sessionStorage.setItem(
      "lifeos.phase2.workflow",
      JSON.stringify({
        areas: [],
        captureItems: [],
        taskDrafts: [],
        projectDrafts: [],
        ambiguityAssessments: [],
        timeBlockProposalDrafts: [],
        projects: [],
        tasks: [],
        timeBlockProposals: [],
        calendarBlocks: [],
        executionSessions: [],
        healthChecks: [],
        reviewLog: [],
        wipRefusal: null,
      }),
    );

    renderToday({ initialMoment: "start" });

    await vi.waitFor(() => {
      expect(routerMock.replace).toHaveBeenCalledWith("/welcome");
    });
    // The ritual never renders inline here anymore, and neither does the
    // ordinary Today content it used to be gated against — `today-moments`
    // itself (the component's own root wrapper) still mounts, but its
    // masthead/moment content is suppressed for the hand-off tick.
    expect(screen.queryByTestId("onboarding-ritual")).not.toBeInTheDocument();
    expect(screen.queryByTestId("start-moment")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("moments-settings-link"),
    ).not.toBeInTheDocument();
  });

  // C3 (onboarding own-URL, red-first via the real dev server —
  // tests/e2e/onboarding-ritual.spec.ts): completing the ritual on
  // `/welcome` stages this same record before handing off to `/` — proving
  // here, at the unit tier, that TodayMoments' wrapper actually reads it and
  // forces the Start moment (the design note's payoff), independent of
  // whatever the clock heuristic would otherwise resolve. A `?moment=`
  // URL param was tried first and reverted — it is subject to the SAME
  // `isRemount` staleness check a genuine hand-off can trip (see
  // `hasStagedOnboardingOutcomeToast`'s own doc comment) — so this pins the
  // mechanism that actually ships, not the one that looked simpler on paper.
  it("forces the Start moment once, after a staged onboarding-completion hand-off (C3 own-URL)", async () => {
    writeOnboardingOutcomeToast("captured");

    renderToday();

    expect(await screen.findByTestId("start-moment")).toBeInTheDocument();
  });

  it("prefills the capture overlay from a share-target ?shared_text= param", async () => {
    window.history.replaceState(
      null,
      "",
      "/?shared_text=Remember%20the%20renewal",
    );

    renderToday();

    const textarea = await screen.findByTestId("capture-overlay-textarea");
    expect(textarea).toHaveValue("Remember the renewal");
    // The share param is stripped so a refresh doesn't reopen the overlay.
    // C2-S6: the URL now also carries `?moment=<resolved>` (useMomentUrlState
    // reconciling the initial moment into the URL at mount) — that is not
    // this test's concern, only that the share param itself is gone.
    expect(window.location.search).not.toContain("shared_text");
    // C2-S7 (#687 finding 2): the same replaceState now also WRITES
    // `capture=1` — a refresh at this exact moment must still show the
    // overlay open, not silently lose it the way the pre-fix URL would have.
    expect(new URL(window.location.href).searchParams.get("capture")).toBe("1");
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

  // #574: the <640px bottom navigator renders alongside (not instead of) the
  // header switcher, sharing the same moment/setMoment state — no forked
  // state, so switching from either instance keeps both in sync.
  it("renders the bottom navigator wired to the same moment state as the header switcher", () => {
    renderToday({ initialMoment: "start" });

    expect(screen.getByTestId("bottom-navigator")).toBeInTheDocument();
    expect(
      screen.getByTestId("moment-switcher-bottom-nav-start"),
    ).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByTestId("moment-switcher-bottom-nav-close"));

    // Both instances reflect the change — one shared `moment` state, not a
    // forked local one on the navigator.
    expect(screen.getByTestId("close-moment")).toBeInTheDocument();
    expect(screen.getByTestId("moment-switcher-close")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByTestId("moment-switcher-bottom-nav-close"),
    ).toHaveAttribute("aria-selected", "true");
  });

  // D-10 R2 (#483 round 2, blocker #1 — "no taste argument for it"): round 1
  // rendered the header's MomentSwitcher unconditionally at every viewport,
  // so <640px showed the identical Start/Flow/Close control twice — once in
  // the header (with keyboard hints, on a device with no keyboard) and once
  // in BottomNavigator. The header instance (and the two other controls
  // BottomNavigator already covers — CountdownClockToggle, Settings) are now
  // wrapped in a `hidden sm:contents` slot: gone below `sm`, and at `sm`+ the
  // wrapper contributes no box of its own (`display: contents`), so the
  // control renders exactly as it did before this fix. jsdom doesn't apply
  // real CSS, so this asserts the actual class strings rather than computed
  // visibility — the guarantee is "the responsive classes are present and
  // correct," which is what a real browser then acts on.
  describe("masthead mobile composition (#483 round 2)", () => {
    it("wraps the header MomentSwitcher, CountdownClockToggle, and Settings link in a hidden-below-sm slot", () => {
      renderToday({ initialMoment: "start" });

      for (const testid of [
        "masthead-momentswitcher-slot",
        "masthead-countdowntoggle-slot",
        "masthead-settingslink-slot",
      ]) {
        const slot = screen.getByTestId(testid);
        expect(slot).toHaveClass("hidden");
        expect(slot).toHaveClass("sm:contents");
      }

      // The header's own MomentSwitcher instance still exists in the DOM
      // (so `sm:contents` has something to un-hide at `sm`+) — it just
      // lives inside the hidden slot, distinct from BottomNavigator's
      // always-mobile-visible instance.
      expect(screen.getByTestId("moment-switcher-start")).toBeInTheDocument();
      expect(
        screen.getByTestId("moment-switcher-bottom-nav-start"),
      ).toBeInTheDocument();
    });

    it("never hides AreaSelector or MastheadThemeToggle — neither has a mobile equivalent anywhere else on the page", () => {
      renderToday({ initialMoment: "start" });

      // Neither control's own root (nor an ancestor up to the masthead
      // cluster) carries a `hidden` class — they render at every viewport.
      const area = screen.getByTestId("today-moments-area-switcher");
      const theme = screen.getByTestId("masthead-theme-toggle");
      expect(area.className).not.toMatch(/\bhidden\b/);
      expect(theme.className).not.toMatch(/\bhidden\b/);
    });

    it("renders a primary/secondary divider that itself is hidden below sm (nothing in the mobile row for it to divide)", () => {
      renderToday({ initialMoment: "start" });

      const divider = screen.getByTestId("masthead-divider");
      expect(divider).toHaveClass("hidden");
      expect(divider).toHaveClass("sm:block");
      expect(divider).toHaveAttribute("aria-hidden", "true");
    });
  });

  // R3-C (#483 round 3): self-hosting Inter (wider metrics than the Segoe
  // fallback) reopened the right-cluster row-1 overflow round 2 had just
  // closed — measured 18.41px over budget at desktop widths (732.13px
  // needed vs 713.72px available), wrapping the Settings icon alone to a
  // second line. Closed with a `gap-2`->`gap-1.5` claw-back on this row
  // (paired with a padding step down in AreaSelector/CountdownClockToggle/
  // MastheadThemeToggle — see each file's own regression test). Regression:
  // a future gap bump back to `gap-2` on this row silently reopens the wrap
  // now that Inter is the shipping font.
  //
  // Tightened again, `gap-1.5`->`gap-1`, fixing the main-red incident of
  // 2026-09-02 (Part of #687): the masthead's other flex-wrap row — brand +
  // `formatMastheadDate` — competes for the SAME header width budget (see
  // TodayMoments.tsx's `<header>`, a `flex justify-between` with no
  // explicit gap at `sm`+). `formatMastheadDate` renders a real weekday
  // name ("Wednesday" is the longest, 9 chars) that is ~25-34px wider than
  // a short one ("Tuesday"/"Friday") — on a long-weekday day, the browser's
  // flexbox shrink algorithm silently stole a few px from the brand+date
  // row to keep the header's own line-1 total inside its available width,
  // which was just enough to force the date span onto its own second line
  // (a `flex-wrap` child can't partially shrink — a few px short means a
  // full extra line, ~50px of height). That extra masthead height cascaded
  // down through StartMoment/PipelineOverview/ScheduleCard, eating the
  // pill-to-Areas-card clearance `moments-home-parity.spec.ts` pins at
  // 1366x768 (measured -19.39px on 2026-09-02, a Wednesday — CI had simply
  // never run this suite on a long-weekday date before). This one more
  // notch of right-cluster gap (plus the header's own inter-row gap, see
  // TodayMoments.tsx) reclaims enough width that the brand+date row never
  // has to shrink below its own single-line content width for ANY
  // weekday/day-count combination — verified against the worst case
  // ("Wednesday" + a 2-digit day) directly. Regression: a gap bump back to
  // `gap-1.5` on this row reopens that wrap on every Wednesday/Thursday.
  describe("masthead right-cluster gap (#687, masthead-date-width fix)", () => {
    it("uses the tightened gap-1, not the pre-fix gap-1.5", () => {
      renderToday({ initialMoment: "start" });

      const momentSwitcherSlot = screen.getByTestId(
        "masthead-momentswitcher-slot",
      );
      const rightCluster = momentSwitcherSlot.parentElement!;
      expect(rightCluster).toHaveClass("gap-1");
      expect(rightCluster.className).not.toMatch(/\bgap-1\.5\b/);
      expect(rightCluster.className).not.toMatch(/\bgap-2\b/);
    });
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
