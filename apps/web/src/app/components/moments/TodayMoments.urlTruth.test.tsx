// #737-A slice 2: closing the day journals the review to IndexedDB before any
// account write. jsdom has no IndexedDB, so without this polyfill the close-day
// path would take the "the device refused to hold it" branch.
import "fake-indexeddb/auto";

import { act, fireEvent, screen, waitFor } from "@testing-library/react";

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

// #687 C2 F2 round 2: a pass-through seam on the end-session policy. Every
// call runs the REAL `runEndSessionPolicy` unless a test sets `override`
// (and resets it after), so the rest of this file is unaffected. Only the
// pending-save describe below uses it, to hold a save deterministically
// unsettled; the real-persistence boundary test there uses no override.
const endPolicy = vi.hoisted(() => ({
  calls: 0,
  override: null as
    | null
    | typeof import("./endSessionPolicy").runEndSessionPolicy,
}));
vi.mock("./endSessionPolicy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./endSessionPolicy")>();
  return {
    ...actual,
    runEndSessionPolicy: (
      ...args: Parameters<typeof actual.runEndSessionPolicy>
    ) => {
      endPolicy.calls += 1;
      return (endPolicy.override ?? actual.runEndSessionPolicy)(...args);
    },
  };
});

import {
  pressCaptureShortcut,
  renderToday,
  resetTodayMomentsMountTracking,
} from "@/__tests__/helpers/todayMomentsHarness";
import { stubParseCaptureFetch } from "@/__tests__/helpers/parseCaptureFetch";
import {
  clearPendingWrites,
  listPendingWrites,
} from "@/lib/durability/pendingWriteJournal";
import { clearStoredTaskDrafts } from "@/lib/durability/draftStore";
import type { EndSessionResult } from "./endSessionPolicy";

// C2-S13 (#687 round-7): FILE-LEVEL, applies regardless of describe nesting
// — every split file that mounts TodayMoments more than once needs this
// reset (deepLink.ts's module-level remount-tracking flag survives across
// `it()`s in the same file); see the harness export's own doc comment for
// the full mechanism. This file's own describe-level afterEach already
// resets `window.history` for the same reason; this adds the flag reset
// that history alone cannot cover.
afterEach(() => {
  resetTodayMomentsMountTracking();
});

/**
 * #687 finding 1: the URL is the single source of truth for capture/palette
 * overlays, moment sheets, and the selected area. These tests pin that an
 * unknown or duplicate query param never leaves the screen and the URL
 * disagreeing with each other — either the URL gets scrubbed back to what
 * actually renders, or a valid value survives untouched.
 */
describe("TodayMoments — URL and deep-link parameter truth (#687 finding 1)", () => {
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

  // C2-S15 (#687 round-10 judge): the title used to read "that stays owned
  // by the deep-link effect" — accurate before this slice, since the P6
  // deep-link effect was the only thing that ever opened a sheet from a URL
  // param. `resolvedInitialSheet` (TodayMoments.tsx) now resolves this
  // synchronously instead, so the sheet is open on the very first render;
  // the deep-link effect's own `adoptSheetFromUrl(target.sheet)` call still
  // fires on mount too, redundantly (same as it always has for `moment`),
  // but is no longer what makes this assertion true.
  it("does not touch a VALID ?sheet= value", async () => {
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

  // Round-7 judge ("one URL renders two different screens depending on how
  // you arrived at it"): unlike capture, sheet + PALETTE is impossible —
  // MomentSheet and CommandPalette are both full-screen dialogs, so a
  // hand-crafted `?sheet=X&palette=1` used to adopt both, rendering the
  // palette stacked on the sheet. `deepLinkTargetFromParams`'s own precedence
  // (deepLink.ts) now gives sheet the win, matching what the palette itself
  // always hands off to (`runPaletteAction`'s "open-<sheet>" cases close the
  // palette the same tick they open the sheet). The URL used to keep
  // claiming `palette=1` regardless; it must now be scrubbed too, matching
  // this file's own capture+palette scrub just above.
  it("scrubs the losing palette when a sheet is also named — sheet wins, palette never renders", async () => {
    window.history.replaceState(
      null,
      "",
      "/?sheet=plan&palette=1&moment=start",
    );

    renderToday({
      initialMoment: "start",
      deepLink: { moment: "start", sheet: "plan" },
    });

    await waitFor(() => {
      expect(screen.getByTestId("plan-sheet")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();

    await waitFor(() => {
      const params = new URL(window.location.href).searchParams;
      expect(params.get("sheet")).toBe("plan");
      expect(params.get("palette")).toBeNull();
    });
  });

  // Sheet + capture is the pair the scrub deliberately leaves alone (S6's
  // own composition contract) — pinning that finding 2's fix cannot regress
  // into over-scrubbing it. Read the assertion narrowly: it checks that both
  // halves MOUNT, which is all jsdom can see. Which of them the user can
  // actually reach is a paint-order and focus question this test does not
  // touch — #924 settled it (capture renders after every sheet and is the
  // front dialog; an obscured sheet goes `inert`), and `MomentSheet.tsx`'s
  // header is the single place that records it.
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
});

/**
 * #687 C2 gap-1 (F2): the End session form is an in-app state change, so it
 * is URL-visible like every other overlay (`?end=1`, owned by
 * `useOverlayUrlState`). The running session itself lives only on this
 * device, so the form only ever exists over a real running session: a
 * stale `?end=1` is stripped, never rendered.
 *
 * Close-via-`back()` is asserted with a mocked `history.back`, the same
 * pattern this file's header explains (jsdom's async popstate would leak
 * into later tests); the real Back button is pinned in
 * `tests/e2e/session-truth.spec.ts`.
 */
describe("TodayMoments — End session form URL truth (#687 C2 F2)", () => {
  function seedRunningSession() {
    const nowMs = Date.now();
    window.localStorage.setItem(
      "lifeos.running-session",
      JSON.stringify({
        task_id: "seeded-running-task",
        running: true,
        remaining: 1500,
        total: 1500,
        saved_at_ms: nowMs,
        started_at_ms: nowMs,
      }),
    );
  }

  function endParam() {
    return new URL(window.location.href).searchParams.get("end");
  }

  async function openEndForm() {
    await waitFor(() => {
      expect(screen.getByTestId("current-block-hero-done")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("current-block-hero-done"));
    expect(screen.getByTestId("end-session-sheet")).toBeInTheDocument();
  }

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState(null, "", "/?moment=flow");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  it("Done writes ?end=1, keeps ?moment=flow, and adds exactly one history entry", async () => {
    seedRunningSession();
    renderToday({ initialMoment: "flow" });
    await waitFor(() => {
      expect(screen.getByTestId("current-block-hero-done")).toBeInTheDocument();
    });
    const lengthBefore = window.history.length;

    fireEvent.click(screen.getByTestId("current-block-hero-done"));

    expect(screen.getByTestId("end-session-sheet")).toBeInTheDocument();
    expect(endParam()).toBe("1");
    expect(new URL(window.location.href).searchParams.get("moment")).toBe(
      "flow",
    );
    expect(window.history.length).toBe(lengthBefore + 1);
  });

  it("Cancel on a form this tab opened steps back off its own entry", async () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    seedRunningSession();
    renderToday({ initialMoment: "flow" });
    await openEndForm();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByTestId("end-session-sheet")).not.toBeInTheDocument();
    expect(back).toHaveBeenCalledTimes(1);
    expect(endParam()).toBeNull();
  });

  it("Back (popstate without ?end) closes the form and leaves the session running", async () => {
    seedRunningSession();
    renderToday({ initialMoment: "flow" });
    await openEndForm();

    act(() => {
      window.history.replaceState(null, "", "/?moment=flow");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(screen.queryByTestId("end-session-sheet")).not.toBeInTheDocument();
    expect(screen.getByTestId("current-block-hero")).toBeInTheDocument();
    expect(window.localStorage.getItem("lifeos.running-session")).toBeTruthy();
  });

  it("a reload on ?end=1 with a running session reopens the form once the device session loads", async () => {
    seedRunningSession();
    window.history.replaceState(null, "", "/?moment=flow&end=1");

    renderToday({ initialMoment: "flow", deepLink: { moment: "flow" } });

    await waitFor(() => {
      expect(screen.getByTestId("end-session-sheet")).toBeInTheDocument();
    });
    expect(endParam()).toBe("1");
    // A fresh form: nothing typed survives a reload (no draft storage).
    expect(screen.getByTestId("end-session-note")).toHaveValue("");
  });

  it("a stale ?end=1 with no running session is stripped in place — no form, no new entry", async () => {
    window.history.replaceState(null, "", "/?moment=flow&end=1");
    const lengthBefore = window.history.length;

    renderToday({ initialMoment: "flow", deepLink: { moment: "flow" } });

    await waitFor(() => {
      expect(endParam()).toBeNull();
    });
    expect(screen.queryByTestId("end-session-sheet")).not.toBeInTheDocument();
    expect(window.history.length).toBe(lengthBefore);
    expect(new URL(window.location.href).searchParams.get("moment")).toBe(
      "flow",
    );
  });

  it("Forward onto ?end=1 after the session is gone shows no form and strips the param", async () => {
    renderToday({ initialMoment: "flow" });
    await waitFor(() => {
      expect(screen.getByTestId("flow-moment")).toBeInTheDocument();
    });

    act(() => {
      window.history.replaceState(null, "", "/?moment=flow&end=1");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    await waitFor(() => {
      expect(endParam()).toBeNull();
    });
    expect(screen.queryByTestId("end-session-sheet")).not.toBeInTheDocument();
  });

  it("a palette named beside ?end=1 loses exactly as it loses to a sheet", async () => {
    seedRunningSession();
    window.history.replaceState(null, "", "/?moment=flow&end=1&palette=1");

    renderToday({
      initialMoment: "flow",
      deepLink: { moment: "flow", endSession: true },
    });

    await waitFor(() => {
      expect(screen.getByTestId("end-session-sheet")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(
        new URL(window.location.href).searchParams.get("palette"),
      ).toBeNull();
    });
    expect(endParam()).toBe("1");
  });

  it("an invalid ?end= value is scrubbed like any other overlay flag", async () => {
    seedRunningSession();
    window.history.replaceState(null, "", "/?moment=flow&end=bogus");

    renderToday({ initialMoment: "flow", deepLink: { moment: "flow" } });

    await waitFor(() => {
      expect(endParam()).toBeNull();
    });
    expect(screen.queryByTestId("end-session-sheet")).not.toBeInTheDocument();
  });

  it("C from the form opens capture IN FRONT: the end sheet goes inert, both states stay in the URL", async () => {
    seedRunningSession();
    renderToday({ initialMoment: "flow" });
    await openEndForm();

    fireEvent.keyDown(window, { key: "c" });

    expect(screen.getByTestId("capture-overlay")).toBeInTheDocument();
    const endShell = screen
      .getByTestId("end-session-sheet")
      .closest('[data-testid="moment-sheet"]');
    expect(endShell).toHaveAttribute("inert");
    const endDialog = screen
      .getByTestId("end-session-sheet")
      .closest('[role="dialog"]');
    expect(endDialog).not.toHaveAttribute("aria-modal");
    const params = new URL(window.location.href).searchParams;
    expect(params.get("capture")).toBe("1");
    expect(params.get("end")).toBe("1");
  });

  it("Cmd/Ctrl+K from the form says why instead of stacking the palette on it", async () => {
    seedRunningSession();
    renderToday({ initialMoment: "flow" });
    await openEndForm();

    fireEvent.keyDown(window, { key: "k", metaKey: true });

    expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();
    expect(
      new URL(window.location.href).searchParams.get("palette"),
    ).toBeNull();
    expect(screen.getByTestId("today-moments-toast")).toHaveTextContent(
      "Close the sheet to open the command palette",
    );
  });

  it("moment keys do nothing behind the open form (no moment switch under it)", async () => {
    seedRunningSession();
    renderToday({ initialMoment: "flow" });
    await openEndForm();

    fireEvent.keyDown(window, { key: "1" });

    expect(screen.getByTestId("flow-moment")).toBeInTheDocument();
    expect(screen.getByTestId("end-session-sheet")).toBeInTheDocument();
    expect(new URL(window.location.href).searchParams.get("moment")).toBe(
      "flow",
    );
  });

  it("the palette's Done hand-off opens the form and the palette steps out of the URL", async () => {
    seedRunningSession();
    renderToday({ initialMoment: "flow" });
    await waitFor(() => {
      expect(screen.getByTestId("current-block-hero-done")).toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    fireEvent.click(screen.getByTestId("command-palette-option-focus-done"));

    expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();
    expect(screen.getByTestId("end-session-sheet")).toBeInTheDocument();
    const params = new URL(window.location.href).searchParams;
    expect(params.get("end")).toBe("1");
    expect(params.get("palette")).toBeNull();
  });
});

/**
 * #687 C2 F2 round 2 (root review of 647aa68a, finding 1): a Save that is
 * still settling survives Back/Forward as ONE submission. The form reopened
 * by Forward must say "Saving…" instead of offering a fresh editable form,
 * and the settle of an old session must never erase a newer one.
 */
describe("TodayMoments — End session form: a pending save across navigation (#687 C2 F2)", () => {
  function deferredResult() {
    let resolve!: (value: EndSessionResult) => void;
    const promise = new Promise<EndSessionResult>((res) => {
      resolve = res;
    });
    return { promise, resolve };
  }

  async function drainJournal(done: () => boolean) {
    for (let attempt = 0; attempt < 50 && !done(); attempt += 1) {
      await act(async () => {
        await new Promise((resolve) => setImmediate(resolve));
      });
    }
  }

  function goto(url: string) {
    act(() => {
      window.history.replaceState(null, "", url);
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
  }

  /** The real capture -> sort -> accept -> Start path: a real live session. */
  async function startRealSession() {
    renderToday({ initialMoment: "start" });
    fireEvent.click(screen.getByTestId("seed-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("seed-draft-count")).toHaveTextContent("1");
    });
    fireEvent.click(screen.getByTestId("seed-accept"));
    await waitFor(() => {
      expect(screen.getByTestId("first-move-card")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("first-move-start"));
    expect(screen.getByTestId("current-block-hero")).toBeInTheDocument();
  }

  let restoreFetch: () => void = () => {};

  beforeEach(async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState(null, "", "/");
    await clearPendingWrites();
    await clearStoredTaskDrafts();
    endPolicy.calls = 0;
    endPolicy.override = null;
    restoreFetch = stubParseCaptureFetch();
    vi.spyOn(window.history, "back").mockImplementation(() => {});
  });

  afterEach(async () => {
    endPolicy.override = null;
    restoreFetch();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState(null, "", "/");
    await clearPendingWrites();
    await clearStoredTaskDrafts();
  });

  it("REAL persistence: a second Save while the first write is unsettled records exactly one outcome and never closes early", async () => {
    await startRealSession();
    fireEvent.click(screen.getByTestId("current-block-hero-done"));
    fireEvent.click(screen.getByTestId("end-session-outcome-partial"));
    fireEvent.click(screen.getByTestId("end-session-save"));
    // The journal write is awaited on fake-indexeddb, which only settles on
    // `setImmediate` — everything below runs before it can.

    goto("/?moment=flow");
    expect(screen.queryByTestId("end-session-sheet")).not.toBeInTheDocument();
    goto("/?moment=flow&end=1");

    // Truthful: the reopened form is the SAME unsettled save, not a new one.
    expect(screen.getByTestId("end-session-sheet")).toBeInTheDocument();
    expect(screen.getByTestId("end-session-save")).toBeDisabled();
    expect(screen.getByTestId("end-session-save")).toHaveTextContent("Saving…");
    fireEvent.click(screen.getByTestId("end-session-save"));
    expect(endPolicy.calls).toBe(1);

    await drainJournal(
      () =>
        (screen.getByTestId("today-moments-toast").textContent ?? "") !== "",
    );

    const writes = await listPendingWrites("execution_session");
    expect(writes).toHaveLength(1);
    expect(writes[0]!.payload).toMatchObject({ outcome: "partial" });
    expect(screen.getByTestId("today-moments-toast")).not.toHaveTextContent(
      "Nothing was running",
    );
    expect(screen.getByTestId("today-moments-toast")).toHaveTextContent(
      "Partial progress saved",
    );
    expect(screen.queryByTestId("end-session-sheet")).not.toBeInTheDocument();
  });

  it("a deferred policy is launched once across Back, Forward and a second Save", async () => {
    const pending = deferredResult();
    endPolicy.override = () => pending.promise;
    await startRealSession();
    fireEvent.click(screen.getByTestId("current-block-hero-done"));
    fireEvent.click(screen.getByTestId("end-session-save"));
    expect(endPolicy.calls).toBe(1);

    goto("/?moment=flow");
    goto("/?moment=flow&end=1");
    expect(screen.getByTestId("end-session-sheet")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("end-session-save"));
    expect(endPolicy.calls).toBe(1);

    await act(async () => {
      pending.resolve({
        status: "closed",
        resolution: "ordinary",
        save: "local-only",
      });
    });
    expect(screen.queryByTestId("end-session-sheet")).not.toBeInTheDocument();
  });

  it("an aborted save releases the lock: the form stays open and Save can run again", async () => {
    const first = deferredResult();
    endPolicy.override = () => first.promise;
    await startRealSession();
    fireEvent.click(screen.getByTestId("current-block-hero-done"));
    fireEvent.click(screen.getByTestId("end-session-save"));

    await act(async () => {
      first.resolve({ status: "aborted", reason: "missing_decision" });
    });

    expect(screen.getByTestId("end-session-sheet")).toBeInTheDocument();
    expect(screen.getByTestId("end-session-save")).not.toBeDisabled();
    fireEvent.click(screen.getByTestId("end-session-save"));
    expect(endPolicy.calls).toBe(2);
  });

  it("a failed deferral settles once: the form closes with the split truth, and Forward cannot reopen it", async () => {
    const first = deferredResult();
    endPolicy.override = () => first.promise;
    await startRealSession();
    fireEvent.click(screen.getByTestId("current-block-hero-done"));
    fireEvent.click(screen.getByTestId("end-session-save"));

    await act(async () => {
      first.resolve({ status: "split", resolution: "defer_failed" });
    });

    expect(screen.queryByTestId("end-session-sheet")).not.toBeInTheDocument();
    expect(screen.getByTestId("today-moments-toast")).toHaveTextContent(
      "Session saved — deferral failed",
    );
    goto("/?moment=flow&end=1");
    await waitFor(() => {
      expect(new URL(window.location.href).searchParams.get("end")).toBeNull();
    });
    expect(screen.queryByTestId("end-session-sheet")).not.toBeInTheDocument();
    expect(endPolicy.calls).toBe(1);
  });

  it("an old session's late settle never erases a newer running session", async () => {
    const first = deferredResult();
    endPolicy.override = () => first.promise;
    await startRealSession();
    fireEvent.click(screen.getByTestId("current-block-hero-done"));
    fireEvent.click(screen.getByTestId("end-session-save"));

    // Leave the unsettled form and start a new session from Start.
    goto("/?moment=flow");
    fireEvent.keyDown(window, { key: "1" });
    await waitFor(() => {
      expect(screen.getByTestId("first-move-start")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("first-move-start"));
    expect(screen.getByTestId("current-block-hero")).toBeInTheDocument();

    await act(async () => {
      first.resolve({
        status: "closed",
        resolution: "ordinary",
        save: "local-only",
      });
    });

    // The old save's result is still reported truthfully...
    expect(screen.getByTestId("today-moments-toast")).toHaveTextContent(
      "Session complete",
    );
    // ...but the newer session is untouched.
    expect(screen.getByTestId("current-block-hero")).toBeInTheDocument();
    expect(window.localStorage.getItem("lifeos.running-session")).toBeTruthy();
    expect(screen.queryByTestId("end-session-sheet")).not.toBeInTheDocument();
  });
});

/**
 * #687 C2 F2 round 2 (finding 2): ONE parser decides `?end=`. A direct link,
 * the mount scrub and Back/Forward all honor only "1"/"true" — an empty or
 * other value never opens the form on one path while being rejected on
 * another. Capture/palette keep their own (unchanged) popstate parser.
 */
describe("TodayMoments — End session form: one ?end= parser on every path (#687 C2 F2)", () => {
  function seedRunningSession() {
    const nowMs = Date.now();
    window.localStorage.setItem(
      "lifeos.running-session",
      JSON.stringify({
        task_id: "seeded-running-task",
        running: true,
        remaining: 1500,
        total: 1500,
        saved_at_ms: nowMs,
        started_at_ms: nowMs,
      }),
    );
  }

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState(null, "", "/?moment=flow");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  it.each(["", "0", "false", "bogus"])(
    "Back/Forward onto ?end=%s does not open the form",
    async (value) => {
      seedRunningSession();
      renderToday({ initialMoment: "flow" });
      await waitFor(() => {
        expect(screen.getByTestId("current-block-hero")).toBeInTheDocument();
      });

      act(() => {
        window.history.replaceState(null, "", `/?moment=flow&end=${value}`);
        window.dispatchEvent(new PopStateEvent("popstate"));
      });

      expect(screen.queryByTestId("end-session-sheet")).not.toBeInTheDocument();
    },
  );

  it.each(["", "0", "false", "bogus"])(
    "a direct ?end=%s link opens no form and is scrubbed",
    async (value) => {
      seedRunningSession();
      window.history.replaceState(null, "", `/?moment=flow&end=${value}`);

      renderToday({ initialMoment: "flow", deepLink: { moment: "flow" } });

      await waitFor(() => {
        expect(new URL(window.location.href).searchParams.has("end")).toBe(
          false,
        );
      });
      expect(screen.queryByTestId("end-session-sheet")).not.toBeInTheDocument();
    },
  );

  it("Back/Forward onto ?end=true (the other affirmative value) does open it", async () => {
    seedRunningSession();
    renderToday({ initialMoment: "flow" });
    await waitFor(() => {
      expect(screen.getByTestId("current-block-hero")).toBeInTheDocument();
    });

    act(() => {
      window.history.replaceState(null, "", "/?moment=flow&end=true");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(screen.getByTestId("end-session-sheet")).toBeInTheDocument();
  });
});

/**
 * #687 C2 F2 round 2 (finding 3): ONE active sheet. `useSheetUrlState` holds
 * a single `activeSheet`, and the End session form is treated as a sheet.
 * When a valid `?sheet=` is selected (a composed link, a traversal, or
 * capture's "Open triage"), that destination is the active sheet: the form
 * closes and only `end` is removed in place — no `back()`, the running
 * session keeps running, nothing is recorded. Capture still composes over
 * the selected sheet.
 */
describe("TodayMoments — End session form: one active sheet (#687 C2 F2)", () => {
  function seedRunningSession() {
    const nowMs = Date.now();
    window.localStorage.setItem(
      "lifeos.running-session",
      JSON.stringify({
        task_id: "seeded-running-task",
        running: true,
        remaining: 1500,
        total: 1500,
        saved_at_ms: nowMs,
        started_at_ms: nowMs,
      }),
    );
  }

  function activeModalCount() {
    return document.querySelectorAll('[role="dialog"][aria-modal="true"]')
      .length;
  }

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState(null, "", "/?moment=flow");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  it("a direct ?moment=flow&sheet=triage&end=1 selects the sheet: one modal, end removed in place", async () => {
    seedRunningSession();
    window.history.replaceState(null, "", "/?moment=flow&sheet=triage&end=1");
    const lengthBefore = window.history.length;

    renderToday({
      initialMoment: "flow",
      deepLink: { moment: "flow", sheet: "triage", endSession: true },
    });

    await waitFor(() => {
      expect(screen.getByTestId("triage-sheet-empty")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(new URL(window.location.href).searchParams.get("end")).toBeNull();
    });
    expect(screen.queryByTestId("end-session-sheet")).not.toBeInTheDocument();
    expect(activeModalCount()).toBe(1);
    const params = new URL(window.location.href).searchParams;
    expect(params.get("sheet")).toBe("triage");
    expect(params.get("moment")).toBe("flow");
    expect(window.history.length).toBe(lengthBefore);
    expect(window.localStorage.getItem("lifeos.running-session")).toBeTruthy();
  });

  it("Back/Forward onto a composed sheet+end entry selects the sheet the same way", async () => {
    seedRunningSession();
    renderToday({ initialMoment: "flow" });
    await waitFor(() => {
      expect(screen.getByTestId("current-block-hero")).toBeInTheDocument();
    });

    act(() => {
      window.history.replaceState(null, "", "/?moment=flow&sheet=triage&end=1");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("triage-sheet-empty")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(new URL(window.location.href).searchParams.get("end")).toBeNull();
    });
    expect(screen.queryByTestId("end-session-sheet")).not.toBeInTheDocument();
    expect(activeModalCount()).toBe(1);
  });

  it("capture's Open triage from the end form selects Triage: the form closes without back(), the session keeps running", async () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    seedRunningSession();
    renderToday({ initialMoment: "flow" });
    await waitFor(() => {
      expect(screen.getByTestId("current-block-hero-done")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("current-block-hero-done"));
    expect(screen.getByTestId("end-session-sheet")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "c" });
    fireEvent.change(screen.getByTestId("capture-overlay-textarea"), {
      target: { value: "Call the plumber back" },
    });
    fireEvent.keyDown(screen.getByTestId("capture-overlay-textarea"), {
      key: "Enter",
    });
    const openTriage = await screen.findByTestId(
      "today-moments-toast-undo",
      {},
      { timeout: 5000 },
    );
    expect(openTriage).toHaveTextContent("Open triage");
    back.mockClear();

    fireEvent.click(openTriage);

    expect(screen.getByRole("dialog", { name: "Triage" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByTestId("end-session-sheet")).not.toBeInTheDocument();
    });
    expect(activeModalCount()).toBe(1);
    await waitFor(() => {
      expect(new URL(window.location.href).searchParams.get("end")).toBeNull();
    });
    expect(new URL(window.location.href).searchParams.get("sheet")).toBe(
      "triage",
    );
    expect(back).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("lifeos.running-session")).toBeTruthy();
  });
});
