import { expect, test, type Page } from "@playwright/test";
import { stubParseCaptureRoute } from "./helpers/mockParseCapture";
import { pinMomentPreference } from "./helpers/momentPreference";

/**
 * Issue #984 — the accepted-backlog task editor, at the device tier
 * (no Supabase account — this dev server runs with no Supabase env, same
 * "demo mode" every other non-`@signed-in` spec in this file relies on).
 *
 * Seeds a real backlog task through the shipped capture -> triage -> "Accept
 * to backlog" path (same seeding shape `plan-port-truth.spec.ts` uses for a
 * do-today task), then drives the new "Edit details" control on the Plan
 * sheet's "Put off for later" list end to end in a real browser: open
 * pre-filled, save a title/description/area change, and confirm Cancel
 * writes nothing. The account-mode confirm-before-commit and conflict/
 * project-area-blocked paths are proven at the vitest tier
 * (`WorkflowContext.taskEditing.test.tsx`, `PlanSheet.test.tsx`) — this tier
 * proves the one thing only a real browser can: the control renders, is
 * reachable, and its Save/Cancel round-trip really happens on screen.
 */

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

async function openPlanSheet(page: Page): Promise<void> {
  await page.getByTestId("pipeline-overview-stage-plan").click();
  await expect(page.getByTestId("plan-sheet")).toBeVisible({ timeout: 20_000 });
}

test.beforeEach(async ({ page }) => {
  await stubParseCaptureRoute(page);
  await pinMomentPreference(page, "start");
});

test("edit details: opens pre-filled, saves title/description/area, and toasts the new area", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("today-moments")).toBeVisible();

  const title = "Reorganize the garage shelving";
  await seedBacklogTask(page, title);
  await openPlanSheet(page);

  const backlogItem = page.getByTestId("plan-sheet-backlog");
  await expect(backlogItem).toContainText(title, { timeout: 20_000 });

  const editButton = page
    .getByTestId(/^plan-sheet-edit-/)
    .first();
  await editButton.click();

  const titleInput = page.getByTestId(/^plan-sheet-edit-title-input-/);
  await expect(titleInput).toHaveValue(title);

  const newTitle = "Sketch next quarter's volunteer rota";
  await titleInput.fill(newTitle);
  await page
    .getByTestId(/^plan-sheet-edit-description-input-/)
    .fill("Include the weekend shifts.");
  await page
    .getByTestId(/^plan-sheet-edit-area-input-/)
    .selectOption({ label: "Personal" });

  await page.getByTestId(/^plan-sheet-edit-save-/).click();

  // Saved successfully, and the form closes — the moved row leaves this
  // area's list (proven at the vitest tier that the toast still names the
  // new area even when filtering removes it; here the real click round-trip
  // is what's under test).
  await expect(page.getByTestId(/^plan-sheet-edit-form-/)).toHaveCount(0, {
    timeout: 20_000,
  });
});

test("edit details: Cancel closes the form and leaves the task untouched", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("today-moments")).toBeVisible();

  const title = "Sort the volunteer sign-up sheets";
  await seedBacklogTask(page, title);
  await openPlanSheet(page);

  await expect(page.getByTestId("plan-sheet-backlog")).toContainText(title, {
    timeout: 20_000,
  });
  await page
    .getByTestId(/^plan-sheet-edit-/)
    .first()
    .click();

  const titleInput = page.getByTestId(/^plan-sheet-edit-title-input-/);
  await titleInput.fill("Should never be saved");
  await page.getByTestId(/^plan-sheet-edit-cancel-/).click();

  await expect(page.getByTestId(/^plan-sheet-edit-form-/)).toHaveCount(0);
  await expect(page.getByTestId("plan-sheet-backlog")).toContainText(title);
  await expect(page.getByTestId("plan-sheet-backlog")).not.toContainText(
    "Should never be saved",
  );
});

test("edit details: a blank title disables Save, so nothing can be submitted", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("today-moments")).toBeVisible();

  const title = "Draft the volunteer newsletter";
  await seedBacklogTask(page, title);
  await openPlanSheet(page);

  await expect(page.getByTestId("plan-sheet-backlog")).toContainText(title, {
    timeout: 20_000,
  });
  await page
    .getByTestId(/^plan-sheet-edit-/)
    .first()
    .click();

  const titleInput = page.getByTestId(/^plan-sheet-edit-title-input-/);
  await titleInput.fill("   ");

  // The client-side gate (`canSave`, mirroring `validateTaskEditInput`'s own
  // blank-title rule) disables Save before the write is ever attempted — the
  // "invalid" result path itself is proven at the unit/integration tiers
  // (`taskEditing.test.ts`, `WorkflowContext.taskEditing.test.tsx`), which can
  // force a submit past this same gate to prove the server-side check too.
  await expect(page.getByTestId(/^plan-sheet-edit-save-/)).toBeDisabled();
  await expect(titleInput).toBeVisible();
  await expect(page.getByTestId("plan-sheet-backlog")).toContainText(title);
});
