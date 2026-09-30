import { expect, test } from "@playwright/test";
import { PINNED_SURFACES, VIEWPORTS } from "./helpers/pinnedSurfaces";
import { pinMomentPreference } from "./helpers/momentPreference";
import { scanInteractiveGeometry } from "./helpers/interactiveGeometry";
import { scanAxeViolationNodes } from "./helpers/axeScan";

// September 28 offers the purpose gauge. Keep that extra content: changing
// the date to an unsampled day would conceal the footer collision (#1031).
test.use({ timezoneId: "UTC" });
const CLOCKS = [
  { id: "noon", iso: "2026-09-28T12:00:00.000Z", hour: 12 },
  { id: "evening", iso: "2026-09-28T22:00:00.000Z", hour: 22 },
] as const;
const closeSurface = PINNED_SURFACES.find(
  (surface) => surface.id === "close-moment",
)!;

for (const viewport of [
  ...VIEWPORTS,
  { id: "desktop", width: 1024, height: 900 },
]) {
  for (const clock of CLOCKS) {
    test(`Close footer @ ${viewport.id} (${viewport.width}x${viewport.height}), ${clock.id}: seeded actions stay clear and usable`, async ({
      page,
    }, testInfo) => {
      await page.clock.setFixedTime(new Date(clock.iso));
      await pinMomentPreference(page, "start");
      await page.setViewportSize(viewport);
      await closeSurface.goto(page);
      await expect(
        page.locator('[data-testid="today-moments"][data-demo-seeded="true"]'),
      ).toBeAttached({ timeout: 15_000 });
      await expect(
        page.getByTestId("close-moment-purpose-gauge"),
      ).toBeAttached();
      const observedClock = await page.evaluate(() => ({
        iso: new Date().toISOString(),
        hour: new Date().getHours(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }));
      expect(observedClock).toEqual({
        iso: clock.iso,
        hour: clock.hour,
        timezone: "UTC",
      });

      const initialGeometry = await scanInteractiveGeometry(page);
      await testInfo.attach("initial-clock-and-geometry", {
        body: JSON.stringify({ observedClock, initialGeometry }, null, 2),
        contentType: "application/json",
      });
      expect(initialGeometry.subMinTargets).toHaveLength(0);
      expect(initialGeometry.overlappingPairs).toHaveLength(0);

      const close = page.getByTestId("close-moment-close-day");
      const palette = page.getByTestId(
        viewport.id === "desktop"
          ? "keyboard-legend-palette-button"
          : "bottom-navigator-more",
      );
      await close.scrollIntoViewIfNeeded();
      await palette.scrollIntoViewIfNeeded();
      await expect(close).toBeInViewport({ ratio: 1 });
      await expect(palette).toBeInViewport({ ratio: 1 });
      const closeBox = (await close.boundingBox())!;
      const paletteBox = (await palette.boundingBox())!;
      for (const box of [closeBox, paletteBox]) {
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      const intersects =
        closeBox.x < paletteBox.x + paletteBox.width &&
        closeBox.x + closeBox.width > paletteBox.x &&
        closeBox.y < paletteBox.y + paletteBox.height &&
        closeBox.y + closeBox.height > paletteBox.y;
      const footerGeometry = await scanInteractiveGeometry(page);
      await testInfo.attach("footer-clock-and-geometry", {
        body: JSON.stringify(
          { observedClock, closeBox, paletteBox, footerGeometry },
          null,
          2,
        ),
        contentType: "application/json",
      });
      if (viewport.id === "desktop") {
        const screenshot = testInfo.outputPath(
          `close-footer-${viewport.width}x${viewport.height}-${clock.id}.png`,
        );
        await page.screenshot({ path: screenshot, fullPage: false });
        await testInfo.attach(
          `Close footer ${clock.id} ${viewport.width}x${viewport.height}`,
          {
            path: screenshot,
            contentType: "image/png",
          },
        );
      }
      expect(intersects, "Close and palette targets must not overlap").toBe(
        false,
      );
      expect(footerGeometry.subMinTargets).toHaveLength(0);
      expect(footerGeometry.overlappingPairs).toHaveLength(0);
      const violations = await scanAxeViolationNodes(page);
      expect(
        violations.map((v) => `${v.rule} :: ${v.target} :: ${v.summary}`),
      ).toHaveLength(0);

      if (viewport.id === "desktop") {
        await close.focus();
        await page.keyboard.press("Tab");
        await expect(palette).toBeFocused();
        await page.keyboard.press("Enter");
      } else {
        await palette.click();
      }
      await expect(page.getByTestId("command-palette")).toBeVisible();
      // Visibility precedes the palette's animation-frame autofocus.
      await expect(page.getByTestId("command-palette-input")).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("command-palette")).toHaveCount(0);
      await page.keyboard.press("Control+k");
      await expect(page.getByTestId("command-palette")).toBeVisible();
      // Visibility precedes the palette's animation-frame autofocus.
      await expect(page.getByTestId("command-palette-input")).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("command-palette")).toHaveCount(0);
      await close.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByTestId("close-moment-verdict")).toContainText(
        "Today is closed",
      );
      await expect(close).toHaveCount(0);
    });
  }
}
