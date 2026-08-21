// #737-A slice 2: closing the day journals the review to IndexedDB before any
// account write. jsdom has no IndexedDB, so without this polyfill the close-day
// path would take the "the device refused to hold it" branch.
import "fake-indexeddb/auto";

import {
  act,
  fireEvent,
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

import {
  pressCaptureShortcut,
  renderToday,
} from "@/__tests__/helpers/todayMomentsHarness";

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
});
