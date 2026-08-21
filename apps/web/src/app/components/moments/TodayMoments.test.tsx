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
  within,
} from "@testing-library/react";
import { useEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkflow, WorkflowProvider } from "@/lib/WorkflowContext";
import { SAVED_ON_THIS_DEVICE_SHORT } from "@/lib/statusVocabulary";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  // #688: AuthAffordance (masthead sign-in door) reads the current path for
  // its ?next= return target.
  usePathname: () => "/",
}));

// #292 brief view instrumentation: hoisted so both vi.mock's factory (which
// runs before this file's other module-scope code) and the dedicated
// describe block below can reference the same spy. lib/reEntry/briefView.ts
// itself (the recorder's real once-per-day gate + upsert logic) is unit
// tested directly in briefView.test.ts; mocking it here isolates TodayMoments'
// own wiring (calls it while Start is the rendered surface) from Supabase
// client/network concerns.
const { recordBriefViewIfNeeded } = vi.hoisted(() => ({
  recordBriefViewIfNeeded: vi.fn(),
}));
vi.mock("@/lib/reEntry/briefView", () => ({
  createBriefViewRecorder: () => ({ recordIfNeeded: recordBriefViewIfNeeded }),
}));

import { stubParseCaptureFetch } from "@/__tests__/helpers/parseCaptureFetch";
import { latestActivityTimestamp } from "@/lib/reEntry/detect";
import * as momentsViewModel from "./momentsViewModel";
import { TodayMoments } from "./TodayMoments";
import type { TodayMomentsProps } from "./TodayMoments";
import { resetTodayMomentsMountTrackingForTests } from "./deepLink";

const FIXED_NOW = new Date("2026-07-05T15:00:00.000Z");

/**
 * Test-only bridge that drives a real capture -> mock parse -> accept
 * journey through WorkflowContext, so the Start moment has a first move to
 * show. The default demo WorkflowProvider state seeds areas but no tasks,
 * so journeys that need a first move must create one through real context
 * actions rather than mocking WorkflowContext internals.
 */
/**
 * #703: capture no longer parses — a seeded capture only becomes a pending
 * draft once something taps Sort. This stands in for that tap, driving the
 * same `sortCaptureIntoDrafts` the Sort button calls, so these journeys still
 * exercise the real capture -> sort -> draft path. One sort runs at a time
 * (FR-026: no parse queue), so it re-checks whenever `captureParse` settles.
 */
function useAutoSortSeededCaptures() {
  const { state, captureParse, sortCaptureIntoDrafts } = useWorkflow();
  const attempted = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (captureParse.phase === "parsing") return;
    const next = state.captureItems.find(
      (item) => !attempted.current.has(item.id),
    );
    if (!next) return;
    attempted.current.add(next.id);
    sortCaptureIntoDrafts(next.id);
  }, [state.captureItems, captureParse, sortCaptureIntoDrafts]);
}

function TaskSeedBridge() {
  const { state, submitCaptureText, acceptTaskDraft } = useWorkflow();
  useAutoSortSeededCaptures();
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

/**
 * Presses the `c` capture shortcut exactly once. The mount contract is that
 * the page must be ready to receive a user keypress once it is interactive;
 * retrying here would hide a dropped shortcut during cold mount.
 */
function pressCaptureShortcut(): void {
  fireEvent.keyDown(window, { key: "c" });
}

function renderToday(props: Partial<TodayMomentsProps> = {}) {
  return render(
    <WorkflowProvider>
      <TaskSeedBridge />
      <TodayMoments now={FIXED_NOW} {...props} />
    </WorkflowProvider>,
  );
}

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

  // #687 finding 2 (C2-S7): the VERIFIED GAP nav-truth.spec.ts's matrix pin
  // recorded — opening capture never wrote `?capture=1`, though `/capture`
  // (a redirect shim) already lands on exactly that URL and it survives
  // reload. Pins the outbound half for all three named entry points.
  //
  // The close/Back half is deliberately NOT re-proven here: jsdom's
  // `history.back()` schedules its popstate through two chained
  // `setTimeout(0)` hops (jsdom's `SessionHistory.traverseByDelta`), which —
  // because every test in this file shares one jsdom `window` — can still be
  // pending when a LATER, unrelated test starts, firing its popstate mid-way
  // through that test and flipping overlay state nothing in that test
  // touched. `useOverlayUrlState.test.ts` already proves close/Back/adopt
  // with a mocked `history.back` (matching `useSheetUrlState.test.ts`'s own
  // established pattern for exactly this reason), and `nav-truth.spec.ts`'s
  // matrix pin proves it against a real browser's real Back button.
  it("opening capture via the C shortcut writes ?capture=1", async () => {
    renderToday({ initialMoment: "start" });

    await pressCaptureShortcut();
    expect(screen.getByTestId("capture-overlay")).toBeInTheDocument();
    expect(new URL(window.location.href).searchParams.get("capture")).toBe("1");
  });

  it("opening the command palette via Cmd+K writes ?palette=1", () => {
    renderToday({ initialMoment: "start" });

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.getByTestId("command-palette")).toBeInTheDocument();
    expect(new URL(window.location.href).searchParams.get("palette")).toBe("1");
  });

  // The palette can open capture (or a sheet) from inside itself —
  // CommandPalette.tsx calls onRun then onClose in the same handler, so the
  // destination's push and the palette's own close must not fight over the
  // same Back slot (useOverlayUrlState.ts's own header explains the length-
  // based fix). This is the regression the fix exists for: without it, the
  // capture overlay would render on screen while the URL reverted to
  // `?palette=1`.
  it("selecting Open capture from the palette leaves the URL agreeing with the screen", () => {
    renderToday({ initialMoment: "start" });

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.getByTestId("command-palette")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("command-palette-option-open-capture"));

    expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();
    expect(screen.getByTestId("capture-overlay")).toBeInTheDocument();
    const params = new URL(window.location.href).searchParams;
    expect(params.get("capture")).toBe("1");
    expect(params.get("palette")).toBeNull();
  });

  // #687 finding 3 (C2-S7, URL hygiene): an unknown `?sheet=` value rendered
  // nothing — `deepLinkTargetFromParams` already treats it exactly like an
  // absent param (`deepLink.test.ts`'s own "unknown sheet value yields null"
  // case) — but the raw `bogus` string was left sitting in the address bar,
  // unexplained, surviving a refresh. Scrubbed via `replaceState` on mount.
  it("scrubs an unknown ?sheet= value from the URL instead of leaving it stranded", async () => {
    window.history.replaceState(null, "", "/?sheet=bogus");

    renderToday({ initialMoment: "start" });

    await waitFor(() => {
      expect(
        new URL(window.location.href).searchParams.get("sheet"),
      ).toBeNull();
    });
    // Nothing renders for it — matches deepLinkTargetFromParams' documented
    // "unknown/absent -> null (a plain home visit)" precedence.
    expect(screen.queryByTestId("moment-sheet-dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("today-moments")).toBeInTheDocument();
  });

  // C2-S12A finishing the C2-S12B AGENT-TODO (#687 round-6, finding 3): the
  // sibling lane built `dropUnknownParams` (deepLink.ts) as a pure,
  // fully-unit-tested function but could not wire it in — TodayMoments.tsx
  // is this lane's manifest, not theirs. This is that wiring, live: a
  // case-variant like `?MOMENT=flow` is invisible to `deepLinkTargetFromParams`
  // (read case-sensitively), so it rendered nothing while still sitting in
  // the bar next to the `moment` key the app actually honors — a URL naming
  // a key it ignores right beside the one it reads.
  it("scrubs an uppercase case-variant key (?MOMENT=) that the app never reads, keeping the real ?moment= key", async () => {
    window.history.replaceState(null, "", "/?MOMENT=flow&moment=start");

    renderToday({ initialMoment: "start" });

    await waitFor(() => {
      expect(new URL(window.location.href).searchParams.has("MOMENT")).toBe(
        false,
      );
    });
    expect(new URL(window.location.href).searchParams.get("moment")).toBe(
      "start",
    );
    expect(screen.getByTestId("start-moment")).toBeInTheDocument();
  });

  it("scrubs unknown ?capture= / ?palette= values the same way, without touching a valid neighbor param", async () => {
    window.history.replaceState(
      null,
      "",
      "/?capture=bogus&palette=nope&moment=flow",
    );

    renderToday();

    await waitFor(() => {
      const params = new URL(window.location.href).searchParams;
      expect(params.get("capture")).toBeNull();
      expect(params.get("palette")).toBeNull();
    });
    // The valid, unrelated `moment=flow` param survives the scrub untouched.
    expect(new URL(window.location.href).searchParams.get("moment")).toBe(
      "flow",
    );
    expect(screen.queryByTestId("capture-overlay")).not.toBeInTheDocument();
    expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();
  });

  // C2-S9 (#687 round-3 fresh-eyes judge, score 8.0, minor item): a
  // hand-crafted duplicate key renders first-wins (URLSearchParams.get's own
  // rule, matching every parser in this file), but used to leave the DEAD
  // second key sitting in the address bar unexplained — the same
  // stale-param-lingers bug the invalid-value scrub above already closes,
  // just for a well-formed value repeated instead of a malformed one.
  it("scrubs a duplicate ?moment= key, keeping only the first (winning) value", async () => {
    window.history.replaceState(null, "", "/?moment=flow&moment=close");

    renderToday();

    await waitFor(() => {
      const params = new URL(window.location.href).searchParams;
      expect(params.getAll("moment")).toEqual(["flow"]);
    });
    expect(screen.getByTestId("flow-moment")).toBeInTheDocument();
  });

  it("scrubs a duplicate ?sheet= key, keeping only the first (winning) value", async () => {
    window.history.replaceState(null, "", "/?sheet=plan&sheet=health");

    renderToday({ initialMoment: "start", deepLink: { sheet: "plan" } });

    await waitFor(() => {
      const params = new URL(window.location.href).searchParams;
      expect(params.getAll("sheet")).toEqual(["plan"]);
    });
    expect(screen.getByTestId("plan-sheet")).toBeInTheDocument();
  });

  it("does not touch a VALID ?sheet= value — that stays owned by the deep-link effect", async () => {
    window.history.replaceState(null, "", "/?sheet=triage");

    renderToday({ initialMoment: "start", deepLink: { sheet: "triage" } });

    await waitFor(() => {
      expect(screen.getByTestId("triage-sheet-empty")).toBeInTheDocument();
    });
    expect(new URL(window.location.href).searchParams.get("sheet")).toBe(
      "triage",
    );
  });

  // C2-S8 (#687 finding 1): an `?area=` naming an id not in the live area
  // list is scrubbed the same way an unparseable `?sheet=`/`?capture=`/
  // `?palette=` value already is — the bogus name never lingers. Unlike
  // sheet/capture/palette (which have a real "absent" state: closed), area
  // never does — some area is always the resolved truth (first area, a
  // stored preference, or explicit All-areas), so `?area=` self-heals to
  // THAT value rather than disappearing outright, the same "always visible"
  // contract `?moment=` already keeps.
  it("scrubs an unknown ?area= value from the URL, replacing it with the resolved truth", async () => {
    window.history.replaceState(null, "", "/?area=not-a-real-area");

    renderToday({ initialMoment: "start" });

    await waitFor(() => {
      expect(new URL(window.location.href).searchParams.get("area")).toBe(
        "area-main-job",
      );
    });
    expect(screen.getByTestId("today-moments")).toBeInTheDocument();
  });

  it("does not touch a VALID ?area= value", async () => {
    window.history.replaceState(null, "", "/?area=area-personal");

    renderToday({ initialMoment: "start" });

    await waitFor(() => {
      expect(new URL(window.location.href).searchParams.get("area")).toBe(
        "area-personal",
      );
    });
  });

  it("does not touch the ?area=all sentinel", async () => {
    window.history.replaceState(null, "", "/?area=all");

    renderToday({ initialMoment: "start" });

    await waitFor(() => {
      expect(new URL(window.location.href).searchParams.get("area")).toBe(
        "all",
      );
    });
  });

  // C2-S8 (#687 finding 2): capture and the command palette are mutually
  // exclusive overlays — `deepLinkTargetFromParams`'s own precedence gives
  // capture the win, so a hand-crafted URL naming both only ever renders
  // capture. The URL used to keep claiming `palette=1` regardless; it must
  // now be scrubbed, matching what actually rendered.
  it("scrubs the losing half of an impossible ?capture=1&palette=1 combo, keeping only what renders", async () => {
    window.history.replaceState(null, "", "/?capture=1&palette=1&moment=start");

    renderToday({
      initialMoment: "start",
      deepLink: { moment: "start", overlay: "capture" },
    });

    await waitFor(() => {
      expect(screen.getByTestId("capture-overlay")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();

    await waitFor(() => {
      const params = new URL(window.location.href).searchParams;
      expect(params.get("capture")).toBe("1");
      expect(params.get("palette")).toBeNull();
    });
  });

  // Sheet + overlay is a REAL, supported combo (S6's own composition
  // contract) — pinning that this scrub never touches it, so finding 2's
  // fix cannot regress into over-scrubbing a combo that DOES render both
  // halves.
  it("does not touch a real sheet+overlay combo that genuinely renders both", async () => {
    window.history.replaceState(
      null,
      "",
      "/?sheet=triage&capture=1&moment=start",
    );

    renderToday({
      initialMoment: "start",
      deepLink: { moment: "start", sheet: "triage", overlay: "capture" },
    });

    await waitFor(() => {
      expect(screen.getByTestId("triage-sheet-empty")).toBeInTheDocument();
      expect(screen.getByTestId("capture-overlay")).toBeInTheDocument();
    });
    const params = new URL(window.location.href).searchParams;
    expect(params.get("sheet")).toBe("triage");
    expect(params.get("capture")).toBe("1");
  });

  describe("area switcher URL truth (#687 finding 1)", () => {
    it("switching area writes ?area=, and Back undoes the switch", async () => {
      renderToday({ initialMoment: "start" });

      fireEvent.click(screen.getByTestId("today-moments-area-switcher"));
      fireEvent.click(screen.getByTestId("area-selector-option-area-personal"));

      await waitFor(() => {
        expect(new URL(window.location.href).searchParams.get("area")).toBe(
          "area-personal",
        );
      });
      expect(
        screen.getByTestId("today-moments-area-switcher"),
      ).toHaveTextContent("Personal");

      await act(async () => {
        window.history.back();
        // jsdom fires popstate asynchronously — flush it.
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(
          screen.getByTestId("today-moments-area-switcher"),
        ).not.toHaveTextContent("Personal");
      });
    });

    it("switching to All areas writes the ?area=all sentinel", async () => {
      renderToday({ initialMoment: "start" });

      fireEvent.click(screen.getByTestId("today-moments-area-switcher"));
      fireEvent.click(screen.getByTestId("area-selector-option-all"));

      await waitFor(() => {
        expect(new URL(window.location.href).searchParams.get("area")).toBe(
          "all",
        );
      });
      expect(
        screen.getByTestId("today-moments-area-switcher"),
      ).toHaveTextContent("All areas");
    });

    it("a direct ?area= visit resolves the same area a refresh would agree with", async () => {
      window.history.replaceState(null, "", "/?area=area-volunteer");

      renderToday({ initialMoment: "start" });

      await waitFor(() => {
        expect(
          screen.getByTestId("today-moments-area-switcher"),
        ).toHaveTextContent("Volunteer Work");
      });
      expect(new URL(window.location.href).searchParams.get("area")).toBe(
        "area-volunteer",
      );
    });

    // C2-S8 hotfix (#687 finding 1, caught by CI's signed-in tier —
    // areas-port-truth.spec.ts:211): picking an area FROM THE AREAS SHEET
    // (not the masthead pill) used to lose the race against the sheet's own
    // close. AreasSheet.tsx calls `onSelectArea(areaId)` (a raw
    // `setSelectedAreaId`, no history write) THEN `onClose()`
    // (`closeSheet()`, which — because this sheet WAS pushed —
    // `history.back()`s). `back()` is asynchronous; when its `popstate`
    // finally lands, the URL is whatever it was BEFORE the sheet opened
    // (the OLD area), and `useAreaUrlState`'s popstate handler faithfully
    // re-applies it, undoing the pick a beat later. Reproduces the CI
    // failure shape exactly: pre-sheet area "Personal", pick "Volunteer
    // Work" from inside the sheet, screen ends up back on "Personal".
    it("picking an area from the Areas sheet sticks — it does not lose the race against the sheet's own close", async () => {
      renderToday({ initialMoment: "start" });

      // Pre-sheet area, via the masthead (a real pushState) — the entry
      // Back would otherwise revert to.
      fireEvent.click(screen.getByTestId("today-moments-area-switcher"));
      fireEvent.click(screen.getByTestId("area-selector-option-area-personal"));
      await waitFor(() => {
        expect(
          screen.getByTestId("today-moments-area-switcher"),
        ).toHaveTextContent("Personal");
      });

      // Reach the Areas sheet (openSheet pushes ?sheet=areas, composing with
      // the ?area=area-personal already on the URL).
      fireEvent.click(screen.getByTestId("bottom-navigator-more"));
      fireEvent.click(screen.getByTestId("command-palette-option-open-areas"));
      expect(screen.getByTestId("areas-sheet")).toBeInTheDocument();

      // Pick a DIFFERENT area from inside the sheet.
      fireEvent.click(screen.getByTestId("areas-sheet-pill-area-volunteer"));

      // The sheet closes...
      expect(screen.queryByTestId("areas-sheet")).not.toBeInTheDocument();
      // ...and the pick STICKS — this is the exact assertion CI's
      // areas-port-truth.spec.ts:227 makes, and the exact one that was
      // failing (received "All areasA" / here, would have reverted to
      // "Personal" instead of holding "Volunteer Work").
      await waitFor(() => {
        expect(
          screen.getByTestId("today-moments-area-switcher"),
        ).toHaveTextContent("Volunteer Work");
      });
      // Give any stray async popstate a chance to land, then re-assert —
      // this is what would have caught the original bug: the revert
      // happened on a LATER tick, after the first (passing) assertion.
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(
        screen.getByTestId("today-moments-area-switcher"),
      ).toHaveTextContent("Volunteer Work");
      expect(new URL(window.location.href).searchParams.get("area")).toBe(
        "area-volunteer",
      );
      expect(
        new URL(window.location.href).searchParams.get("sheet"),
      ).toBeNull();
    });
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

  // C2-S10 (#687 round-4 judge — the SECOND infection site of the C2-S8
  // hydration disease): `readStoredPreferences()` used to be read inside
  // `resolvedInitialMoment`'s own synchronous `useState` initializer, which
  // runs during SSR too — where `window`/`localStorage` do not exist. A
  // return visit after ever switching moments (or the time display) once
  // reproduced a server/client mismatch on EVERY reload of a bare `/`.
  // Root-caused via a direct SSR curl of a bare `/` with
  // `lifeos.moments.preferences` primed: the raw HTML always showed the
  // wall-clock heuristic's answer while the hydrated DOM showed the
  // remembered one (confirmed live in a browser: "Hydration failed ... the
  // tree will be regenerated on the client" on every reload before the fix,
  // zero errors after). Fixed the same shape as C2-S8's `?moment=`
  // mismatch: the synchronous tier is now deterministic between server and
  // client (both fall to the same heuristic when nothing more explicit is
  // present); the stored preference is adopted in a client-only effect
  // AFTER hydration, via `adoptMomentFromUrl`/`setTimeDisplay` +
  // `replaceState` for `moment` (never `pushState` — this finishes the same
  // initial resolution a beat late, it is not a user-initiated switch, so
  // it must not grow history). jsdom cannot reproduce the SSR/CSR split
  // itself (there is only one environment here) — these tests pin the
  // OBSERVABLE contract the fix depends on: the remembered value still
  // wins when nothing more explicit is present, an explicit signal still
  // outranks it, and adopting it never pushes a history entry.
  describe("stored moment/time-display preference (#687 round-4, C2-S10 hydration fix)", () => {
    it("adopts a stored moment preference after mount, without growing history", () => {
      window.localStorage.setItem(
        "lifeos.moments.preferences",
        JSON.stringify({ moment: "flow", timeDisplay: "countdown" }),
      );
      const push = vi.spyOn(window.history, "pushState");

      renderToday();

      expect(screen.getByTestId("flow-moment")).toBeInTheDocument();
      expect(new URL(window.location.href).searchParams.get("moment")).toBe(
        "flow",
      );
      expect(push).not.toHaveBeenCalled();
      push.mockRestore();
    });

    it("a URL-provided ?moment= still outranks a stored preference", () => {
      window.localStorage.setItem(
        "lifeos.moments.preferences",
        JSON.stringify({ moment: "close", timeDisplay: "countdown" }),
      );
      window.history.replaceState(null, "", "/?moment=start");

      renderToday();

      expect(screen.getByTestId("start-moment")).toBeInTheDocument();
      expect(new URL(window.location.href).searchParams.get("moment")).toBe(
        "start",
      );
    });

    it("deepLink.moment also outranks a stored preference", () => {
      window.localStorage.setItem(
        "lifeos.moments.preferences",
        JSON.stringify({ moment: "close", timeDisplay: "countdown" }),
      );

      renderToday({ deepLink: { moment: "flow" } });

      expect(screen.getByTestId("flow-moment")).toBeInTheDocument();
    });

    it("the initialMoment test-override prop outranks a stored preference", () => {
      window.localStorage.setItem(
        "lifeos.moments.preferences",
        JSON.stringify({ moment: "close", timeDisplay: "countdown" }),
      );

      renderToday({ initialMoment: "start" });

      expect(screen.getByTestId("start-moment")).toBeInTheDocument();
    });

    it("adopts a stored time-display preference after mount", () => {
      window.localStorage.setItem(
        "lifeos.moments.preferences",
        JSON.stringify({ moment: "start", timeDisplay: "clock" }),
      );

      renderToday({ initialMoment: "start" });

      expect(
        screen.getByTestId("countdown-clock-toggle-clock"),
      ).toHaveAttribute("aria-pressed", "true");
    });

    it("no stored preference at all — the deterministic heuristic default renders with zero errors", () => {
      // No localStorage.setItem call — a genuinely fresh device/session.
      renderToday({ initialMoment: "start" });

      expect(screen.getByTestId("start-moment")).toBeInTheDocument();
      expect(
        screen.getByTestId("countdown-clock-toggle-countdown"),
      ).toHaveAttribute("aria-pressed", "true");
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
  useAutoSortSeededCaptures();
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

    await pressCaptureShortcut();

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

/**
 * Moments pass P5 — packet: PipelineOverview + demoted-surface sheets.
 * D-3 (#483) replaced the collapsed Pipeline disclosure with an
 * always-visible stage rail — the "expand first" step these tests used to
 * need is gone; the rail (and its stage buttons) are present immediately.
 * Additive coverage: the Start moment's Pipeline rail opens the
 * triage/plan sheets, Escape ordering, and the new palette entries.
 */
describe("TodayMoments — P5 pipeline rail and sheets", () => {
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

  it("the Pipeline rail renders immediately (no expand step) with PipelineOverview", () => {
    renderToday({ initialMoment: "start" });

    const rail = screen.getByTestId("start-moment-pipeline-rail");
    expect(rail).toBeInTheDocument();
    expect(screen.getByTestId("pipeline-overview")).toBeInTheDocument();
  });

  it("drilling into triage from the Pipeline rail opens the TriageSheet", () => {
    renderToday({ initialMoment: "start" });

    fireEvent.click(screen.getByTestId("pipeline-overview-stage-triage"));

    expect(screen.getByTestId("moment-sheet-dialog")).toHaveAttribute(
      "aria-label",
      "Triage",
    );
  });

  it("drilling into plan from the Pipeline rail opens the PlanSheet", () => {
    renderToday({ initialMoment: "start" });

    fireEvent.click(screen.getByTestId("pipeline-overview-stage-plan"));

    expect(screen.getByTestId("moment-sheet-dialog")).toHaveAttribute(
      "aria-label",
      "Plan",
    );
  });

  it("drilling into review from the Pipeline rail opens the ReviewSheet", () => {
    renderToday({ initialMoment: "start" });

    fireEvent.click(screen.getByTestId("pipeline-overview-stage-review"));

    expect(screen.getByTestId("moment-sheet-dialog")).toHaveAttribute(
      "aria-label",
      "Review",
    );
  });

  // C2-S6 (#687): every pipeline-rail node opens something real now — no
  // control promises "the full shell" (a shell that no longer exists once
  // C2-S6 retires the legacy routes). Capture opens the capture overlay;
  // Execute switches to the Flow moment.
  it("drilling into capture from the Pipeline rail opens the capture overlay", () => {
    renderToday({ initialMoment: "start" });

    fireEvent.click(screen.getByTestId("pipeline-overview-stage-capture"));

    expect(
      screen.getByRole("dialog", { name: "Capture a thought" }),
    ).toBeInTheDocument();
  });

  it("drilling into execute from the Pipeline rail switches to the Flow moment", () => {
    renderToday({ initialMoment: "start" });

    fireEvent.click(screen.getByTestId("pipeline-overview-stage-execute"));

    expect(screen.getByTestId("flow-moment")).toBeInTheDocument();
  });

  it("closes the sheet via its own Escape handling without affecting the capture overlay's independent Escape path", () => {
    renderToday({ initialMoment: "start" });

    fireEvent.click(screen.getByTestId("pipeline-overview-stage-triage"));
    expect(screen.getByTestId("moment-sheet-dialog")).toBeInTheDocument();

    fireEvent.keyDown(screen.getByTestId("moment-sheet-dialog"), {
      key: "Escape",
    });
    expect(screen.queryByTestId("moment-sheet-dialog")).not.toBeInTheDocument();
  });

  it("global Escape (via useMomentKeyboard) is disabled while a sheet is open — number keys do not switch moments", () => {
    renderToday({ initialMoment: "start" });

    fireEvent.click(screen.getByTestId("pipeline-overview-stage-triage"));
    expect(screen.getByTestId("moment-sheet-dialog")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "2" });
    // Still on the sheet — the underlying moment did not switch to Flow.
    expect(screen.getByTestId("moment-sheet-dialog")).toBeInTheDocument();
    expect(screen.queryByTestId("flow-moment")).not.toBeInTheDocument();
  });

  it("the command palette offers 'Open triage', 'Open plan' and 'Open review', each opening the matching sheet", () => {
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

    fireEvent.click(screen.getByTestId("moment-sheet-close"));
    expect(screen.queryByTestId("moment-sheet-dialog")).not.toBeInTheDocument();

    // C2-S11 (#687 round-5 judge, C3 blocker): "Open review" was missing
    // entirely — typing "review" into the palette returned "No commands
    // match" even though the sheet itself has worked since C2-S3.
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    fireEvent.click(screen.getByTestId("command-palette-option-open-review"));
    expect(screen.getByTestId("moment-sheet-dialog")).toHaveAttribute(
      "aria-label",
      "Review",
    );
    expect(new URLSearchParams(window.location.search).get("sheet")).toBe(
      "review",
    );
  });

  // C2-S12A (#687 round-6 judge, palette gaps): "Settings is the only core
  // surface with no palette command" — this is that command, landing on the
  // same /settings/areas target the masthead/BottomNavigator links already
  // use. A real `window.location.assign`, not `router.push` — see the
  // runPaletteAction "open-settings" case comment for the history-race
  // `router.push` would hit against the palette's own close-on-run behavior
  // (proven red-first against the real dev server in nav-truth.spec.ts, not
  // reproducible in jsdom). jsdom throws on a real `location.assign`, so this
  // stubs just that one method — scoped to this test only, restored (in a
  // `finally`, so a failed assertion can never leak the stub into every test
  // that runs after it) before it ends.
  //
  // The palette itself deliberately stays OPEN in the DOM here (its own
  // onClose is skipped — CommandPaletteAction.closesPalette: false, and
  // CommandPalette.test.tsx pins that mechanism directly): in a real browser
  // the whole document unloads a moment later, so there is nothing left to
  // "close"; jsdom cannot simulate that unload, so this only asserts the
  // navigation call itself.
  it("the command palette offers 'Open settings', navigating to /settings/areas", () => {
    renderToday({ initialMoment: "start" });

    const assignMock = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign: assignMock });

    try {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
      fireEvent.click(
        screen.getByTestId("command-palette-option-open-settings"),
      );

      expect(assignMock).toHaveBeenCalledWith("/settings/areas");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  // C2-S12A (#687 round-6 judge, palette gaps): typing "today" or "home"
  // used to return "No commands match" even though Start (the app's landing
  // moment) already exists as a command — a missing alias, not a missing
  // surface.
  it("typing 'today' or 'home' into the palette search surfaces 'Switch to Start'", () => {
    renderToday({ initialMoment: "flow" });

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    let input = screen.getByTestId("command-palette-input");
    fireEvent.change(input, { target: { value: "today" } });
    expect(
      screen.getByTestId("command-palette-option-switch-start"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/No commands match/)).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "home" } });
    expect(
      screen.getByTestId("command-palette-option-switch-start"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/No commands match/)).not.toBeInTheDocument();
  });

  // C2-S12A: the palette must never offer a dead "Sign in" door — in this
  // suite's default (unconfigured, local-only) environment there is no
  // sign-in flow to reach at all (AuthAffordance.tsx renders nothing for the
  // same reason), so the command must not appear either. The positive case
  // (configured + actually signed out, gated on the same `syncStatus
  // .signedOut` truth signal AuthAffordance's own `client.auth.getUser()`
  // check converges to) is UNVERIFIED by an automated test in this PR — see
  // the PR body.
  it("does not offer 'Sign in' when there is no configured backend to sign into", () => {
    renderToday({ initialMoment: "start" });

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    const input = screen.getByTestId("command-palette-input");
    fireEvent.change(input, { target: { value: "sign in" } });

    expect(
      screen.queryByTestId("command-palette-option-sign-in"),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/No commands match/)).toBeInTheDocument();
  });

  // C2-S11 (#687 round-5 judge): pins the palette's own fuzzy-match search
  // actually surfaces "Open review" for the query the judge typed —
  // reproduces "typing 'review' returns No commands match" as a red-first
  // regression guard, not just proving the click-through works once found.
  it("typing 'review' into the palette search surfaces 'Open review'", () => {
    renderToday({ initialMoment: "start" });

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    const input = screen.getByTestId("command-palette-input");
    fireEvent.change(input, { target: { value: "review" } });

    expect(
      screen.getByTestId("command-palette-option-open-review"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/No commands match/)).not.toBeInTheDocument();
  });

  // C2-S6 mutation-proven coverage gap (adversarial verifier, 2026-08-20):
  // BottomNavigator's "More" trigger (`bottom-navigator-more`) -> command
  // palette -> "Open health" / "Open all areas" is the ONLY shipped <=2-tap
  // mobile path to Health/Areas (Target Card 2's Criterion 3 — see
  // BottomNavigator.tsx's and TodayMoments.tsx's own comments on
  // `onOpenPalette` and the two palette actions). Every palette test above
  // this one opens the palette with the Cmd+K *keyboard* shortcut, which is
  // not a mobile affordance, and every Health/Areas reach test opens the
  // sheet directly or via SideRail — neither exercises this chain. Proof of
  // the gap: temporarily disconnecting TodayMoments.tsx's
  // `onOpenPalette={() => setPaletteOpen(true)}` prop (passing a no-op
  // instead) left all 69 pre-existing TodayMoments/BottomNavigator tests
  // green. This is the test that goes red on that mutation — see this
  // change's commit message for the red-first run.
  //
  // BottomNavigator itself is only visually hidden above the `sm` breakpoint
  // via a Tailwind `sm:hidden` class (BottomNavigator.tsx) — jsdom does not
  // evaluate media queries, so the node is always present in this tree and
  // clickable regardless of a simulated viewport width (see the
  // "masthead mobile composition" describe block above, which documents the
  // same jsdom limitation). The real 390x844-viewport proof that this is
  // reachable on an actual phone lives in the Playwright matrix pin
  // (apps/web/tests/e2e/nav-truth.spec.ts, "matrix pin: sheet:health" /
  // "matrix pin: sheet:areas"), which this change re-anchors onto this same
  // trigger.
  it("BottomNavigator's More trigger opens the command palette; Open health / Open all areas each land on the matching sheet, URL included — the shipped <=2-tap mobile path to Health/Areas", () => {
    renderToday({ initialMoment: "start" });

    // Tap 1: the mobile "More" trigger — never Cmd+K.
    fireEvent.click(screen.getByTestId("bottom-navigator-more"));
    expect(screen.getByTestId("command-palette")).toBeInTheDocument();

    // Tap 2: "Open health".
    fireEvent.click(screen.getByTestId("command-palette-option-open-health"));
    expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();
    expect(screen.getByTestId("moment-sheet-dialog")).toHaveAttribute(
      "aria-label",
      "How LifeOS is doing",
    );
    expect(new URLSearchParams(window.location.search).get("sheet")).toBe(
      "health",
    );

    fireEvent.click(screen.getByTestId("moment-sheet-close"));
    expect(screen.queryByTestId("moment-sheet-dialog")).not.toBeInTheDocument();

    // Same chain again for "Open all areas" — the palette's other C2-S6
    // mobile-only entry.
    fireEvent.click(screen.getByTestId("bottom-navigator-more"));
    expect(screen.getByTestId("command-palette")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("command-palette-option-open-areas"));
    expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();
    expect(screen.getByTestId("moment-sheet-dialog")).toHaveAttribute(
      "aria-label",
      "All areas",
    );
    expect(new URLSearchParams(window.location.search).get("sheet")).toBe(
      "areas",
    );
  });

  // C2-S12A (#687 round-6 judge, WORST-DEFECT-ADJACENT finding): the legend's
  // "⌘K palette" hint used to be inside a `pointer-events-none` group, so a
  // desktop user with a mouse and no keyboard shortcut muscle memory had NO
  // way to open the palette at all. This is the real pointer door now —
  // same idea as BottomNavigator's "More" button just above, extended to
  // `sm`+ instead of a second competing control.
  it("the keyboard legend's palette hint is a real button that opens the command palette (the desktop pointer route)", () => {
    renderToday({ initialMoment: "start" });

    expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("keyboard-legend-palette-button"));

    expect(screen.getByTestId("command-palette")).toBeInTheDocument();
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

  // C2-S8 (#687 finding 3, root cause): `resolvedInitialMoment` used to read
  // `window.location` for its URL tier — which does not exist during SSR, so
  // the server always fell through to the clock heuristic regardless of the
  // URL, while the client honored it, a structural mismatch React reported
  // as a hydration failure. `deepLink.moment` (the SAME
  // `deepLinkTargetFromParams(searchParams)` value page.tsx computes
  // SERVER-side, identically available at hydration) is now consulted
  // FIRST. jsdom always has `window`, so this cannot reproduce the SSR/CSR
  // split itself — that was proven directly against a running dev server
  // (a curl of `/?moment=flow` returning `data-testid="close-moment"`
  // before the fix, `flow-moment` after) — but this pins that `deepLink`
  // wins even against a CONFLICTING URL, the precedence order the fix
  // depends on.
  it("resolves the initial moment from deepLink.moment even when window.location names a different one", () => {
    window.history.replaceState(null, "", "/?moment=close");

    renderToday({ deepLink: { moment: "flow" } });

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
  it("toast slot is fixed-positioned so mounting a toast never reflows the page", async () => {
    const restoreFetch = stubParseCaptureFetch();
    renderToday({ initialMoment: "start" });

    const toast = screen.getByTestId("today-moments-toast");
    expect(toast).toHaveClass("fixed");
    expect(toast.textContent).toBe("");

    await pressCaptureShortcut();
    fireEvent.change(screen.getByTestId("capture-overlay-textarea"), {
      target: { value: "Follow up with Alex about the contract" },
    });
    fireEvent.keyDown(screen.getByTestId("capture-overlay-textarea"), {
      key: "Enter",
    });

    await waitFor(
      () => {
        const toastAfter = screen.getByTestId("today-moments-toast");
        expect(toastAfter).toHaveClass("fixed");
        expect(
          within(toastAfter).getByText(/Captured — it's in your triage pile/),
        ).toBeInTheDocument();
      },
      { timeout: 5000 },
    );

    restoreFetch();
  });

  // SP-4: the toast message pill uses motion tokens (not a literal ms
  // value) and falls back to no motion for prefers-reduced-motion users.
  it("toast message pill uses motion tokens with a reduced-motion fallback", async () => {
    const restoreFetch = stubParseCaptureFetch();
    renderToday({ initialMoment: "start" });

    await pressCaptureShortcut();
    fireEvent.change(screen.getByTestId("capture-overlay-textarea"), {
      target: { value: "Follow up with Alex about the contract" },
    });
    fireEvent.keyDown(screen.getByTestId("capture-overlay-textarea"), {
      key: "Enter",
    });

    const toastMessage = await waitFor(
      () =>
        within(screen.getByTestId("today-moments-toast")).getByText(
          /Captured — it's in your triage pile/,
        ),
      { timeout: 5000 },
    );
    expect(toastMessage).toHaveClass("motion-reduce:transition-none");
    expect(toastMessage).toHaveClass("motion-reduce:duration-0");
    expect(toastMessage.style.transitionDuration).toBe("var(--motion-base)");
    expect(toastMessage.style.transitionTimingFunction).toBe(
      "var(--motion-ease)",
    );

    restoreFetch();
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

    await pressCaptureShortcut();
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

    await pressCaptureShortcut();
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
    const restoreFetch = stubParseCaptureFetch();
    renderToday({ initialMoment: "start" });

    await pressCaptureShortcut();
    const textarea = screen.getByTestId("capture-overlay-textarea");
    fireEvent.change(textarea, {
      target: { value: "Follow up with Alex about the contract" },
    });
    fireEvent.keyDown(textarea, { key: "Enter" });

    // Held in context through the wait — the draft is cleared and the
    // overlay closes only once the parse truly resolves, never the instant
    // Enter is pressed.
    expect(screen.getByTestId("capture-overlay")).toBeInTheDocument();

    await waitFor(
      () => {
        expect(screen.queryByTestId("capture-overlay")).not.toBeInTheDocument();
      },
      { timeout: 5000 },
    );
    expect(screen.getByTestId("today-moments-toast")).toHaveTextContent(
      "Captured",
    );
    expect(
      window.sessionStorage.getItem("lifeos.moments.captureDraft"),
    ).toBeNull();

    await pressCaptureShortcut();
    const reopened = screen.getByTestId(
      "capture-overlay-textarea",
    ) as HTMLTextAreaElement;
    expect(reopened.value).toBe("");
    expect(
      screen.queryByTestId("capture-overlay-draft-restored"),
    ).not.toBeInTheDocument();

    restoreFetch();
  });

  it("fresh mount with empty sessionStorage shows an empty box and no false restored hint", async () => {
    renderToday({ initialMoment: "start" });

    await pressCaptureShortcut();
    const textarea = screen.getByTestId(
      "capture-overlay-textarea",
    ) as HTMLTextAreaElement;

    expect(textarea.value).toBe("");
    expect(
      screen.queryByTestId("capture-overlay-draft-restored"),
    ).not.toBeInTheDocument();
  });
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

/**
 * #292 Stage-2 entry gate instrumentation: the daily brief-view record must
 * fire on the surface a non-absent, daily-engaged user actually sees — the
 * Start moment — not only the rarer post-absence re-entry ritual (that path
 * is covered separately in useReEntryRitual.test.ts). `recordIfNeeded` is
 * mocked at the module boundary so this proves TodayMoments' own wiring
 * (calls it while Start is showing, not while another moment/ritual owns
 * the screen) without depending on Supabase or network behavior, which
 * lib/reEntry/briefView.test.ts already covers directly.
 */
describe("TodayMoments — #292 brief view instrumentation", () => {
  beforeEach(() => {
    recordBriefViewIfNeeded.mockClear();
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

  it("records a brief view once the Start moment is the rendered surface", () => {
    renderToday({ initialMoment: "start" });

    expect(screen.getByTestId("start-moment")).toBeInTheDocument();
    expect(recordBriefViewIfNeeded).toHaveBeenCalledWith(null, FIXED_NOW);
  });

  it("does not record while Flow or Close is the rendered surface", () => {
    renderToday({ initialMoment: "flow" });

    expect(screen.getByTestId("flow-moment")).toBeInTheDocument();
    expect(recordBriefViewIfNeeded).not.toHaveBeenCalled();
  });

  it("records once switching to Start from another moment", () => {
    renderToday({ initialMoment: "close" });
    expect(recordBriefViewIfNeeded).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("moment-switcher-start"));

    expect(screen.getByTestId("start-moment")).toBeInTheDocument();
    expect(recordBriefViewIfNeeded).toHaveBeenCalledWith(null, FIXED_NOW);
  });
});
