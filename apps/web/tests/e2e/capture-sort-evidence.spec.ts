import { test } from "@playwright/test";
import { stubParseCaptureRoute } from "./helpers/mockParseCapture";

/**
 * #703 PR evidence shots. Not a behavioral test — it drives the real app and
 * writes the screenshots committed under .github/pr-evidence/703-capture-sort/.
 *
 * Run with:
 *   PLAYWRIGHT_EVIDENCE=1 pnpm --filter @lifeos/web exec playwright test \
 *     tests/evidence/capture-sort-evidence.spec.ts
 */

const OUT = "../../.github/pr-evidence/703-capture-sort";
const CAPTURE_TEXT = "Book the dentist before the end of the month";

for (const theme of ["light", "dark"] as const) {
  test(`#703 evidence — capture pop-up and triage Sort (${theme})`, async ({
    page,
  }) => {
    // The app's theme is next-themes (localStorage key "theme"), mirrored
    // onto data-theme by MomentsThemeShell — prefers-color-scheme alone does
    // not flip it, so seed the store before the first paint.
    await page.emulateMedia({ colorScheme: theme });
    await page.addInitScript((value) => {
      window.localStorage.setItem("theme", value);
    }, theme);
    await stubParseCaptureRoute(page);
    await page.goto("/");
    await page.getByTestId("today-moments").waitFor();

    // --- Capture pop-up: ONE action ---------------------------------------
    await page.getByTestId("capture-affordance").click();
    await page.getByTestId("capture-overlay-textarea").fill(CAPTURE_TEXT);
    await page
      .getByTestId("capture-overlay-return-hook")
      .fill("writing the report");
    await page.waitForTimeout(300);
    await page.screenshot({
      path: `${OUT}/after-01-capture-popup-one-button-${theme}.png`,
      fullPage: false,
    });

    await page.getByTestId("capture-overlay-save").click();
    await page.getByTestId("capture-overlay").waitFor({ state: "detached" });

    // --- Triage: the thought is listed, with the Sort action ---------------
    await page.getByTestId("pipeline-overview-stage-triage").click();
    await page.getByTestId("triage-sheet-captures").waitFor();
    await page.waitForTimeout(300);
    await page.screenshot({
      path: `${OUT}/after-02-triage-sort-action-${theme}.png`,
      fullPage: false,
    });

    // --- After sorting: a draft is waiting for review ----------------------
    await page
      .getByTestId(/^triage-sheet-sort-/)
      .first()
      .click();
    await page.getByTestId("triage-sheet-list").waitFor();
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `${OUT}/after-03-triage-draft-after-sort-${theme}.png`,
      fullPage: false,
    });
  });
}
