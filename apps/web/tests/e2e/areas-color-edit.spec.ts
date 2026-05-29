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

test("Areas supports color changes, reset, and shell accent updates", async ({
  page,
}) => {
  await page.goto("/settings/areas");

  const shell = page.getByTestId("app-shell-root");
  const firstCard = page.getByTestId("areas-area-card").nth(0);
  const secondCard = page.getByTestId("areas-area-card").nth(1);

  await firstCard.getByRole("button", { name: "Teal" }).click();
  await expect(firstCard).toHaveCSS("--area-accent", "#0f766e");
  await expect(page.getByText("Accent updated.")).toBeVisible();

  await secondCard.getByRole("button", { name: "Sunrise" }).click();
  await expect(secondCard).toHaveCSS("--area-accent", "#f59e0b");

  await firstCard.getByRole("button", { name: "Using this area" }).click();
  await expect(shell).toHaveCSS("--area-accent", "#0f766e");

  await secondCard.getByRole("button", { name: "Use this area" }).click();
  await expect(shell).toHaveCSS("--area-accent", "#f59e0b");

  await firstCard.getByRole("button", { name: "Default" }).click();
  await expect(firstCard).toHaveCSS("--area-accent", "#64748b");
});

test("Areas color controls stay usable at 390px width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings/areas");
  await expectNoHorizontalOverflow(page);
});
