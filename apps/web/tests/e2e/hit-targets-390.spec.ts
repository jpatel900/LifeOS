import { expect, test } from "@playwright/test";
import { stubParseCaptureRoute } from "./helpers/mockParseCapture";

// HIGH-1 (#670): /api/parse-capture requires a verified bearer token and the
// E2E dev server has no Supabase env, so every capture flow in this file runs
// against the deterministic mock-parser stub (task-map lifecycle precedent).
test.beforeEach(async ({ page }) => {
  await stubParseCaptureRoute(page);
});

/**
 * #594 — audit-remediation follow-up to #604-#611: verifies the >=44x44 CSS
 * px hit-target contract (docs/UX_FLOWS.md / hitTarget.ts) actually holds at
 * a real 390px viewport, geometrically, for the controls the earlier
 * remediation left at 32-40px (CaptureCore.tsx, OnboardingRitual.tsx).
 *
 * This is the geometric proof the className-level unit tests (CaptureCore
 * .test.tsx, OnboardingRitual.test.tsx "44px hit targets (#594)" describes)
 * cannot give — jsdom never computes layout, so a real Chromium viewport is
 * required to assert `boundingBox().height/width >= 44`. Reachable-by-e2e
 * scope only: the degraded (retry-mock/keep-raw) and conclusion controls in
 * CaptureCore are covered by the unit tests instead, since the mock parser
 * this suite runs against never fails a parse.
 *
 * Also asserts no horizontal overflow is introduced at 390px by any control
 * growing to the 44px floor (the onboarding area row is the tightest fit:
 * color swatch + name input + Remove button, no wrap).
 */

const WORKFLOW_STORAGE_KEY = "lifeos.phase2.workflow";

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

async function assertNoHorizontalOverflow(
  page: import("@playwright/test").Page,
) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth };
  });
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
}

async function assertAtLeast44(
  page: import("@playwright/test").Page,
  testId: string,
) {
  const box = await page.getByTestId(testId).boundingBox();
  expect(box, `${testId} should be visible with a bounding box`).not.toBeNull();
  expect(box!.height, `${testId} height`).toBeGreaterThanOrEqual(44);
  expect(box!.width, `${testId} width`).toBeGreaterThanOrEqual(44);
}

async function assertButtonAtLeast44(
  page: import("@playwright/test").Page,
  name: string | RegExp,
  options?: { exact?: boolean },
) {
  const box = await page
    .getByRole("button", { name, exact: options?.exact })
    .first()
    .boundingBox();
  expect(
    box,
    `"${name}" button should be visible with a bounding box`,
  ).not.toBeNull();
  expect(box!.height, `"${name}" button height`).toBeGreaterThanOrEqual(44);
  expect(box!.width, `"${name}" button width`).toBeGreaterThanOrEqual(44);
}

test.describe("44px hit-target inventory at 390px (#594) — onboarding", () => {
  // Zero-state seed (mirrors onboarding-ritual.spec.ts): the ritual only
  // ever shows with zero areas AND zero captures.
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(
      ([key, value]) => {
        if (!window.sessionStorage.getItem(key)) {
          window.sessionStorage.setItem(key, value);
        }
      },
      [WORKFLOW_STORAGE_KEY, JSON.stringify(ZERO_WORKFLOW_STATE)] as const,
    );
  });

  test("onboarding step 1 (areas) controls meet the 44px floor with no horizontal overflow", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("onboarding-step-areas")).toBeVisible();

    await assertAtLeast44(page, "onboarding-area-add");
    await assertAtLeast44(page, "onboarding-areas-skip");
    await assertAtLeast44(page, "onboarding-areas-continue");

    const colorSwatches = page.getByTestId("onboarding-area-color");
    const removeButtons = page.getByTestId("onboarding-area-remove");
    const count = await colorSwatches.count();
    for (let i = 0; i < count; i += 1) {
      const swatchBox = await colorSwatches.nth(i).boundingBox();
      expect(swatchBox!.height).toBeGreaterThanOrEqual(44);
      expect(swatchBox!.width).toBeGreaterThanOrEqual(44);
      const removeBox = await removeButtons.nth(i).boundingBox();
      expect(removeBox!.height).toBeGreaterThanOrEqual(44);
      expect(removeBox!.width).toBeGreaterThanOrEqual(44);
    }

    // The tightest row on the page: swatch + name input + Remove, no wrap.
    await assertNoHorizontalOverflow(page);
  });

  test("onboarding step 2 (day shape) controls meet the 44px floor with no horizontal overflow", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("onboarding-areas-skip").click();
    await expect(page.getByTestId("onboarding-step-day")).toBeVisible();

    await assertAtLeast44(page, "onboarding-day-start");
    await assertAtLeast44(page, "onboarding-day-end");
    await assertAtLeast44(page, "onboarding-session-25");
    await assertAtLeast44(page, "onboarding-session-45");
    await assertAtLeast44(page, "onboarding-session-60");
    await assertAtLeast44(page, "onboarding-day-skip");
    await assertAtLeast44(page, "onboarding-day-continue");

    await assertNoHorizontalOverflow(page);
  });

  test("onboarding step 3 (capture) idle controls meet the 44px floor with no horizontal overflow", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("onboarding-areas-skip").click();
    await page.getByTestId("onboarding-day-skip").click();
    await expect(page.getByTestId("onboarding-step-capture")).toBeVisible();

    // Type text so the save controls are enabled (save/save-raw are
    // disabled, not hidden, while empty — bounding boxes are unaffected).
    await page.getByTestId("onboarding-capture-textarea").fill("Draft note");

    await assertAtLeast44(page, "onboarding-capture-save");
    await assertAtLeast44(page, "onboarding-capture-save-raw");
    await assertAtLeast44(page, "onboarding-capture-skip");

    await assertNoHorizontalOverflow(page);
  });
});

test.describe("44px hit-target inventory at 390px (#594) — /capture route", () => {
  // #687: this legacy cockpit surface is only reachable under the #590
  // rollback config (NEXT_PUBLIC_MOMENTS_HOME=false for server AND runner);
  // the route redirects to the moments home otherwise. AGENT-TODO(#687):
  // migrate to the moments surfaces, then retire with the legacy code.
  test.skip(
    process.env.NEXT_PUBLIC_MOMENTS_HOME !== "false",
    "#687: legacy cockpit route redirects under the shipping config",
  );

  // No zero-state seed here: the demo provider's default seeded areas keep
  // CaptureView's textarea enabled (disabledReason only fires with zero
  // areas — that path is exercised by the onboarding describe above, whose
  // own capture step already covers a disabled-then-enabled textarea).
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test("the /capture route's CaptureCore idle controls meet the 44px floor with no horizontal overflow", async ({
    page,
  }) => {
    await page.goto("/capture");
    await expect(page.getByTestId("capture-page-core")).toBeVisible();

    await page.getByTestId("capture-page-textarea").fill("Draft note");
    await page.getByTestId("capture-page-return-hook").fill("the standup");

    await assertAtLeast44(page, "capture-page-return-hook");
    await assertAtLeast44(page, "capture-page-save");
    await assertAtLeast44(page, "capture-page-save-raw");

    await assertNoHorizontalOverflow(page);
  });
});

/**
 * #615 — bounded follow-on to #594: verifies the same >=44x44 CSS px
 * hit-target contract at 390px for the legacy cockpit stage screens
 * (PlanView.tsx, ReviewView.tsx). Reachable-by-e2e scope only: PlanView's
 * launch-step prompt (missing first_tiny_step), backlog "Move to today",
 * and sourced-recalibration Use/Keep buttons, StatusBanners' parse-retry
 * and WIP-refusal controls, ReviewView's Defer/Drop/policy-proposal
 * buttons, and TriageView's "Not this person" control are all unreachable
 * through the demo-mode mock parser/WIP-limit/override-threshold in a
 * single run — those get className-level unit-test coverage instead (see
 * PlanView.test.tsx, StatusBanners.test.tsx, TriageView.test.tsx, and the
 * "#615" describes in learningLoopSurfaces.test.tsx).
 */

async function goToStage(page: import("@playwright/test").Page, stage: RegExp) {
  await page
    .getByRole("navigation", { name: "Workflow stages" })
    .getByRole("button", { name: stage })
    .click();
}

async function captureTask(
  page: import("@playwright/test").Page,
  title: string,
) {
  await page.goto("/capture");
  await page.getByPlaceholder("Drop the thought here.").fill(title);
  await page.getByRole("button", { name: "Save thought" }).click();
  await expect(page).toHaveURL(/\/triage$/, { timeout: 30_000 });
}

test.describe("44px hit-target inventory at 390px (#615) — Plan stage", () => {
  // #687: this legacy cockpit surface is only reachable under the #590
  // rollback config (NEXT_PUBLIC_MOMENTS_HOME=false for server AND runner);
  // the route redirects to the moments home otherwise. AGENT-TODO(#687):
  // migrate to the moments surfaces, then retire with the legacy code.
  test.skip(
    process.env.NEXT_PUBLIC_MOMENTS_HOME !== "false",
    "#687: legacy cockpit route redirects under the shipping config",
  );

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test("Plan stage's proposal controls meet the 44px floor with no horizontal overflow", async ({
    page,
  }) => {
    const title = "Plan 44px repair item";
    await captureTask(page, title);
    await page.getByRole("button", { name: "Do today" }).click();
    await goToStage(page, /Plan/);

    // The parse-created proposal is pending — Accept local/Move
    // later/Reject are all live on it without any further action.
    await assertButtonAtLeast44(page, "Accept local", { exact: true });
    await assertButtonAtLeast44(page, "Move later");
    await assertButtonAtLeast44(page, "Reject");

    // Selecting the task enables Draft block.
    await page.getByRole("button", { name: new RegExp(`^${title}`) }).click();
    await assertButtonAtLeast44(page, "Draft block");

    await assertNoHorizontalOverflow(page);
  });
});

test.describe("44px hit-target inventory at 390px (#615) — Review stage", () => {
  // #687: this legacy cockpit surface is only reachable under the #590
  // rollback config (NEXT_PUBLIC_MOMENTS_HOME=false for server AND runner);
  // the route redirects to the moments home otherwise. AGENT-TODO(#687):
  // migrate to the moments surfaces, then retire with the legacy code.
  test.skip(
    process.env.NEXT_PUBLIC_MOMENTS_HOME !== "false",
    "#687: legacy cockpit route redirects under the shipping config",
  );

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test("Review stage's recovery-queue Carry forward control meets the 44px floor with no horizontal overflow", async ({
    page,
  }) => {
    const title = "Review 44px repair item";
    await captureTask(page, title);
    await page.getByRole("button", { name: "Do today" }).click();
    await goToStage(page, /Plan/);
    await page.getByRole("button", { name: new RegExp(`^${title}`) }).click();
    // #580: below `sm:` empty hour rows collapse behind a disclosure — reveal
    // them before placing at 8am.
    await page.getByTestId("show-empty-hours-toggle").click();
    await page.getByRole("button", { name: /8a\s+Drop here/ }).click();
    await page.getByRole("button", { name: "Start focusing" }).click();
    await expect(page).toHaveURL(/\/execute$/, { timeout: 15_000 });
    await page.getByRole("button", { name: new RegExp(title) }).click();
    await page.getByTestId("cockpit-end-session").click();
    await page.getByTestId("end-session-outcome-stuck").click();
    await page.getByTestId("end-session-save").click();
    await expect(page).toHaveURL(/\/review$/, { timeout: 15_000 });

    await assertButtonAtLeast44(page, "Carry forward");

    await assertNoHorizontalOverflow(page);
  });
});
