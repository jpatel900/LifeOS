import { expect, test, type Page } from "@playwright/test";

async function gotoCapture(page: Page) {
  await page.goto("/capture");
  await expect(
    page.getByRole("heading", { level: 1, name: "Capture" }),
  ).toBeVisible();
}

test("workflow actions explain what happened and where to go next", async ({
  page,
}) => {
  await gotoCapture(page);

  await page
    .getByPlaceholder("What's on your mind? Type anything...")
    .fill("Finish the budget summary for tomorrow");
  await page.getByRole("button", { name: "Save and organize" }).click();

  await expect(page.getByText("Drafts ready for Triage.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Review it now" })).toBeVisible();

  await page.getByRole("link", { name: "Review it now" }).click();
  await expect(page).toHaveURL(/\/triage$/);
  await expect(page.getByRole("heading", { name: "Current focus" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review current item" }),
  ).toBeVisible();
  await expect(page.getByTestId("triage-current-item-card")).toBeVisible();

  await page.getByRole("button", { name: "Accept task draft" }).first().click();
  await expect(page.getByText("Ready for Planning")).toBeVisible();
  await expect(page.getByRole("link", { name: "Plan time for this" })).toBeVisible();
  await page.getByRole("link", { name: "Plan time for this" }).click();
  await expect(page).toHaveURL(/\/calendar$/);

  await page.getByRole("button", { name: "Suggest a time" }).first().click();
  await expect(page.getByText("Suggested time ready")).toBeVisible();
  await expect(page.getByRole("button", { name: "Plan this time" }).first()).toBeVisible();

  await page.getByRole("button", { name: "Plan this time" }).first().click();
  await expect(page.getByText("Planned block ready")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Execute" })).toBeVisible();

  await page.getByRole("link", { name: "Open Execute" }).click();
  await expect(page).toHaveURL(/\/execute$/);

  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByText("Focus session started")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Complete", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Complete", exact: true }).click();
  const executeStatus = page
    .getByRole("status")
    .filter({ hasText: "Session complete" });
  await expect(executeStatus).toBeVisible();
  await expect(executeStatus.getByRole("link", { name: "Open Review" })).toBeVisible();
  await expect(
    executeStatus.getByRole("link", { name: "Plan next block" }),
  ).toBeVisible();

  await executeStatus.getByRole("link", { name: "Open Review" }).click();
  await expect(page).toHaveURL(/\/review$/);

  await page.getByRole("button", { name: "Create daily review" }).click();
  await expect(page.getByText("Daily review saved")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Planning" })).toBeVisible();
});
