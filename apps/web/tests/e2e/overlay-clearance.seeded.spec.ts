import { expect, test } from "@playwright/test";

// #1044: the native seeded project supplies its real sample-data server and
// browser channel. Below 1280px the fixed legend and compact capture button
// occupy separate horizontal space. Check top and bottom only, without
// claiming every scroll position. Preserve September 28 noon/evening inputs.
test.use({ timezoneId: "UTC" });
test.describe("Start and Flow overlay clearance (#1044)", () => {
  for (const width of [640, 768, 800, 900, 1024, 1152, 1280]) {
    for (const moment of ["start", "flow"] as const) {
      for (const clock of [
        { id: "noon", iso: "2026-09-28T12:00:00.000Z", hour: 12 },
        { id: "evening", iso: "2026-09-28T22:00:00.000Z", hour: 22 },
      ]) {
        test(`${moment} ${width}px ${clock.id}: top shortcut and bottom pointer actions stay usable`, async ({
          page,
        }, testInfo) => {
          const runtimeErrors: { source: string; message: string }[] = [];
          page.on("pageerror", (error) =>
            runtimeErrors.push({ source: "pageerror", message: error.message }),
          );
          page.on("console", (message) => {
            if (message.type() === "error")
              runtimeErrors.push({
                source: "console.error",
                message: message.text(),
              });
          });
          await page.setViewportSize({ width, height: 900 });
          await page.clock.setFixedTime(new Date(clock.iso));
          await page.goto(`/?moment=${moment}`);
          await expect(
            page.locator(
              '[data-testid="today-moments"][data-demo-seeded="true"]',
            ),
          ).toBeAttached();
          await expect(page.getByTestId(`${moment}-moment`)).toBeVisible();
          await expect(
            page.getByTestId(`moment-switcher-${moment}`),
          ).toHaveAttribute("aria-selected", "true");
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

          const legend = page.getByTestId("keyboard-legend");
          const palette = page.getByTestId("keyboard-legend-palette-button");
          const capture = page.getByTestId("capture-affordance");
          const expectUsefulTarget = async (
            control: import("@playwright/test").Locator,
          ) => {
            await expect(control).toBeVisible();
            await expect(control).toBeInViewport({ ratio: 1 });
            const box = await control.boundingBox();
            expect(box).not.toBeNull();
            expect(box!.width).toBeGreaterThanOrEqual(44);
            expect(box!.height).toBeGreaterThanOrEqual(44);
            expect(
              await control.evaluate((element) => {
                const rect = element.getBoundingClientRect();
                const hit = document.elementFromPoint(
                  rect.x + rect.width / 2,
                  rect.y + rect.height / 2,
                );
                return (
                  hit === element || (hit !== null && element.contains(hit))
                );
              }),
            ).toBe(true);
          };

          for (const position of ["top", "bottom"] as const) {
            await page.evaluate((where) => {
              window.scrollTo(
                0,
                where === "top" ? 0 : document.documentElement.scrollHeight,
              );
            }, position);
            // Short Flow pages used to add a second viewport floor below
            // the demo banner. At scroll-end this hid the tops of the tabs.
            // Long pages can scroll their normal-flow masthead away.
            let mastheadGeometry;
            if (moment === "flow" && width === 768) {
              const banner = page.getByTestId("demo-mode-banner");
              await expect(banner).toBeVisible();
              const bannerBox = (await banner.boundingBox())!;
              const tabBoxes = [];
              for (const value of ["start", "flow", "close"]) {
                const tab = page.getByTestId(`moment-switcher-${value}`);
                await expectUsefulTarget(tab);
                const box = (await tab.boundingBox())!;
                expect(box.y).toBeGreaterThanOrEqual(
                  bannerBox.y + bannerBox.height,
                );
                tabBoxes.push({ value, box });
              }
              const sizing = await page
                .getByTestId("moments-home-shell")
                .evaluate((shell) => ({
                  shellHeight: shell.getBoundingClientRect().height,
                  contentHeight:
                    shell.firstElementChild!.getBoundingClientRect().height,
                  viewportHeight: window.innerHeight,
                  scrollHeight: document.documentElement.scrollHeight,
                  scrollY: window.scrollY,
                }));
              expect(sizing.shellHeight + bannerBox.height).toBeLessThanOrEqual(
                sizing.viewportHeight + 1,
              );
              expect(
                sizing.contentHeight + bannerBox.height,
              ).toBeLessThanOrEqual(sizing.viewportHeight + 1);
              expect(sizing.scrollHeight).toBeLessThanOrEqual(
                sizing.viewportHeight + 1,
              );
              mastheadGeometry = { bannerBox, tabBoxes, sizing };
            }
            await expectUsefulTarget(capture);
            await expectUsefulTarget(palette);
            await expect(legend).toBeVisible();
            const pillBox = (await capture.boundingBox())!;
            const legendBox = (await legend.boundingBox())!;
            const paletteBox = (await palette.boundingBox())!;
            for (const box of [legendBox, paletteBox]) {
              const intersects =
                pillBox.x < box.x + box.width &&
                pillBox.x + pillBox.width > box.x &&
                pillBox.y < box.y + box.height &&
                pillBox.y + pillBox.height > box.y;
              expect(intersects).toBe(false);
            }
            const { scrollWidth, clientWidth } = await page.evaluate(() => ({
              scrollWidth: document.documentElement.scrollWidth,
              clientWidth: document.documentElement.clientWidth,
            }));
            expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
            expect(scrollWidth).toBeLessThanOrEqual(width + 1);
            await testInfo.attach(`${position}-overlay-geometry`, {
              body: JSON.stringify(
                {
                  observedClock,
                  mastheadGeometry,
                  pillBox,
                  legendBox,
                  paletteBox,
                  scrollWidth,
                  clientWidth,
                },
                null,
                2,
              ),
              contentType: "application/json",
            });

            if ([768, 1024, 1152, 1280].includes(width)) {
              const screenshotName = `overlay-review-${moment}-${width}-${clock.id}-${position}.png`;
              const screenshot = testInfo.outputPath(screenshotName);
              await page.screenshot({ path: screenshot, fullPage: false });
              await testInfo.attach(screenshotName, {
                path: screenshot,
                contentType: "image/png",
              });
            }

            if (position === "bottom") {
              await expectUsefulTarget(palette);
              await palette.click();
            } else {
              await page.keyboard.press("Control+k");
            }
            await expect(page.getByTestId("command-palette")).toBeVisible();
            await expect(
              page.getByTestId("command-palette-input"),
            ).toBeFocused();
            await page.keyboard.press("Escape");
            await expect(page.getByTestId("command-palette")).toHaveCount(0);
          }

          await expectUsefulTarget(capture);
          await capture.click();
          await expect(page.getByTestId("capture-overlay")).toBeVisible();
          await page.getByTestId("capture-overlay-close").click();
          await expect(page.getByTestId("capture-overlay")).toHaveCount(0);
          await testInfo.attach("pinned-runtime-errors", {
            body: JSON.stringify(
              { moment, width, clock, runtimeErrors },
              null,
              2,
            ),
            contentType: "application/json",
          });
          expect(
            runtimeErrors,
            "pinned overlay journeys must have no runtime errors",
          ).toEqual([]);
        });
      }
    }
  }
});
