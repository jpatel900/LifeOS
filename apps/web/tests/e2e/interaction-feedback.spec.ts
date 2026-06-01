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
  await expect(
    page.getByText(
      "Saved first, then organized. Review the drafts in Triage next.",
    ),
  ).toBeVisible();

  await page.getByRole("link", { name: "Review it now" }).click();
  await expect(page).toHaveURL(/\/triage$/);

  await page.getByRole("button", { name: "Accept task draft" }).first().click();
  await expect(page.getByText("Ready for Planning")).toBeVisible();
  await expect(
    page.getByText(
      /Plan time in Planning next, or capture another thought\./,
    ),
  ).toBeVisible();

  await page.getByRole("link", { name: "Plan time for this" }).click();
  await expect(page).toHaveURL(/\/calendar$/);

  await page.getByRole("button", { name: "Suggest a time" }).first().click();
  await expect(page.getByText("Suggested time ready")).toBeVisible();
  await expect(
    page.getByText(/Review it below, then plan it or adjust it\./),
  ).toBeVisible();

  await page.getByRole("button", { name: "Plan this time" }).first().click();
  await expect(page.getByText("Planned block ready")).toBeVisible();
  await expect(
    page.getByText(/Open Execute next when you are ready to focus\./),
  ).toBeVisible();

  await page.getByRole("link", { name: "Open Execute" }).click();
  await expect(page).toHaveURL(/\/execute$/);

  await page.getByRole("button", { name: "Start focus session" }).click();
  await expect(page.getByText("Focus session started")).toBeVisible();
  await expect(
    page.getByText(
      "Session started and saved on this device. Stay here until you can record a real outcome.",
    ),
  ).toBeVisible();

  await page.getByRole("button", { name: "Complete", exact: true }).click();
  const executeStatus = page
    .getByRole("status")
    .filter({ hasText: "Session complete" });
  await expect(executeStatus).toBeVisible();
  await expect(executeStatus).toContainText(
    "Move to Review next or plan another block.",
  );

  await page.getByRole("link", { name: "Open Review" }).click();
  await expect(page).toHaveURL(/\/review$/);

  await page.getByRole("button", { name: "Create daily review" }).click();
  await expect(page.getByText("Daily review saved")).toBeVisible();
  await expect(
    page.getByText(
      /Stay here to finish closing the loop, or move to Planning for the next block\./,
    ),
  ).toBeVisible();
});
