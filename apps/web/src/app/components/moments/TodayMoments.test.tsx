// #737-A slice 2: closing the day journals the review to IndexedDB before any
// account write. jsdom has no IndexedDB, so without this polyfill the close-day
// path would take the "the device refused to hold it" branch.
import "fake-indexeddb/auto";

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SAVED_ON_THIS_DEVICE_SHORT } from "@/lib/statusVocabulary";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  // #688: AuthAffordance (masthead sign-in door) reads the current path for
  // its ?next= return target.
  usePathname: () => "/",
}));

// #292 brief view instrumentation: this file does not assert on the
// recorder spy, so it is stubbed without a `vi.fn()` reference to avoid an
// unused variable. See TodayMoments.briefView.test.tsx for the asserted
// (vi.hoisted spy) form.
vi.mock("@/lib/reEntry/briefView", () => ({
  createBriefViewRecorder: () => ({ recordIfNeeded: vi.fn() }),
}));

import { stubParseCaptureFetch } from "@/__tests__/helpers/parseCaptureFetch";
import {
  pressCaptureShortcut,
  renderToday,
} from "@/__tests__/helpers/todayMomentsHarness";


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

  it("keeps the Moments end sheet draft open when the cap decision is cancelled", async () => {
    vi.useFakeTimers();
    const restoreFetch = stubParseCaptureFetch();
    const prompt = vi.spyOn(window, "prompt").mockReturnValue(null);
    renderToday({ initialMoment: "start" });

    fireEvent.click(screen.getByTestId("seed-submit"));
    await vi.waitFor(() => {
      expect(screen.getByTestId("seed-draft-count")).toHaveTextContent("1");
    });
    fireEvent.click(screen.getByTestId("seed-accept"));
    await vi.waitFor(() => {
      expect(screen.getByTestId("first-move-card")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("first-move-start"));

    act(() => {
      vi.advanceTimersByTime(25 * 60 * 1000 + 1000);
    });
    fireEvent.click(screen.getByTestId("current-block-hero-done"));
    fireEvent.change(screen.getByTestId("end-session-note"), {
      target: { value: "Keep my working note" },
    });
    fireEvent.click(screen.getByTestId("end-session-save"));
    await act(async () => {});

    expect(prompt).toHaveBeenCalledOnce();
    expect(screen.getByTestId("end-session-sheet")).toBeInTheDocument();
    expect(screen.getByTestId("end-session-note")).toHaveValue(
      "Keep my working note",
    );
    restoreFetch();
  });

  it("closes the Moments sheet with split truth when the session saves but deferral is unconfirmed", async () => {
    // Narrowed `toFake` since #737 C1 card 1: ending a session journals the
    // outcome to IndexedDB before anything else, and `fake-indexeddb` drives
    // its request callbacks with `setImmediate`. Faking that (vitest's
    // default) freezes the journal write, so the sheet would sit on "Saving…"
    // forever. Same remedy #737-A slice 2 applied to the close-day toast:
    // fake only the timers this test's subject uses.
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"],
    });
    const restoreFetch = stubParseCaptureFetch();
    vi.spyOn(window, "prompt")
      .mockReturnValueOnce("defer")
      .mockReturnValueOnce("Continue tomorrow");
    renderToday({ initialMoment: "start" });

    fireEvent.click(screen.getByTestId("seed-submit"));
    await vi.waitFor(() => {
      expect(screen.getByTestId("seed-draft-count")).toHaveTextContent("1");
    });
    fireEvent.click(screen.getByTestId("seed-accept"));
    await vi.waitFor(() => {
      expect(screen.getByTestId("first-move-card")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("first-move-start"));
    act(() => {
      vi.advanceTimersByTime(25 * 60 * 1000 + 1000);
    });
    fireEvent.click(screen.getByTestId("current-block-hero-done"));
    fireEvent.click(screen.getByTestId("end-session-save"));

    // The journal write resolves on real `setImmediate` — drain that queue
    // until the save result lands and the sheet closes.
    for (let attempt = 0; attempt < 50; attempt += 1) {
      await act(async () => {
        await new Promise((resolve) => setImmediate(resolve));
      });
      if (screen.getByTestId("today-moments-toast").textContent) break;
    }

    expect(screen.queryByTestId("end-session-sheet")).not.toBeInTheDocument();
    expect(screen.getByTestId("today-moments-toast")).toHaveTextContent(
      "Session saved — deferral not yet confirmed",
    );
    restoreFetch();
  });

  // #556 FR-026: the overlay now holds the user through the parse wait
  // (raw text + hook stay visible, no second submit possible) instead of
  // closing the instant Enter is pressed — this drives that wait through to
  // its "back to: <hook>" conclusion before asserting the old post-save
  // assertions (overlay closed, toast shown).
  it("capture-during-flow: pressing C opens capture from Flow, saving keeps the moment on Flow", async () => {
    const restoreFetch = stubParseCaptureFetch();
    renderToday({ initialMoment: "flow" });

    expect(screen.getByTestId("flow-moment")).toBeInTheDocument();
    expect(screen.getByTestId("flow-moment-empty")).toBeInTheDocument();

    await pressCaptureShortcut();
    expect(screen.getByTestId("capture-overlay")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("capture-overlay-textarea"), {
      target: { value: "Follow up with Alex about the contract" },
    });
    fireEvent.keyDown(screen.getByTestId("capture-overlay-textarea"), {
      key: "Enter",
    });

    // #703: no parse wait at capture any more — the save is synchronous and
    // the overlay goes straight to its "back to: <hook>" conclusion. It is
    // still not released the instant Enter is pressed.
    expect(screen.getByTestId("capture-overlay")).toBeInTheDocument();
    expect(screen.queryByTestId("capture-overlay-parsing")).toBeNull();
    expect(screen.getByTestId("capture-overlay-conclusion")).toBeVisible();

    await waitFor(
      () => {
        expect(screen.queryByTestId("capture-overlay")).not.toBeInTheDocument();
      },
      { timeout: 5000 },
    );
    expect(screen.getByTestId("flow-moment")).toBeInTheDocument();
    expect(screen.getByTestId("today-moments-toast")).toHaveTextContent(
      "Captured",
    );

    restoreFetch();
  });

  it("close-day journey: Close moment renders counts and Close the day fires without crashing", async () => {
    renderToday({ initialMoment: "close" });

    expect(screen.getByTestId("close-moment-completed")).toHaveTextContent("0");
    expect(screen.getByTestId("close-moment-missed")).toHaveTextContent("0");

    fireEvent.click(screen.getByTestId("close-moment-close-day"));

    // #588: mock mode has no account, so the resolved save result is
    // local-only and the toast states that truth (not a bare "Day closed").
    await waitFor(() => {
      expect(screen.getByTestId("today-moments-toast")).toHaveTextContent(
        `Day closed — ${SAVED_ON_THIS_DEVICE_SHORT}`,
      );
    });
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
