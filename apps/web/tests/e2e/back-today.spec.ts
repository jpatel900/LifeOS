import { expect, test, type Page } from "@playwright/test";
import { stubParseCaptureRoute } from "./helpers/mockParseCapture";
import { pinMomentPreference } from "./helpers/momentPreference";

/**
 * FR-049 (#1025) — "bring a put-off task back on a chosen day", at the
 * device tier (no Supabase account — same demo-mode convention every other
 * non-`@signed-in` spec in this file relies on).
 *
 * SIMULATED CLOCK
 * ----------------
 * `page.clock.setFixedTime` pins the browser's own JS clock (the one
 * `TodayMoments`' `autoNow` state reads via `new Date()` at mount) — moved
 * forward mid-test, then the page is reloaded so a fresh mount re-derives
 * "today" under the new pinned instant. Every seeded/edited timestamp below
 * is an absolute UTC string relative to `SEED_NOW`, never `Date.now()`.
 *
 * Seeds a real backlog task through the shipped capture -> triage -> "Accept
 * to backlog" path (same seeding shape `backlog-task-editing.spec.ts` uses),
 * sets its "Bring it back on" day through the real editor, then proves the
 * whole loop in a real browser: not shown the day before, shown with its
 * details on the day itself, and "Move to today" removes it from the group.
 */

const SEED_NOW = "2026-09-15T13:00:00.000Z"; // 2026-09-15, a Tuesday.
const DAY_BEFORE_RETURN = "2026-09-16T13:00:00.000Z";
const RETURN_DAY = "2026-09-17T13:00:00.000Z";
const RETURN_DAY_INPUT_VALUE = "2026-09-17";

async function seedBacklogTask(page: Page, text: string): Promise<void> {
  await page.getByTestId("capture-affordance").click();
  await page.getByTestId("capture-overlay-textarea").fill(text);
  await page.getByTestId("capture-overlay-save").click();
  await expect(page.getByTestId("capture-overlay")).toHaveCount(0, {
    timeout: 20_000,
  });

  await page.getByTestId("pipeline-overview-stage-triage").click();
  await expect(page.getByTestId("triage-sheet-captures")).toContainText(text, {
    timeout: 20_000,
  });
  await page
    .getByTestId(/^triage-sheet-sort-/)
    .first()
    .click();
  await expect(page.getByTestId("triage-sheet-list")).toBeVisible({
    timeout: 30_000,
  });
  // "Accept to backlog" — puts the task off for later (status: backlog),
  // exactly the state FR-049's "Bring it back on" editor targets.
  await page
    .getByTestId(/^triage-sheet-accept-/)
    .first()
    .click();
  await expect(page.getByTestId("triage-sheet-empty")).toBeVisible({
    timeout: 30_000,
  });
  await page.getByTestId("moment-sheet-close").click();
  await expect(page.getByTestId("moment-sheet")).toHaveCount(0);
}

async function setReturnDay(page: Page): Promise<void> {
  await page.getByTestId("pipeline-overview-stage-plan").click();
  await expect(page.getByTestId("plan-sheet")).toBeVisible({ timeout: 20_000 });

  await page
    .getByTestId(/^plan-sheet-edit-/)
    .first()
    .click();
  await expect(page.getByTestId(/^plan-sheet-edit-form-/)).toBeVisible();

  await page
    .getByTestId(/^plan-sheet-edit-due-at-input-/)
    .fill(RETURN_DAY_INPUT_VALUE);
  await page.getByTestId(/^plan-sheet-edit-save-/).click();
  await expect(page.getByTestId(/^plan-sheet-edit-form-/)).toHaveCount(0, {
    timeout: 20_000,
  });

  await page.getByTestId("moment-sheet-close").click();
  await expect(page.getByTestId("moment-sheet")).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await stubParseCaptureRoute(page);
  await pinMomentPreference(page, "start");
});

test("Back today: not shown the day before, shown with details on the return day, and Move to today removes it (1280px)", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date(SEED_NOW));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await expect(page.getByTestId("today-moments")).toBeVisible();

  const title = "Call the plumber about the quote";
  const description = "Ask about the weekend rate";
  await seedBacklogTask(page, title);

  // Add a description through the same editor session as the date, so the
  // Back today row's description assertion below is proven end to end
  // rather than seeded directly into storage.
  await page.getByTestId("pipeline-overview-stage-plan").click();
  await expect(page.getByTestId("plan-sheet")).toBeVisible({ timeout: 20_000 });
  await page
    .getByTestId(/^plan-sheet-edit-/)
    .first()
    .click();
  await page
    .getByTestId(/^plan-sheet-edit-description-input-/)
    .fill(description);
  await page
    .getByTestId(/^plan-sheet-edit-due-at-input-/)
    .fill(RETURN_DAY_INPUT_VALUE);
  await page.getByTestId(/^plan-sheet-edit-save-/).click();
  await expect(page.getByTestId(/^plan-sheet-edit-form-/)).toHaveCount(0, {
    timeout: 20_000,
  });
  await page.getByTestId("moment-sheet-close").click();
  await expect(page.getByTestId("moment-sheet")).toHaveCount(0);

  // Not shown today (the seed day, well before the return day).
  await expect(page.getByTestId("start-back-today")).toHaveCount(0);

  // SIMULATED CLOCK: the day before the return day — still not shown.
  await page.clock.setFixedTime(new Date(DAY_BEFORE_RETURN));
  await page.reload();
  await expect(page.getByTestId("today-moments")).toBeVisible();
  await expect(page.getByTestId("start-back-today")).toHaveCount(0);

  // SIMULATED CLOCK: the return day itself — now it appears, with its
  // title, area, and description.
  await page.clock.setFixedTime(new Date(RETURN_DAY));
  await page.reload();
  await expect(page.getByTestId("today-moments")).toBeVisible();

  const backToday = page.getByTestId("start-back-today");
  await expect(backToday).toBeVisible({ timeout: 20_000 });
  await expect(backToday).toContainText(title);
  await expect(backToday).toContainText(description);
  // Plain copy only — no guilt/urgency language (FR-049 non-goal).
  expect((await backToday.textContent())?.toLowerCase()).not.toMatch(
    /overdue|late|behind/,
  );

  const moveButton = page.getByTestId(/^start-back-today-move-/);
  await expect(moveButton).toBeEnabled();
  await moveButton.click();

  // Moving it to today removes it from the group — the whole card, since
  // it was the only item.
  await expect(page.getByTestId("start-back-today")).toHaveCount(0, {
    timeout: 20_000,
  });
});

test("Back today at a 390px mobile viewport: reachable, in view, and Move to today works", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date(SEED_NOW));
  await page.goto("/");
  await expect(page.getByTestId("today-moments")).toBeVisible();

  const title = "Label the seasonal storage bins";
  await seedBacklogTask(page, title);
  await setReturnDay(page);

  await page.clock.setFixedTime(new Date(RETURN_DAY));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByTestId("today-moments")).toBeVisible();

  const backToday = page.getByTestId("start-back-today");
  await expect(backToday).toBeVisible({ timeout: 20_000 });
  await expect(backToday).toContainText(title);

  const moveButton = page.getByTestId(/^start-back-today-move-/);
  await moveButton.scrollIntoViewIfNeeded();
  const box = await moveButton.boundingBox();
  expect(box, "Move to today button: no bounding box").not.toBeNull();
  expect(
    box!.x + box!.width,
    `Move to today button: right edge ${box!.x + box!.width}px exceeds the 390px viewport`,
  ).toBeLessThanOrEqual(390);
  expect(box!.height).toBeGreaterThanOrEqual(44);

  await moveButton.click();
  await expect(page.getByTestId("start-back-today")).toHaveCount(0, {
    timeout: 20_000,
  });
});
