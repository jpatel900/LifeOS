import { expect, test } from "@playwright/test";

/**
 * Moments pass P7 — parity proof (pre-flip).
 *
 * Before `/` is flipped to the moments home (P7b), these specs prove the
 * moments-native equivalents of the stage-chrome journeys work, running
 * against the dev-only `/moments-preview` route so they do not depend on the
 * flip and cannot regress the live stage specs. Each test names the stage
 * spec it establishes parity with.
 *
 * Parity boundary (documented, not a failure): the moments home hosts capture
 * and the Start -> Flow -> Close focus journey inline. Triage/Plan are reached
 * via summary sheets that link out to the demoted stage routes (P5 fallback),
 * and marking a session stuck/missed still lives in the stage review surface —
 * so those journeys stay proven by the existing stage specs until a later
 * packet brings them inline. This suite covers what the moments home owns.
 */

test.describe("moments home parity (/moments-preview)", () => {
  // Parity with capture-parse-mock.spec.ts: the moments capture surface
  // exercises the real /api/parse-capture route, answering in mock mode
  // without AI env.
  test("capture round-trips through /api/parse-capture in mock mode", async ({
    page,
  }) => {
    await page.goto("/moments-preview");
    await expect(page.getByTestId("today-moments")).toBeVisible();
    // The home's default moment is time-of-day derived, so pin it to Start for
    // a deterministic run regardless of the wall clock (1/2/3 switch moments).
    await page.keyboard.press("1");
    await expect(page.getByTestId("start-moment")).toBeVisible();

    const parseResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/parse-capture") &&
        response.request().method() === "POST",
    );

    await page.getByTestId("capture-affordance").click();
    const dialog = page.getByRole("dialog", { name: "Capture a thought" });
    await expect(dialog).toBeVisible();
    await page
      .getByTestId("capture-overlay-textarea")
      .fill("Mock mode parse proof capture");
    await page.getByTestId("capture-overlay-textarea").press("Enter");

    // The real parity claim (mirrors capture-parse-mock.spec.ts): the moments
    // capture surface round-trips through /api/parse-capture in mock mode. The
    // "Captured" toast is transient (~2.5s) and intentionally not asserted here.
    const parseResponse = await parseResponsePromise;
    expect(parseResponse.status()).toBe(200);
    const body = await parseResponse.json();
    expect(body.ok).toBe(true);
    expect(body.parser).toBe("mock");
    await expect(dialog).toBeHidden();
  });

  // Parity with the golden-journey / cockpit-flow-repair "start -> execute ->
  // complete" arc: starting the first move moves into Flow with a running
  // block hero, and the moment can be switched forward to Close.
  test("start-first-move enters Flow, and moments switch Start/Flow/Close", async ({
    page,
  }) => {
    await page.goto("/moments-preview");
    await expect(page.getByTestId("today-moments")).toBeVisible();

    // Start owns the single primary action. If the seeded state offers a first
    // move, taking it must land in Flow with the current-block hero.
    const firstMove = page.getByTestId("first-move-start");
    if (await firstMove.isVisible().catch(() => false)) {
      await firstMove.click();
      await expect(page.getByTestId("flow-moment")).toBeVisible();
      await expect(page.getByTestId("current-block-hero")).toBeVisible();
    }

    // Moment switching is keyboard-driven (1/2/3), mouse-free per UX-INV-5.
    await page.keyboard.press("3");
    await expect(page.getByTestId("close-moment")).toBeVisible();
    await page.keyboard.press("1");
    await expect(page.getByTestId("start-moment")).toBeVisible();
  });
});

// Layout regression guard (moments-home shell fix): the live `/` route
// (NEXT_PUBLIC_MOMENTS_HOME=true in this project's webServer config, see
// playwright.config.ts) rendered the moments home with no page shell —
// content sat flush against the viewport edges (zero left/right padding) and
// the StartMoment/CloseMoment two-column grids (main column + 20rem side
// rail) had no max-width container to bound them, so long real-world content
// in the side rail could push past the right edge (the scrollWidth check
// alone under empty/seeded demo data does not reproduce that — the flush
// edges do, and are what MomentsHomeShell's padding fixes). Two assertions:
// (1) scrollWidth never exceeds the viewport width — the direct overflow
// symptom, +1px tolerance for scrollbar/rounding; (2) the moments-home root
// has visible left/right padding (its bounding box does not start at x=0 nor
// end at the viewport's right edge) — the edge-flush symptom, which fails
// against the unfixed page.tsx even with the empty demo-mode dataset.
test.describe("moments home layout (/) has no horizontal overflow", () => {
  for (const width of [375, 1280]) {
    test(`scrollWidth <= viewport width and content is inset from the edges at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const root = page.getByTestId("today-moments");
      await expect(root).toBeVisible();

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
      expect(scrollWidth).toBeLessThanOrEqual(width + 1);

      const box = await root.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThan(0);
      expect(box!.x + box!.width).toBeLessThan(width);
    });
  }
});
