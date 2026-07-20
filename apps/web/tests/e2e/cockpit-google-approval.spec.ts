import { expect, test, type Page } from "@playwright/test";
import { stubParseCaptureRoute } from "./helpers/mockParseCapture";

// HIGH-1 (#670): /api/parse-capture requires a verified bearer token and the
// E2E dev server has no Supabase env, so every capture flow in this file runs
// against the deterministic mock-parser stub (task-map lifecycle precedent).
test.beforeEach(async ({ page }) => {
  await stubParseCaptureRoute(page);
});

async function goToStage(page: Page, stage: RegExp) {
  await page
    .getByRole("navigation", { name: "Workflow stages" })
    .getByRole("button", { name: stage })
    .click();
}

async function captureTask(page: Page, title: string) {
  await page.goto("/capture");
  await page.getByPlaceholder("Drop the thought here.").fill(title);
  await page.getByRole("button", { name: "Save thought" }).click();
  // #556 FR-026: saving no longer navigates instantly — wait for the parse
  // wait to resolve and land on Triage before the caller proceeds. 30s: the
  // first capture-submit of a dev run can hit multi-second cold compiles.
  await expect(page).toHaveURL(/\/triage$/, { timeout: 30_000 });
}

test("google approval bridge is visible but safely disabled in mock mode while local approve works", async ({
  page,
}) => {
  await captureTask(page, "Google approval bridge mock item");
  await page.getByRole("button", { name: "Do today" }).click();
  await goToStage(page, /Plan/);

  // The approval bridge is reachable from the cockpit plan stage.
  await expect(page.getByText("Google approvals")).toBeVisible();

  // Without Google/Supabase env the write button is disabled with a
  // plain-language reason instead of failing or writing silently.
  const approveButton = page.getByRole("button", {
    name: /Approve Google event for Google approval bridge mock item/,
  });
  await expect(approveButton).toBeVisible();
  await expect(approveButton).toBeDisabled();
  await expect(
    page.getByText(
      "Google Calendar is unavailable in local-only mode. Local planning keeps working.",
    ),
  ).toBeVisible();

  // The local mock workflow keeps working end to end: the proposal can be
  // accepted locally, producing a scheduled block without any Google write.
  await page.getByRole("button", { name: "Accept local", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Start focusing" }),
  ).toBeVisible();

  // No LifeOS-owned Google event exists locally, so no cancel control shows.
  await expect(
    page.getByRole("button", { name: /Cancel Google event/ }),
  ).toHaveCount(0);
});
