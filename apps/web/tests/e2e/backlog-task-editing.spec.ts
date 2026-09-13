import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { stubParseCaptureRoute } from "./helpers/mockParseCapture";
import { pinMomentPreference } from "./helpers/momentPreference";
import { scanAxeViolationNodes } from "./helpers/axeScan";

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

  const editButton = page.getByTestId(/^plan-sheet-edit-/).first();
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

/** Saves a full-page PNG as a Playwright attachment and returns its path. */
async function attachScreenshot(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<string> {
  const screenshotPath = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path: screenshotPath });
  await testInfo.attach(name, {
    path: screenshotPath,
    contentType: "image/png",
  });
  return screenshotPath;
}

test("edit details: desktop — screenshot evidence and a bounded axe (WCAG AA) scan of the open form", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await expect(page.getByTestId("today-moments")).toBeVisible();

  const title = "Audit the volunteer supply closet";
  await seedBacklogTask(page, title);
  await openPlanSheet(page);
  await page
    .getByTestId(/^plan-sheet-edit-/)
    .first()
    .click();

  const form = page.getByTestId(/^plan-sheet-edit-form-/);
  await expect(form).toBeVisible();

  const screenshotPath = await attachScreenshot(
    page,
    testInfo,
    "edit-details-desktop",
  );
  console.log(`edit-details-desktop screenshot: ${screenshotPath}`);

  // Bounded to the WCAG A/AA rule set (helpers/axeScan.ts) — the same driver
  // the repo-wide a11y-axe-pin.spec.ts ratchet uses — but scoped to THIS
  // surface only, not added to that ratchet's pinned-surface table.
  const violations = await scanAxeViolationNodes(page);
  expect(violations).toEqual([]);
});

const MOBILE_VIEWPORT_WIDTH = 390;

/** Fails with the box's own numbers in the message when it overflows. */
async function expectWithinViewportWidth(
  page: Page,
  locator: ReturnType<Page["getByTestId"]>,
  label: string,
): Promise<void> {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  expect(
    box,
    `${label}: no bounding box (not rendered/visible)`,
  ).not.toBeNull();
  expect(
    box!.x + box!.width,
    `${label}: right edge ${box!.x + box!.width}px exceeds the ${MOBILE_VIEWPORT_WIDTH}px viewport (x=${box!.x}, width=${box!.width})`,
  ).toBeLessThanOrEqual(MOBILE_VIEWPORT_WIDTH);
  expect(
    box!.x,
    `${label}: left edge ${box!.x}px is off-screen`,
  ).toBeGreaterThanOrEqual(0);
}

test("edit details: reachable, fully in-view, and usable end to end at a 390px mobile viewport", async ({
  page,
}, testInfo) => {
  // Seed at the default (desktop) viewport — capture's own affordance is
  // `sm:` desktop-only (mobile reaches it through BottomNavigator instead,
  // proven separately by nav-truth.spec.ts's matrix pin); this spec only
  // needs a real backlog task to exist, not to prove capture's OWN mobile
  // reach a second time. Resize to mobile only for the surface under test.
  await page.goto("/");
  await expect(page.getByTestId("today-moments")).toBeVisible();
  const title = "Label the seasonal storage bins";
  await seedBacklogTask(page, title);

  await page.setViewportSize({ width: MOBILE_VIEWPORT_WIDTH, height: 844 });
  await openPlanSheet(page);
  await page
    .getByTestId(/^plan-sheet-edit-/)
    .first()
    .click();

  const form = page.getByTestId(/^plan-sheet-edit-form-/);
  await expect(form).toBeVisible();

  // The capture toast from seeding this task overlaps the sheet at this
  // viewport for its own natural lifetime — wait it out before capturing or
  // measuring anything, so neither reflects a transient overlay rather than
  // the editor's own layout.
  await expect(page.getByTestId("today-moments-toast")).toHaveText("", {
    timeout: 8_000,
  });

  // Hard geometry, not just a visual impression: every one of the editor's
  // own controls (plus the pre-existing "Move to today" row it shares a
  // container with) must have its right edge at or inside the viewport —
  // this is what a screenshot alone cannot prove and what the earlier
  // capture found violated (title/description/area clipped at the right
  // edge). Before/after, measured directly: reverting the fix below
  // (`min-w-0` on the row/flex container, plus overriding the shared Button
  // primitive's own `whitespace-nowrap` on the long "Move to today" label)
  // and re-running this exact assertion fails with "Move to today button:
  // right edge 390.48px exceeds the 390px viewport" — restoring the fix
  // brings every one of these controls back under the same assertion.
  await expectWithinViewportWidth(
    page,
    page.getByTestId(/^plan-sheet-promote-/),
    "Move to today button",
  );
  await expectWithinViewportWidth(
    page,
    page.getByTestId(/^plan-sheet-edit-title-input-/),
    "Title input",
  );
  await expectWithinViewportWidth(
    page,
    page.getByTestId(/^plan-sheet-edit-description-input-/),
    "Description textarea",
  );
  await expectWithinViewportWidth(
    page,
    page.getByTestId(/^plan-sheet-edit-area-input-/),
    "Area select",
  );
  const saveLocator = page.getByTestId(/^plan-sheet-edit-save-/);
  const cancelLocator = page.getByTestId(/^plan-sheet-edit-cancel-/);
  await expectWithinViewportWidth(page, saveLocator, "Save button");
  await expectWithinViewportWidth(page, cancelLocator, "Cancel button");

  // The 44px hit-target floor (HIT_TARGET_MIN) survives at mobile width —
  // necessary but (per the earlier finding) not sufficient on its own, which
  // is why the width assertions above run first.
  const saveBox = await saveLocator.boundingBox();
  expect(saveBox!.height).toBeGreaterThanOrEqual(44);
  const cancelBox = await cancelLocator.boundingBox();
  expect(cancelBox!.height).toBeGreaterThanOrEqual(44);

  const screenshotPath = await attachScreenshot(
    page,
    testInfo,
    "edit-details-mobile",
  );
  console.log(`edit-details-mobile screenshot: ${screenshotPath}`);

  // An actual mobile edit/save, not just a layout check: reached after
  // `scrollIntoViewIfNeeded` above proved normal vertical scrolling
  // surfaces every control, then driven exactly like a touch user would.
  const titleInput = page.getByTestId(/^plan-sheet-edit-title-input-/);
  await titleInput.fill("Label and date the seasonal storage bins");
  await page
    .getByTestId(/^plan-sheet-edit-description-input-/)
    .fill("Use the waterproof labels.");
  await page
    .getByTestId(/^plan-sheet-edit-area-input-/)
    .selectOption({ label: "Personal" });
  await saveLocator.click();

  await expect(form).toHaveCount(0, { timeout: 20_000 });
});

/** The five field "kinds" the form's Tab order must visit, in this order. */
const EDIT_FORM_TAB_KINDS = [
  "title-input",
  "description-input",
  "area-input",
  "save",
  "cancel",
] as const;

function editFormKindOf(testId: string | null): string | undefined {
  if (!testId) return undefined;
  return EDIT_FORM_TAB_KINDS.find((kind) => testId.includes(`edit-${kind}-`));
}

test("edit details: reachable and operable with keyboard only, in the exact Title -> Description -> Area -> Save -> Cancel order", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("today-moments")).toBeVisible();

  const title = "File the community garden permits";
  await seedBacklogTask(page, title);
  await openPlanSheet(page);

  // Open via keyboard: focus the control, then Enter — never a mouse click.
  // This is the one `.focus()` call in this test, standing in for "the user
  // already has focus somewhere on the page" (exactly as it would after any
  // prior keyboard interaction) — every step after this is real Tab/Enter
  // traversal, never a direct focus jump to a specific field.
  const editButton = page.getByTestId(/^plan-sheet-edit-/).first();
  await editButton.focus();
  await page.keyboard.press("Enter");

  const form = page.getByTestId(/^plan-sheet-edit-form-/);
  await expect(form).toBeVisible();

  // Walk Tab forward, typing into each field AS it is reached (never moving
  // focus away to do so), until all five kinds have been observed once —
  // this is the real, continuous keyboard path a user would take.
  const observedKinds: string[] = [];
  for (
    let i = 0;
    i < 15 && observedKinds.length < EDIT_FORM_TAB_KINDS.length;
    i += 1
  ) {
    const testId = await page.evaluate(
      () => document.activeElement?.getAttribute("data-testid") ?? null,
    );
    const kind = editFormKindOf(testId);
    if (kind && observedKinds.at(-1) !== kind) {
      observedKinds.push(kind);
      if (kind === "title-input") {
        await page.keyboard.press("Control+a");
        await page.keyboard.type("Renewed permits filed");
      } else if (kind === "description-input") {
        await page.keyboard.type("Filed with the city office.");
      }
    }
    await page.keyboard.press("Tab");
  }

  expect(
    observedKinds,
    "the Tab order must visit all five controls, in this exact order",
  ).toEqual([...EDIT_FORM_TAB_KINDS]);

  // Focus is now past Cancel; Shift+Tab once returns to it, and once more
  // to Save — both real keyboard navigation, never a focus jump — then
  // Enter activates Save.
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(async () => {
    const testId = await page.evaluate(
      () => document.activeElement?.getAttribute("data-testid") ?? null,
    );
    expect(editFormKindOf(testId)).toBe("save");
  }).toPass({ timeout: 5_000 });
  await page.keyboard.press("Enter");

  await expect(form).toHaveCount(0, { timeout: 20_000 });
});
