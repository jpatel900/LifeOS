import { expect, test, type Page } from "@playwright/test";

async function expectNoHorizontalOverflow(page: Page) {
  const layout = await page.evaluate(() => {
    const html = document.documentElement;
    const body = document.body;

    return {
      scrollWidth: Math.max(
        html.scrollWidth,
        body?.scrollWidth ?? 0,
        html.clientWidth,
      ),
      viewportWidth: window.innerWidth,
    };
  });

  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
}

test("settings areas remains admin outside the handoff cockpit", async ({
  page,
}) => {
  await page.goto("/settings/areas");

  await expect(
    page.getByRole("heading", { level: 1, name: "Areas" }),
  ).toBeVisible();
  await expect(page.getByTestId("lifeos-cockpit")).toHaveCount(0);
  await expect(page.getByTestId("areas-create-card")).toBeVisible();
  await expect(page.getByText("Ownership starts here")).toBeVisible();
  await expect(page.getByText("Registry details")).toBeVisible();
});

test("settings areas stays usable at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings/areas");

  await expect(
    page.getByRole("heading", { level: 1, name: "Areas" }),
  ).toBeVisible();
  await expect(page.getByTestId("areas-create-card")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("settings areas creates a usable area with a persisted starting accent", async ({
  page,
}) => {
  await page.goto("/settings/areas");

  const createCard = page.getByTestId("areas-create-card");
  await createCard.getByLabel("Area name").fill("Deep Work");
  await createCard
    .getByLabel("Description")
    .fill("Work that needs focused attention.");
  await createCard.getByRole("button", { name: "Teal" }).click();
  await createCard.getByRole("button", { name: "Create area" }).click();

  await expect(page.getByText("Area created.")).toBeVisible();
  await expect(page.getByText("Current area: Deep Work")).toBeVisible();

  const newAreaCard = page
    .getByTestId("areas-area-card")
    .filter({ hasText: "Deep Work" });
  await expect(newAreaCard).toBeVisible();
  await newAreaCard.getByText("Registry actions and settings").click();
  await expect(
    newAreaCard
      .locator(".area-accent-chip")
      .filter({ hasText: "Custom accent" }),
  ).toBeVisible();
});

test("settings areas can recolor and reset an existing area accent", async ({
  page,
}) => {
  await page.goto("/settings/areas");

  const areaCard = page
    .getByTestId("areas-area-card")
    .filter({ hasText: "Main Job" });
  await areaCard.getByText("Registry actions and settings").click();

  const colorPanel = areaCard.getByTestId("areas-color-panel");
  await colorPanel.getByRole("button", { name: "Teal" }).click();
  await expect(areaCard.getByText("Accent updated.")).toBeVisible();
  await expect(colorPanel.getByText("Custom accent")).toBeVisible();

  await colorPanel.getByRole("button", { name: "Default" }).click();
  await expect(
    areaCard.getByText("Main Job now uses the default accent."),
  ).toBeVisible();
  await expect(
    colorPanel
      .locator(".area-accent-chip")
      .filter({ hasText: "Default accent" }),
  ).toBeVisible();
});

test("settings areas archives only after explicit confirmation", async ({
  page,
}) => {
  await page.goto("/settings/areas");

  const areaCard = page
    .getByTestId("areas-area-card")
    .filter({ hasText: "Personal" });
  await areaCard.getByText("Registry actions and settings").click();
  await areaCard.getByRole("button", { name: "Remove area" }).click();
  await expect(
    areaCard.getByRole("button", { name: "Confirm remove" }),
  ).toBeVisible();

  await areaCard.getByRole("button", { name: "Confirm remove" }).click();

  await expect(page.getByText("Area removed from active use.")).toBeVisible();
  await expect(
    page.getByTestId("areas-area-card").filter({ hasText: "Personal" }),
  ).toHaveCount(0);
});

test("settings export reports local or unauthenticated export limits plainly", async ({
  page,
}) => {
  await page.goto("/settings/areas");

  await page.getByText("Data export").click();
  await page.getByRole("button", { name: "Download my data" }).click();

  await expect(page.getByText("Export did not finish.")).toBeVisible();
  await expect(
    page.getByText(
      /Data export needs a signed-in account|Sign in before exporting your data/i,
    ),
  ).toBeVisible();
});
