import { expect, test, type Page } from "@playwright/test";

async function goToStage(page: Page, stage: RegExp) {
  await page
    .getByRole("navigation", { name: "Workflow stages" })
    .getByRole("button", { name: stage })
    .click();
}

async function captureTask(page: Page, title: string) {
  await page.goto("/capture");
  await page.getByRole("textbox").fill(title);
  await page.getByRole("button", { name: "Save thought" }).click();
}

async function planTaskAtEight(page: Page, title: string) {
  await captureTask(page, title);
  await page.getByRole("button", { name: "Do today" }).click();
  await goToStage(page, /Plan/);
  // Anchored: the Google approval bridge also labels buttons with the title.
  await page.getByRole("button", { name: new RegExp(`^${title}`) }).click();
  await page.getByRole("button", { name: /8a\s+Drop here/ }).click();
}

test("capture blocks empty saves", async ({ page }) => {
  await page.goto("/capture");

  await expect(
    page.getByRole("button", { name: "Save thought" }),
  ).toBeDisabled();
});

test("empty plan routes to capture instead of execute", async ({ page }) => {
  await page.goto("/calendar");

  await expect(
    page.getByRole("button", { name: "Start focusing" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Capture a thought" }).click();

  await expect(page).toHaveURL(/\/capture$/);
});

test("all areas pipeline board includes work from every area", async ({
  page,
}) => {
  await captureTask(page, "Main area board repair item");

  await page.getByRole("button", { name: "Personal" }).click();
  await goToStage(page, /Capture/);
  await page.getByRole("textbox").fill("Personal board repair item");
  await page.getByRole("button", { name: "Save thought" }).click();

  await page.getByRole("button", { name: "All areas" }).click();

  await expect(page.getByText("Global scope")).toBeVisible();
  await expect(page.getByText("Main area board repair item")).toBeVisible();
  await expect(page.getByText("Personal board repair item")).toBeVisible();
});

test("started execution remains finishable and can complete into review", async ({
  page,
}) => {
  await planTaskAtEight(page, "Complete execution repair item");

  await page.getByRole("button", { name: "Start focusing" }).click();
  await page
    .getByRole("button", { name: /Complete execution repair item/ })
    .click();

  await expect(
    page.getByRole("heading", { name: "Complete execution repair item" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Complete", exact: true }).click();

  await expect(page).toHaveURL(/\/review$/);
  await expect(page.getByText("completed")).toBeVisible();
});

test("stuck execution is recoverable from review", async ({ page }) => {
  await planTaskAtEight(page, "Stuck execution repair item");

  await page.getByRole("button", { name: "Start focusing" }).click();
  await page
    .getByRole("button", { name: /Stuck execution repair item/ })
    .click();
  await page.getByRole("button", { name: "Stuck", exact: true }).click();

  await expect(page).toHaveURL(/\/review$/);
  await expect(page.getByText("Stuck execution repair item")).toBeVisible();

  await page.getByRole("button", { name: "Carry forward" }).click();
  await expect(page).toHaveURL(/\/calendar$/);
  await expect(
    page.getByRole("button", { name: /^Stuck execution repair item/ }),
  ).toBeVisible();
});

test("missed execution is recoverable from review", async ({ page }) => {
  await planTaskAtEight(page, "Missed execution repair item");

  await page.getByRole("button", { name: "Start focusing" }).click();
  await page
    .getByRole("button", { name: /Missed execution repair item/ })
    .click();
  await page.getByRole("button", { name: "Missed", exact: true }).click();

  await expect(page).toHaveURL(/\/review$/);
  await expect(page.getByText("Missed execution repair item")).toBeVisible();

  await page.getByRole("button", { name: "Carry forward" }).click();
  await expect(page).toHaveURL(/\/calendar$/);
  await expect(
    page.getByRole("button", { name: /^Missed execution repair item/ }),
  ).toBeVisible();
});

test("pause, resume, and side capture do not interrupt execution", async ({
  page,
}) => {
  await planTaskAtEight(page, "Pause and side capture repair item");

  await page.getByRole("button", { name: "Start focusing" }).click();
  await page
    .getByRole("button", { name: /Pause and side capture repair item/ })
    .click();

  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();

  await page
    .getByPlaceholder("Capture without leaving focus.")
    .fill("Side thought during focus");
  await page.getByRole("button", { name: "Save side thought" }).click();

  await expect(page).toHaveURL(/\/execute$/);
  await expect(page.getByText("Side thought saved")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Pause and side capture repair item" }),
  ).toBeVisible();
});

test("all areas has a stable route alias", async ({ page }) => {
  await page.goto("/areas");

  await expect(
    page.getByRole("heading", { name: "All areas overview" }),
  ).toBeVisible();
  await expect(page.getByText("Global scope")).toBeVisible();
});

test("triage supports local edit and reassignment", async ({ page }) => {
  await captureTask(page, "Original triage edit item");

  await page.getByText("Adjust draft").click();
  const adjustPanel = page
    .locator("details")
    .filter({ hasText: "Adjust draft" });
  await adjustPanel.getByLabel("Title").fill("Edited triage item");
  await adjustPanel.getByLabel("First move").fill("Open the edited draft");
  await adjustPanel.getByLabel("Area").selectOption({ label: "Personal" });
  await page.getByRole("button", { name: "Save edits" }).click();

  await expect(page.getByText("Draft edit saved locally")).toBeVisible();
  await page.getByRole("button", { name: "Personal" }).click();
  await goToStage(page, /Triage/);

  await expect(
    page.getByRole("heading", { name: "Edited triage item" }),
  ).toBeVisible();
});

test("triage supports local split and merge", async ({ page }) => {
  await captureTask(page, "Split this bundled triage item");

  await page.getByText("Split or merge").click();
  await page.getByPlaceholder("First split task").fill("First split item");
  await page.getByPlaceholder("Second split task").fill("Second split item");
  await page.getByRole("button", { name: "Split draft" }).click();

  await expect(
    page.getByRole("heading", { name: "First split item" }),
  ).toBeVisible();
  await expect(page.getByText("Draft split saved locally")).toBeVisible();

  await page.getByRole("button", { name: /Merge next:/ }).click();

  await expect(
    page.getByRole("heading", { name: "First split item; Second split item" }),
  ).toBeVisible();
});

test("plan exposes local proposal edit, reject, and accept controls", async ({
  page,
}) => {
  await captureTask(page, "Proposal parity repair item");
  await page.getByRole("button", { name: "Do today" }).click();
  await goToStage(page, /Plan/);

  await expect(page.getByText("Proposals")).toBeVisible();
  await page.getByRole("button", { name: "Move later" }).first().click();
  await expect(page.getByText("Proposal moved later")).toBeVisible();
  await expect(page.getByText("edited")).toBeVisible();

  await page.getByRole("button", { name: "Reject" }).first().click();
  await expect(page.getByText("Proposal rejected locally")).toBeVisible();

  await page
    .getByRole("button", { name: "Proposal parity repair item" })
    .click();
  await page.getByRole("button", { name: "Draft block" }).click();
  await expect(page.getByText("Proposal drafted locally")).toBeVisible();
  await page.getByRole("button", { name: "Accept" }).first().click();

  await expect(
    page.getByRole("button", { name: "Start focusing" }),
  ).toBeVisible();
});
