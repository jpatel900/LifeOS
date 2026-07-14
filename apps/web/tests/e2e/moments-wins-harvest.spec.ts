import { expect, test, type Page } from "@playwright/test";

/**
 * S7 (#259) — wins & evidence log, Playwright golden journey.
 *
 * Against `/` (this suite's webServer sets NEXT_PUBLIC_MOMENTS_HOME=true,
 * see playwright.config.ts; live WorkflowContext, mock mode —
 * `createSupabaseBrowserClient()` returns null, so confirm persists nothing
 * over the network and the harvest UI is deterministic). Seeds a
 * WorkflowState with one task completed today (a `completed` calendar block
 * linked to it), then drives the Close moment's harvest step:
 *
 *  1. the completed task surfaces as a win candidate,
 *  2. confirming (with an edited title) moves it into the evidence reading
 *     list and removes it from the pending candidates,
 *  3. skipping dismisses a candidate and logs nothing.
 *
 * Seeding seam is identical to moments-daily-brief.spec.ts: `page.addInitScript`
 * writes a valid `WorkflowState` into sessionStorage (`lifeos.phase2.workflow`)
 * before any app script runs.
 */

const STORAGE_KEY = "lifeos.phase2.workflow";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const AREA_ID = "e2e-area-win";
const TASK_ID = "e2e-task-win";
const BLOCK_ID = "e2e-block-win";

function buildSeedState() {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const daysBefore = (days: number) =>
    new Date(nowMs - days * MS_PER_DAY).toISOString();

  return {
    areas: [
      {
        id: AREA_ID,
        user_id: "e2e-user",
        name: "Work",
        color: "#2563eb",
        created_at: daysBefore(100),
      },
    ],
    captureItems: [],
    taskDrafts: [],
    projectDrafts: [],
    ambiguityAssessments: [],
    timeBlockProposalDrafts: [],
    projects: [],
    tasks: [
      {
        id: TASK_ID,
        user_id: "e2e-user",
        area_id: AREA_ID,
        project_id: null,
        source_capture_item_id: null,
        title: "Shipped onboarding flow",
        description: null,
        status: "done",
        priority_score: null,
        priority_confidence: null,
        task_type: null,
        energy_type: null,
        estimated_minutes_low: null,
        estimated_minutes_high: null,
        due_at: null,
        definition_of_done: null,
        first_tiny_step: null,
        created_at: daysBefore(5),
        updated_at: nowIso,
      },
    ],
    timeBlockProposals: [],
    calendarBlocks: [
      {
        id: BLOCK_ID,
        user_id: "e2e-user",
        area_id: AREA_ID,
        proposal_id: null,
        task_id: TASK_ID,
        google_event_id: null,
        start_at: nowIso,
        end_at: nowIso,
        status: "completed",
        created_at: nowIso,
        updated_at: nowIso,
      },
    ],
    executionSessions: [],
    healthChecks: [],
    reviewLog: [],
    wipRefusal: null,
  };
}

async function openCloseMoment(page: Page) {
  await page.addInitScript(
    ({ key, value }) => {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    },
    { key: STORAGE_KEY, value: buildSeedState() },
  );
  await page.goto("/");
  await expect(page.getByTestId("today-moments")).toBeVisible();
  await page.keyboard.press("3");
  await expect(page.getByTestId("close-moment")).toBeVisible();
}

test.describe("moments wins harvest (/, #259)", () => {
  test("confirms a completed task into the evidence log with an edited title", async ({
    page,
  }) => {
    await openCloseMoment(page);

    const candidate = page.getByTestId(`close-moment-win-${TASK_ID}`);
    await expect(candidate).toBeVisible();

    const titleInput = page.getByTestId(`close-moment-win-title-${TASK_ID}`);
    await expect(titleInput).toHaveValue("Shipped onboarding flow");
    await titleInput.fill("Shipped onboarding flow v2");

    await page.getByTestId(`close-moment-win-confirm-${TASK_ID}`).click();

    await expect(page.getByTestId("close-moment-wins-confirmed")).toContainText(
      "Shipped onboarding flow v2",
    );
    await expect(page.getByTestId(`close-moment-win-${TASK_ID}`)).toHaveCount(
      0,
    );
    await expect(page.getByTestId("close-moment-wins-empty")).toBeVisible();
  });

  test("skips a candidate and logs no win", async ({ page }) => {
    await openCloseMoment(page);

    await expect(page.getByTestId(`close-moment-win-${TASK_ID}`)).toBeVisible();
    await page.getByTestId(`close-moment-win-skip-${TASK_ID}`).click();

    // Nothing logged: the candidate is gone and no confirmed win exists. With
    // neither pending nor confirmed wins, the whole wins card is hidden.
    await expect(page.getByTestId(`close-moment-win-${TASK_ID}`)).toHaveCount(
      0,
    );
    await expect(page.getByTestId("close-moment-wins-confirmed")).toHaveCount(
      0,
    );
    await expect(page.getByTestId("close-moment-wins-pending")).toHaveCount(0);
  });
});
