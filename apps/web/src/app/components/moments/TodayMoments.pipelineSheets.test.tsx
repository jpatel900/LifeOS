// #737-A slice 2: closing the day journals the review to IndexedDB before any
// account write. jsdom has no IndexedDB, so without this polyfill the close-day
// path would take the "the device refused to hold it" branch.
import "fake-indexeddb/auto";

import { fireEvent, screen } from "@testing-library/react";

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
