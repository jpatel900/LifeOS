import { expect, test, type Page } from "@playwright/test";

async function gotoCapture(page: Page) {
  await page.goto("/capture");
  await expect(
    page.getByRole("heading", { level: 1, name: "Capture" }),
  ).toBeVisible();
}

test("shell accent follows the selected area and keeps active nav explicit", async ({
  page,
}) => {
  await gotoCapture(page);

  const shell = page.getByTestId("app-shell-root");
  const areaContext = page.getByLabel("Current area context");

  await expect(areaContext).toContainText("Main Job");
  await expect(page.getByRole("link", { name: "Capture" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(shell).toHaveCSS("--area-accent", "#2563eb");

  await page
    .getByLabel("Current area", { exact: true })
    .selectOption("area-side-project");

  await expect(areaContext).toContainText("Side Project");
  await expect(shell).toHaveCSS("--area-accent", "#f97316");
});

test("skip link moves focus to main content without exposing workflow internals", async ({
  page,
}) => {
  await gotoCapture(page);

  const skipLink = page.getByRole("link", { name: "Skip to main content" });
  const main = page.locator("#main-content");

  await skipLink.focus();
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();
  await skipLink.press("Enter");
  await expect(main).toBeFocused();
  await expect(page.getByText("Session workflow area")).toHaveCount(0);

  const top = await main.evaluate((element) =>
    Math.round(element.getBoundingClientRect().top),
  );
  expect(top).toBeGreaterThanOrEqual(0);
});

test("shell accent stays usable at mobile width without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoCapture(page);

  await page
    .getByLabel("Current area", { exact: true })
    .selectOption("area-volunteer");
  await expect(page.getByLabel("Current area context")).toContainText(
    "Volunteer Work",
  );

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
});
