import { expect, type Page } from "@playwright/test";

/**
 * #703: the legacy cockpit's capture stage is a pure raw save now — ONE
 * "Capture" control, no parse at the front door, and no automatic navigation
 * to /triage (there is no draft yet to navigate to). Sorting is the separate,
 * explicit step taken on the triage stage.
 *
 * Every cockpit spec that used to get a task draft from a single "Save
 * thought"/"Save and sort" click needs the whole journey instead, so it lives
 * here once rather than being re-derived (and re-broken) in five files.
 *
 * These specs only run under the #590 rollback config
 * (NEXT_PUBLIC_MOMENTS_HOME=false); each file carries its own top-level
 * `test.skip` for that.
 */

/** Fills and saves a raw capture on the cockpit capture stage. No parse runs. */
export async function cockpitCapture(page: Page, title: string) {
  await page.goto("/capture");
  await page.getByPlaceholder("Drop the thought here.").fill(title);
  // Testid, not the accessible name: the stage nav also has a "Capture"
  // button, so a role+name lookup here is ambiguous.
  await page.getByTestId("capture-page-save").click();

  // Saving is synchronous; CaptureCore's closing "back to: <hook>" conclusion
  // renders immediately and auto-dismisses. The stage nav is held disabled
  // until it does (LifeOSCockpit's `navLocked`), so wait it out here rather
  // than leaving every caller to discover that.
  await expect(page.getByTestId("capture-page-conclusion")).toBeVisible();
  await expect(page.getByTestId("capture-page-conclusion")).toHaveCount(0, {
    timeout: 30_000,
  });
}

/** Moves to a cockpit stage through the workflow-stages nav. */
export async function goToCockpitStage(page: Page, stage: RegExp) {
  await page
    .getByRole("navigation", { name: "Workflow stages" })
    .getByRole("button", { name: stage })
    .click();
}

/**
 * Sorts the first unsorted capture on the triage stage and waits for the
 * parse round-trip its Sort action drives.
 */
export async function sortFirstCapture(page: Page, title: string) {
  await expect(page.getByTestId("triage-sheet-captures")).toContainText(title, {
    // 30s: the first client-side stage switch of a dev run can spend several
    // seconds compiling.
    timeout: 30_000,
  });
  const parseResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/parse-capture") &&
      response.request().method() === "POST",
  );
  await page
    .getByTestId(/^triage-sheet-sort-/)
    .first()
    .click();
  await parseResponse;
  await expect(page.getByRole("heading", { name: title })).toBeVisible({
    timeout: 30_000,
  });
}

/**
 * The full replacement for the old one-click `captureTask` helper: capture on
 * the capture stage, cross to triage, Sort, and leave the caller on the
 * triage stage with the resulting draft on screen.
 */
export async function cockpitCaptureAndSort(page: Page, title: string) {
  await cockpitCapture(page, title);
  await goToCockpitStage(page, /Triage/);
  await expect(page).toHaveURL(/\/triage$/, { timeout: 30_000 });
  await sortFirstCapture(page, title);
}
