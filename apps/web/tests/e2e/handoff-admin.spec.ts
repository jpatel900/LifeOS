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
