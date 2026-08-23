import { expect, type Page } from "@playwright/test";
import { pinMomentPreference } from "./momentPreference";

/**
 * Final UX Loop C5 (Target Cards 8+9) — the surface inventory both pins
 * (a11y-axe-pin.spec.ts, hit-target-overlap-pin.spec.ts) walk.
 *
 * Every entry is reachable signed out / in local mode — the E2E dev server
 * carries no Supabase env (HIGH-1 / #670), so every route in this file is
 * already the "no account" surface docs/design/ux-audit-2026-07-26-fable.md
 * measured. Nothing here seeds a real session, a placed block, or a
 * completed capture: that would touch WorkflowContext/execute/session state
 * this lane does not own (see the lane contract). What IS covered mirrors
 * the audit's own drive list closely: `/` at all three moments, the capture
 * overlay, the triage/plan/review/health/areas sheets, the command palette,
 * `/settings/areas`, `/login`, and all three onboarding ritual steps.
 *
 * C2-S6 (#687): `calendar` / `health` / `areas` (the legacy routes) were
 * replaced 1:1 by `review-sheet` / `health-sheet` / `areas-sheet` (the
 * moments-native surfaces they redirect to now) — the legacy routes
 * themselves are gone as surfaces to measure, not merely renamed, because
 * measuring a redirect shim's landing page IS measuring the sheet.
 *
 * Deliberately NOT covered (documented, not silently dropped): the
 * end-of-session sheet and any surface that requires a placed block or a
 * completed focus session to reach. Reaching those honestly needs the
 * capture -> sort -> place -> start -> end journey already exercised in
 * moments-home-parity.spec.ts and hit-targets-390.spec.ts; wiring that into
 * a geometry/axe pin is real, separable follow-up work
 * (AGENT-TODO in the PR body), not a silent gap in this ratchet's promise.
 */

/**
 * Both pins MUST call this before any surface's `goto`.
 *
 * Four surfaces below (`capture-overlay`, `triage-sheet`, `plan-sheet`,
 * `command-palette`) carry no `?moment=` param — they are an overlay or a
 * sheet ON TOP OF whatever moment the Today surface has chosen. Left to the
 * clock, that underlying moment is `start` before 11:00 local, `close` from
 * 17:00 local, and `flow`/`start` in between (`TodayMoments.tsx`'s
 * `heuristicMoment`). The four baselines in `a11y-axe-pin.spec.ts` were
 * measured over START; on a UTC CI runner after 17:00Z the same four surfaces
 * render CLOSE underneath and count one extra `#ffffff`-on-`#6d8bff` node,
 * which is exactly how they went red on merged main (PR #770's run).
 *
 * Pinning START here does not shrink what these pins cover: `start-moment`,
 * `flow-moment` and `close-moment` are each still walked explicitly via
 * `?moment=`, on both viewports. It only makes "the capture overlay" name one
 * surface instead of three.
 */
export async function preparePinnedSurfaces(page: Page): Promise<void> {
  await pinMomentPreference(page, "start");
}

/**
 * `flow-moment` / `close-moment` readiness — waits for the switcher's OWN
 * selected state, not just the panel.
 *
 * #687 comment 5199011727 (PR #844's addendum, comment 5199013720) root-caused
 * an intermittent under-count on `a11y-axe-pin.spec.ts`'s strict-equality
 * ratchet: `flow-moment`/`close-moment` navigate via `?moment=flow|close`,
 * but `TodayMoments.tsx` starts its `moment` state from the clock/pinned
 * preference ("start") and only reconciles it to the URL's `deepLink.moment`
 * in an effect that runs after mount — so the panel (`getByTestId(surface.id)`)
 * and the moment-switcher's active tab can settle on different paints. The
 * axe scan (`axeScan.ts`) walks whatever is in the DOM the instant it runs;
 * landing between those two paints silently drops the active tab node (one
 * of the pinned violation nodes) from the count. Two precedent CI events hit
 * exactly this shape: run 31056031203 (desktop, `flow-moment`, 3 -> 2 nodes)
 * and run 30878810487 (2026-08-04, mobile sibling, `flow-moment`, 2 -> 1
 * node) — both on commits that never touched this surface, with
 * byte-identical baselines either side.
 *
 * Below the `sm` breakpoint (640px — Tailwind's default, and the same cutoff
 * `BottomNavigator.tsx`'s `sm:hidden` / `TodayMoments.tsx`'s
 * `hidden sm:contents` split already uses; see also the literal 640 used the
 * same way in moments-home-parity.spec.ts) the header's `MomentSwitcher` is
 * `display:none` and `BottomNavigator` renders a second instance
 * (`idPrefix="bottom-nav"`, testid `moment-switcher-bottom-nav-<moment>` —
 * MomentSwitcher.tsx) instead. The mobile precedent above hit the race on
 * that instance, so both are covered here.
 *
 * This only changes WHEN the scan is allowed to run — it does not touch what
 * it expects. The pinned baselines and `TOTAL_VIOLATION_NODES_PINNED` in
 * a11y-axe-pin.spec.ts are unchanged by this wait.
 */
async function waitForSelectedMomentTab(
  page: Page,
  moment: "flow" | "close",
): Promise<void> {
  const width = page.viewportSize()?.width ?? 0;
  const testId =
    width < 640
      ? `moment-switcher-bottom-nav-${moment}`
      : `moment-switcher-${moment}`;
  await expect(page.getByTestId(testId)).toHaveAttribute(
    "aria-selected",
    "true",
  );
}

export const VIEWPORTS = [
  // Matches the audit's own two viewports exactly (docs/design/ux-audit-
  // 2026-07-26-fable.md: "Chromium at 1440x1000 and 390x844").
  { id: "desktop", width: 1440, height: 1000 },
  { id: "mobile", width: 390, height: 844 },
] as const;

export type ViewportId = (typeof VIEWPORTS)[number]["id"];

export interface PinnedSurface {
  /** Stable slug — used in test titles and (for now/future) per-surface baselines. */
  id: string;
  /** Navigates to the surface and waits for it to be visibly ready. */
  goto(page: Page): Promise<void>;
}

const WORKFLOW_STORAGE_KEY = "lifeos.phase2.workflow";

// Mirrors onboarding-ritual.spec.ts / hit-targets-390.spec.ts exactly: the
// ritual only ever shows with zero areas AND zero captures in the demo
// provider's state.
const ZERO_WORKFLOW_STATE = {
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
};

async function seedZeroWorkflowState(page: Page) {
  await page.addInitScript(
    ([key, value]) => {
      if (!window.sessionStorage.getItem(key)) {
        window.sessionStorage.setItem(key, value);
      }
    },
    [WORKFLOW_STORAGE_KEY, JSON.stringify(ZERO_WORKFLOW_STATE)] as const,
  );
}

export const PINNED_SURFACES: PinnedSurface[] = [
  {
    id: "login",
    async goto(page) {
      await page.goto("/login");
      await expect(
        page.getByRole("heading", { name: "Sign in" }),
      ).toBeVisible();
    },
  },
  {
    // #687 fix (Part of #687): the App Router's own not-found.tsx boundary —
    // reachable by requesting any unrouted path, and previously absent from
    // this list entirely, which is exactly how its own "Go to Today" escape
    // hatch shipped at the shadcn Button default (h-10/40px) unmeasured. The
    // fix (size="lg", same idiom as /login's identical escape hatch, commit
    // 506328c1) is already in place, so this entry is pinned at its
    // POST-FIX, honestly-measured 0/0 rather than baking the violation in.
    id: "not-found",
    async goto(page) {
      await page.goto("/this-path-does-not-exist-687");
      await expect(
        page.getByRole("heading", { name: "Page not found" }),
      ).toBeVisible();
    },
  },
  {
    id: "start-moment",
    async goto(page) {
      await page.goto("/?moment=start");
      await expect(page.getByTestId("start-moment")).toBeVisible();
    },
  },
  {
    id: "flow-moment",
    async goto(page) {
      await page.goto("/?moment=flow");
      await expect(page.getByTestId("flow-moment")).toBeVisible();
      await waitForSelectedMomentTab(page, "flow");
    },
  },
  {
    id: "close-moment",
    async goto(page) {
      await page.goto("/?moment=close");
      await expect(page.getByTestId("close-moment")).toBeVisible();
      await waitForSelectedMomentTab(page, "close");
    },
  },
  {
    id: "capture-overlay",
    async goto(page) {
      await page.goto("/?capture=1");
      await expect(
        page.getByRole("dialog", { name: "Capture a thought" }),
      ).toBeVisible();
    },
  },
  {
    id: "triage-sheet",
    async goto(page) {
      await page.goto("/?sheet=triage");
      await expect(page.getByTestId("moment-sheet-dialog")).toBeVisible();
    },
  },
  {
    id: "plan-sheet",
    async goto(page) {
      await page.goto("/?sheet=plan");
      await expect(page.getByTestId("plan-sheet")).toBeVisible();
    },
  },
  {
    id: "command-palette",
    async goto(page) {
      await page.goto("/?palette=1");
      await expect(page.getByTestId("command-palette")).toBeVisible();
    },
  },
  {
    // C2-S6 (#687): the `calendar` row that used to sit here is GONE —
    // `/calendar` is a redirect shim to `?sheet=plan` now, and `plan-sheet`
    // above already covers that surface, so there is nothing left to add a
    // row for. `review-sheet` / `health-sheet` / `areas-sheet` below are the
    // 1:1 replacements for the old `calendar` / `health` / `areas` legacy
    // rows: same readiness-wait pattern as `triage-sheet` / `plan-sheet`
    // above (wait for the sheet's own testid), and the same shared moment pin
    // every surface in this file already gets from `preparePinnedSurfaces` in
    // each spec's `beforeEach` — the two recorded CI races this file's header
    // documents were both about WHICH moment underlies a sheet, not whether
    // one is pinned, and `triage-sheet`/`plan-sheet` never needed a second,
    // surface-local pin beyond that global one, so neither do these three.
    id: "review-sheet",
    async goto(page) {
      await page.goto("/?sheet=review");
      await expect(page.getByTestId("review-sheet")).toBeVisible();
    },
  },
  {
    id: "health-sheet",
    async goto(page) {
      await page.goto("/?sheet=health");
      await expect(page.getByTestId("health-sheet")).toBeVisible();
    },
  },
  {
    id: "areas-sheet",
    async goto(page) {
      await page.goto("/?sheet=areas");
      await expect(page.getByTestId("areas-sheet")).toBeVisible();
    },
  },
  {
    id: "settings-areas",
    async goto(page) {
      await page.goto("/settings/areas");
      await expect(
        page.getByRole("heading", { level: 1, name: "Areas" }),
      ).toBeVisible({ timeout: 15_000 });
    },
  },
  {
    id: "onboarding-areas",
    async goto(page) {
      await seedZeroWorkflowState(page);
      await page.goto("/");
      await expect(page.getByTestId("onboarding-step-areas")).toBeVisible();
    },
  },
  {
    id: "onboarding-day",
    async goto(page) {
      await seedZeroWorkflowState(page);
      await page.goto("/");
      await expect(page.getByTestId("onboarding-step-areas")).toBeVisible();
      await page.getByTestId("onboarding-areas-skip").click();
      await expect(page.getByTestId("onboarding-step-day")).toBeVisible();
    },
  },
  {
    id: "onboarding-capture",
    async goto(page) {
      await seedZeroWorkflowState(page);
      await page.goto("/");
      await expect(page.getByTestId("onboarding-step-areas")).toBeVisible();
      await page.getByTestId("onboarding-areas-skip").click();
      await expect(page.getByTestId("onboarding-step-day")).toBeVisible();
      await page.getByTestId("onboarding-day-skip").click();
      await expect(page.getByTestId("onboarding-step-capture")).toBeVisible();
    },
  },
];
