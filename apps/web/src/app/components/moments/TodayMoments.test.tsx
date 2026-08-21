// #737-A slice 2: closing the day journals the review to IndexedDB before any
// account write. jsdom has no IndexedDB, so without this polyfill the close-day
// path would take the "the device refused to hold it" branch.
import "fake-indexeddb/auto";

import { act, fireEvent, screen } from "@testing-library/react";

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

import { renderToday } from "@/__tests__/helpers/todayMomentsHarness";
import { resetTodayMomentsMountTrackingForTests } from "./deepLink";

// C2-S13 (#687): FILE-LEVEL, applies to every `describe` below regardless of
// nesting.
//
// `window.location` is shared, mutable jsdom state across every test in this
// one file (Vitest does not reset it between `it`s, only between test
// FILES), the same class of global the "TodayMoments" describe below already
// resets in its own `afterEach` (localStorage/sessionStorage, plus — until
// now — a `window.location` reset scoped ONLY to that one describe, missed
// by every OTHER top-level describe in this file — P5, P6, SP-5, SP-10,
// SP-6, #292, ... — several of which drive real `openSheet`/`openCapture`
// actions that push real `?sheet=`/`?capture=` history entries).
//
// `resetTodayMomentsMountTrackingForTests` (deepLink.ts) resets a SEPARATE
// piece of shared state: a module-level flag TodayMoments.tsx's deep-link
// effect uses to tell a genuine Back/Forward remount (where a stale
// `deepLink` prop needs cross-checking against the live URL) apart from a
// fresh mount (where the prop is trusted outright, matching this file's own
// pervasive convention of driving that effect by passing `deepLink` directly
// with no matching `window.location` write). Vitest keeps ONE module
// instance loaded for every `it()` in a file, so without this reset the flag
// would read `true` (a "remount") for every test after the first real
// TodayMoments mount in the file.
afterEach(() => {
  window.history.replaceState(null, "", "/");
  resetTodayMomentsMountTrackingForTests();
});

describe("TodayMoments", () => {
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
  describe("masthead right-cluster gap (#483 round 3, Inter reflow)", () => {
    it("uses the tightened gap-1.5, not the pre-Inter-reflow gap-2", () => {
      renderToday({ initialMoment: "start" });

      const momentSwitcherSlot = screen.getByTestId(
        "masthead-momentswitcher-slot",
      );
      const rightCluster = momentSwitcherSlot.parentElement!;
      expect(rightCluster).toHaveClass("gap-1.5");
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
