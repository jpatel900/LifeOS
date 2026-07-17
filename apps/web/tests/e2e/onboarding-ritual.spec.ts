import { expect, test } from "@playwright/test";

/**
 * #581 (epic #555 item 7) — the three-step onboarding ritual.
 *
 * Trigger truth (design note): first session with zero areas AND zero
 * captures, deterministic over WorkflowContext state. The demo provider
 * seeds four mock areas into a fresh context, so a *plain* fresh demo load
 * never sees the ritual (second describe below proves that, which is also
 * why every other spec in this suite is unaffected). To produce a genuine
 * zero-state account in demo mode, seed the provider's sessionStorage slot
 * (`lifeos.phase2.workflow`) with an empty-but-valid workflow state before
 * the app boots — the exact shape createInitialWorkflowState() produces,
 * minus the seeded areas/healthChecks. The init script only writes when the
 * slot is empty so the post-ritual state (areas + capture) survives the
 * reload that proves the ritual never re-shows.
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

test.describe("onboarding ritual on a zero-state session (#581)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(
      ([key, value]) => {
        if (!window.sessionStorage.getItem(key)) {
          window.sessionStorage.setItem(key, value);
        }
      },
      [WORKFLOW_STORAGE_KEY, JSON.stringify(ZERO_WORKFLOW_STATE)] as const,
    );
  });

  test("runs areas -> day -> first capture to a truthful home, and never re-shows", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("today-moments")).toBeVisible();
    await expect(page.getByTestId("onboarding-ritual")).toBeVisible();

    // Step 1 — areas: the three prefilled editable chips persist on continue.
    await expect(page.getByTestId("onboarding-step-areas")).toBeVisible();
    await expect(page.getByTestId("onboarding-area-name")).toHaveCount(3);
    await page.getByTestId("onboarding-areas-continue").click();

    // Step 2 — day shape: prefilled 9-17 / 45; continue accepts the
    // prefill. The Google Calendar link-out is present but optional.
    await expect(page.getByTestId("onboarding-step-day")).toBeVisible();
    await expect(page.getByTestId("onboarding-calendar-link")).toBeVisible();
    await page.getByTestId("onboarding-day-continue").click();

    // Step 3 — first capture through the shared CaptureCore, hitting the
    // real /api/parse-capture route (mock parser without AI env).
    await expect(page.getByTestId("onboarding-step-capture")).toBeVisible();
    const parseResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/parse-capture") &&
        response.request().method() === "POST",
    );
    const textarea = page.getByTestId("onboarding-capture-textarea");
    await textarea.fill("Plan the kickoff agenda for Monday");
    await textarea.press("Enter");

    // FR-026 containment: the raw text stays visible through the wait.
    await expect(textarea).toHaveValue("Plan the kickoff agenda for Monday");
    const parseResponse = await parseResponsePromise;
    expect(parseResponse.status()).toBe(200);

    // The ritual closes onto the Start moment, where the #551 state-truth
    // surfaces are the payoff: hero visible, pending-triage badge showing
    // the captured thought.
    await expect(page.getByTestId("onboarding-ritual")).toBeHidden();
    await expect(page.getByTestId("start-moment")).toBeVisible();
    await expect(page.getByTestId("start-hero")).toBeVisible();
    // With no first move queued (zero state), the pending item is PROMOTED
    // into the flagship card (start-pending-triage-card); with a first move
    // it renders as the start-pending-triage line. Either surface is the
    // #551 truth.
    const pendingTriageSurface = page
      .getByTestId("start-pending-triage-card")
      .or(page.getByTestId("start-pending-triage"));
    await expect(pendingTriageSurface).toBeVisible();
    await expect(pendingTriageSurface).toContainText(/waiting for a decision/);

    // Second visit: reload the same context — the ritual never re-shows.
    await page.reload();
    await expect(page.getByTestId("today-moments")).toBeVisible();
    await expect(page.getByTestId("onboarding-ritual")).toHaveCount(0);
  });

  test("every step is skippable and skipping still completes for good", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("onboarding-ritual")).toBeVisible();

    // Skip step 1 (persists the default areas), skip step 2 (keeps app
    // defaults), skip step 3 (no capture required — never a gate).
    await page.getByTestId("onboarding-areas-skip").click();
    await expect(page.getByTestId("onboarding-step-day")).toBeVisible();
    await page.getByTestId("onboarding-day-skip").click();
    await expect(page.getByTestId("onboarding-step-capture")).toBeVisible();
    await page.getByTestId("onboarding-capture-skip").click();

    await expect(page.getByTestId("onboarding-ritual")).toHaveCount(0);
    await expect(page.getByTestId("today-moments")).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("today-moments")).toBeVisible();
    await expect(page.getByTestId("onboarding-ritual")).toHaveCount(0);
  });
});

test.describe("onboarding ritual stays out of the way (#581)", () => {
  test("a plain fresh demo context (seeded areas) never shows the ritual", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("today-moments")).toBeVisible();
    await expect(page.getByTestId("onboarding-ritual")).toHaveCount(0);
  });

  test("Settings offers 'Run setup again', which re-admits the ritual once", async ({
    page,
  }) => {
    await page.goto("/settings/areas");
    // The affordance lives inside a <details> disclosure titled the same.
    await page.locator("summary", { hasText: "Run setup again" }).click();
    await page.getByTestId("onboarding-rerun-button").click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("onboarding-ritual")).toBeVisible();
  });
});
