import { expect, test, type Locator, type Page } from "@playwright/test";

function parseRgb(color: string) {
  const match = color.match(/rgba?\(([^)]+)\)/i);
  if (!match) {
    throw new Error(`Unsupported color format: ${color}`);
  }

  const [r, g, b] = match[1].split(",").map((part) => Number(part.trim()));
  return { r, g, b };
}

function luminanceChannel(value: number) {
  const normalized = value / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function contrastRatio(foreground: string, background: string) {
  const fg = parseRgb(foreground);
  const bg = parseRgb(background);
  const foregroundLuminance =
    0.2126 * luminanceChannel(fg.r) +
    0.7152 * luminanceChannel(fg.g) +
    0.0722 * luminanceChannel(fg.b);
  const backgroundLuminance =
    0.2126 * luminanceChannel(bg.r) +
    0.7152 * luminanceChannel(bg.g) +
    0.0722 * luminanceChannel(bg.b);

  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

async function resolveReadableStyles(locator: Locator) {
  return locator.evaluate((element) => {
    const normalizeColor = (value: string) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Canvas context unavailable for color normalization.");
      }
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
      return `rgb(${r}, ${g}, ${b})`;
    };

    const isTransparent = (value: string) => {
      const normalized = normalizeColor(value);
      return normalized === "rgba(0, 0, 0, 0)" || normalized === "transparent";
    };

    let current: HTMLElement | null = element as HTMLElement;
    while (current) {
      const background = window.getComputedStyle(current).backgroundColor;
      if (!isTransparent(background)) {
        const styles = window.getComputedStyle(element as HTMLElement);
        return {
          color: normalizeColor(styles.color),
          backgroundColor: normalizeColor(background),
          fontSize: Number.parseFloat(styles.fontSize),
          fontWeight: Number.parseInt(styles.fontWeight, 10) || 400,
        };
      }
      current = current.parentElement;
    }

    const styles = window.getComputedStyle(element as HTMLElement);
    return {
      color: normalizeColor(styles.color),
      backgroundColor: normalizeColor(window.getComputedStyle(document.body).backgroundColor),
      fontSize: Number.parseFloat(styles.fontSize),
      fontWeight: Number.parseInt(styles.fontWeight, 10) || 400,
    };
  });
}

function minimumContrast(fontSize: number, fontWeight: number) {
  const isLargeText =
    fontSize >= 24 || (fontWeight >= 700 && fontSize >= 18.66);
  return isLargeText ? 3 : 4.5;
}

async function expectVisibleFocus(locator: Locator) {
  await expect(locator).toBeFocused();
  const styles = await locator.evaluate((element) => {
    const computed = window.getComputedStyle(element);
    return {
      boxShadow: computed.boxShadow,
      outlineStyle: computed.outlineStyle,
      outlineWidth: computed.outlineWidth,
    };
  });

  expect(
    styles.boxShadow === "none" &&
      (styles.outlineStyle === "none" || styles.outlineWidth === "0px"),
  ).toBe(false);
}

async function tabUntilFocused(page: Page, locator: Locator, maxTabs = 20) {
  for (let index = 0; index < maxTabs; index += 1) {
    await page.keyboard.press("Tab");
    const focused = await locator
      .evaluate((element) => element === document.activeElement)
      .catch(() => false);
    if (focused) {
      return;
    }
  }

  throw new Error(`Could not focus target by tabbing within ${maxTabs} tabs.`);
}

test("main workflow surfaces keep readable contrast in dark mode", async ({
  page,
}) => {
  await page.goto("/");
  const homeHeading = page.getByTestId("today-next-card").getByRole("heading").first();
  const homeStyles = await resolveReadableStyles(homeHeading);
  expect(
    contrastRatio(homeStyles.color, homeStyles.backgroundColor),
  ).toBeGreaterThanOrEqual(
    minimumContrast(homeStyles.fontSize, homeStyles.fontWeight),
  );

  await page.goto("/capture");
  const captureAction = page.getByRole("button", { name: "Save thought" });
  const captureStyles = await resolveReadableStyles(captureAction);
  expect(
    contrastRatio(captureStyles.color, captureStyles.backgroundColor),
  ).toBeGreaterThanOrEqual(
    minimumContrast(captureStyles.fontSize, captureStyles.fontWeight),
  );

  await page.goto("/health");
  const healthHeading = page
    .getByTestId("health-reliability-card")
    .getByRole("heading")
    .first();
  const healthStyles = await resolveReadableStyles(healthHeading);
  expect(
    contrastRatio(healthStyles.color, healthStyles.backgroundColor),
  ).toBeGreaterThanOrEqual(
    minimumContrast(healthStyles.fontSize, healthStyles.fontWeight),
  );

  await page.goto("/settings/areas");
  const areaAction = page
    .getByTestId("areas-create-card")
    .getByRole("button", { name: "Create area" });
  const areaStyles = await resolveReadableStyles(areaAction);
  expect(
    contrastRatio(areaStyles.color, areaStyles.backgroundColor),
  ).toBeGreaterThanOrEqual(
    minimumContrast(areaStyles.fontSize, areaStyles.fontWeight),
  );
});

test("keyboard focus and status semantics stay explicit on shell and workflow actions", async ({
  page,
}) => {
  await page.goto("/triage");

  const primaryNav = page.getByRole("navigation", { name: "Primary" });
  const captureLink = primaryNav.getByRole("link", {
    name: "Capture",
    exact: true,
  });
  const triageLink = primaryNav.getByRole("link", {
    name: "Triage",
    exact: true,
  });

  await page.locator("body").click({ position: { x: 12, y: 12 } });
  await tabUntilFocused(page, captureLink);
  await expectVisibleFocus(captureLink);

  await tabUntilFocused(page, triageLink);
  await expectVisibleFocus(triageLink);

  await page.getByRole("button", { name: "Quick note" }).click();
  await page.getByLabel("Quick note text").fill("Accessibility baseline proof");
  await page.getByRole("button", { name: "Save quick note" }).click();

  await expect(
    page.getByRole("status").filter({ hasText: "Saved." }),
  ).toBeVisible();

  await page.goto("/capture");
  await page.locator("body").click({ position: { x: 12, y: 12 } });
  const captureTextbox = page.getByRole("textbox", {
    name: "What are you thinking about?",
  });
  await tabUntilFocused(page, captureTextbox, 30);
  await expectVisibleFocus(captureTextbox);

  await captureTextbox.fill("Accessibility feedback status proof");
  await page.getByRole("button", { name: "Save thought" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved." }),
  ).toBeVisible();
});
