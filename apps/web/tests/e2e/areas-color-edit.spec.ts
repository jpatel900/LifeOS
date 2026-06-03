import { expect, test, type Page } from "@playwright/test";

async function gotoAreas(page: Page) {
  await page.goto("/settings/areas");

  const heading = page.getByRole("heading", { level: 1, name: "Areas" });
  if (!(await heading.isVisible().catch(() => false))) {
    await page.reload();
  }

  await expect(heading).toBeVisible();
}

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
  await gotoAreas(page);

  const shell = page.getByTestId("app-shell-root");
  const firstCard = page.getByTestId("areas-area-card").nth(0);
  const secondCard = page.getByTestId("areas-area-card").nth(1);
  await expect(firstCard).toBeVisible();
  await expect(secondCard).toBeVisible();

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
  await gotoAreas(page);
  await expectNoHorizontalOverflow(page);
});

test("dark-mode area accent presets keep current-area text readable and focus-visible", async ({
  page,
}) => {
  await gotoAreas(page);

  const presets = ["Ocean", "Forest", "Sunrise", "Clay", "Violet", "Teal"];
  const firstCard = page.getByTestId("areas-area-card").first();
  const secondCard = page.getByTestId("areas-area-card").nth(1);
  const selectedButton = firstCard.getByRole("button", { name: "Using this area" });
  const otherButton = secondCard.getByRole("button", { name: "Use this area" });

  await selectedButton.click();

  for (const preset of presets) {
    const presetButton = firstCard.getByRole("button", { name: preset });
    await presetButton.click();

    const selectedStateStyles = await selectedButton.evaluate((element) => {
      const styles = window.getComputedStyle(element);
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error("Canvas context unavailable for color normalization.");
      }

      context.fillStyle = styles.color;
      const normalizedColor = context.fillStyle;
      context.fillStyle = styles.backgroundColor;
      const normalizedBackground = context.fillStyle;

      return {
        color: normalizedColor,
        backgroundColor: normalizedBackground,
        borderColor: styles.borderColor,
      };
    });

    expect(selectedStateStyles.color).not.toBe(
      selectedStateStyles.backgroundColor,
    );
    expect(selectedStateStyles.borderColor).not.toBe(
      selectedStateStyles.backgroundColor,
    );

    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(presetButton).toBeFocused();
    const focusStyles = await presetButton.evaluate((element) => {
      const styles = window.getComputedStyle(element);
      return {
        boxShadow: styles.boxShadow,
        outlineStyle: styles.outlineStyle,
      };
    });

    expect(focusStyles.boxShadow === "none" && focusStyles.outlineStyle === "none").toBe(
      false,
    );
  }

  await expect(firstCard.getByText("Main Job")).toBeVisible();
  await expect(selectedButton).toBeVisible();

  const selectedBackground = await selectedButton.evaluate(
    (element) => window.getComputedStyle(element).backgroundColor,
  );
  const unselectedBackground = await otherButton.evaluate(
    (element) => window.getComputedStyle(element).backgroundColor,
  );

  expect(selectedBackground).not.toBe(unselectedBackground);
});
