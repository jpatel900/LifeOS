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
 * overlay, the triage and plan sheets, the command palette, `/calendar`,
 * `/health`, `/areas`, `/settings/areas`, `/login`, and all three onboarding
 * ritual steps.
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
    },
  },
  {
    id: "close-moment",
    async goto(page) {
      await page.goto("/?moment=close");
      await expect(page.getByTestId("close-moment")).toBeVisible();
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
    id: "calendar",
    async goto(page) {
      await page.goto("/calendar");
      await expect(
        page.getByRole("heading", { name: "Hour rail" }),
      ).toBeVisible();
    },
  },
  {
    id: "health",
    async goto(page) {
      await page.goto("/health");
      await expect(
        page.getByRole("heading", {
          name: /Everything is working|\d+ things? needs? a look/,
        }),
      ).toBeVisible();
    },
  },
  {
    id: "areas",
    async goto(page) {
      await page.goto("/areas");
      await expect(
        page.getByRole("heading", { name: "All areas overview" }),
      ).toBeVisible();
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
