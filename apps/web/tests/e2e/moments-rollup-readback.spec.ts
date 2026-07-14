import { expect, test, type Page } from "@playwright/test";

/**
 * S8 (#260) — rollup readback UI, Playwright golden journey.
 *
 * Against `/` (this suite's webServer sets NEXT_PUBLIC_MOMENTS_HOME=true,
 * see playwright.config.ts; live WorkflowContext, mock mode — approve
 * persists nothing over the network and the UI is deterministic). Seeds a
 * WorkflowState with this-week completed + missed blocks for one area, then
 * drives the Close moment's weekly-rollup step:
 *
 *  1. the area's weekly rollup draft (highlights + misses) surfaces,
 *  2. approving moves it into the week-over-week readback and off the pending
 *     list,
 *  3. dismissing removes the draft and approves nothing.
 *
 * Same sessionStorage seeding seam as moments-wins-harvest.spec.ts.
 */

const STORAGE_KEY = "lifeos.phase2.workflow";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const AREA_ID = "e2e-area-rollup";
const DONE_TASK_ID = "e2e-task-rollup-done";
const MISS_TASK_ID = "e2e-task-rollup-miss";
const BLOCK_DONE = "e2e-block-rollup-done";
const BLOCK_MISS = "e2e-block-rollup-miss";

function buildSeedState() {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const daysBefore = (days: number) =>
    new Date(nowMs - days * MS_PER_DAY).toISOString();

  const task = (id: string, title: string, status: string) => ({
    id,
    user_id: "e2e-user",
    area_id: AREA_ID,
    project_id: null,
    source_capture_item_id: null,
    title,
    description: null,
    status,
    priority_score: null,
    priority_confidence: null,
    task_type: null,
    energy_type: null,
    estimated_minutes_low: null,
    estimated_minutes_high: null,
    due_at: null,
    definition_of_done: null,
    first_tiny_step: null,
    created_at: daysBefore(10),
    updated_at: nowIso,
  });

  const block = (id: string, taskId: string, status: string, at: string) => ({
    id,
    user_id: "e2e-user",
    area_id: AREA_ID,
    proposal_id: null,
    task_id: taskId,
    google_event_id: null,
    start_at: at,
    end_at: at,
    status,
    created_at: at,
    updated_at: at,
  });

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
      task(DONE_TASK_ID, "Shipped onboarding flow", "done"),
      task(MISS_TASK_ID, "Skipped the review", "active"),
    ],
    timeBlockProposals: [],
    calendarBlocks: [
      block(BLOCK_DONE, DONE_TASK_ID, "completed", nowIso),
      block(BLOCK_MISS, MISS_TASK_ID, "missed", daysBefore(2)),
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

test.describe("moments rollup readback (/, #260)", () => {
  test("approves the weekly rollup draft into the readback", async ({
    page,
  }) => {
    await openCloseMoment(page);

    const draft = page.getByTestId(`close-moment-rollup-${AREA_ID}`);
    await expect(draft).toBeVisible();
    await expect(draft).toContainText("Shipped onboarding flow");
    await expect(draft).toContainText("Skipped the review");

    await page.getByTestId(`close-moment-rollup-approve-${AREA_ID}`).click();

    await expect(
      page.getByTestId("close-moment-rollups-approved"),
    ).toContainText("Work");
    await expect(
      page.getByTestId(`close-moment-rollup-${AREA_ID}`),
    ).toHaveCount(0);
  });

  test("dismisses the weekly rollup draft, approving nothing", async ({
    page,
  }) => {
    await openCloseMoment(page);

    await expect(
      page.getByTestId(`close-moment-rollup-${AREA_ID}`),
    ).toBeVisible();
    await page.getByTestId(`close-moment-rollup-dismiss-${AREA_ID}`).click();

    await expect(
      page.getByTestId(`close-moment-rollup-${AREA_ID}`),
    ).toHaveCount(0);
    await expect(page.getByTestId("close-moment-rollups-approved")).toHaveCount(
      0,
    );
  });
});
