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

// #477: the floating "Capture a thought" pill (fixed bottom-center, see
// CaptureAffordance.tsx) must never overlap the Pipeline row — the last
// content row on a short/empty-state Start moment. D-3 (#483) replaced the
// collapsed disclosure with an always-visible stage rail
// (start-moment-pipeline-rail), so this now checks the rail directly rather
// than an expand/collapse row. The pill is `fixed`, so it never moves on
// scroll; the shell's reserved bottom clearance (pb-32 in MomentsHomeShell)
// only does its job once the page is scrolled all the way to its true end —
// that's the realistic "reached the bottom of a short page" moment, not the
// "nearest edge" a bare scrollIntoView would stop at (which parks the row at
// the viewport edge regardless of any reserved trailing space and would
// misreport an overlap on already-fixed code). Viewport heights are picked
// so the mobile case genuinely requires scrolling (its content is taller
// than 667px) while the desktop case's short two-column content stays a
// non-regression check. Pin the moment to Start (the Pipeline rail only
// renders there).
test.describe("moments home capture pill clears the Pipeline row (#477)", () => {
  for (const viewport of [
    { width: 375, height: 667 },
    { width: 1280, height: 900 },
  ]) {
    test(`capture pill does not intersect the Pipeline row at ${viewport.width}px`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await expect(page.getByTestId("today-moments")).toBeVisible();
      await page.keyboard.press("1");
      await expect(page.getByTestId("start-moment")).toBeVisible();

      const pill = page.getByTestId("capture-affordance");
      const pipeline = page.getByTestId("start-moment-pipeline-rail");
      await expect(pill).toBeVisible();
      await expect(pipeline).toBeVisible();
      await page.evaluate(() =>
        window.scrollTo(0, document.documentElement.scrollHeight),
      );

      const pillBox = await pill.boundingBox();
      const pipelineBox = await pipeline.boundingBox();
      expect(pillBox).not.toBeNull();
      expect(pipelineBox).not.toBeNull();

      const intersects =
        pillBox!.x < pipelineBox!.x + pipelineBox!.width &&
        pillBox!.x + pillBox!.width > pipelineBox!.x &&
        pillBox!.y < pipelineBox!.y + pipelineBox!.height &&
        pillBox!.y + pillBox!.height > pipelineBox!.y;

      expect(intersects).toBe(false);
    });
  }
});
