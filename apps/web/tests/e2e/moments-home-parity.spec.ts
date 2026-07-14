import { expect, test } from "@playwright/test";

/**
 * Moments pass P7 — parity proof (pre-flip).
 *
 * These specs prove the moments-native equivalents of the stage-chrome
 * journeys work, running against `/` (this suite's webServer sets
 * NEXT_PUBLIC_MOMENTS_HOME=true, see playwright.config.ts) so they cannot
 * regress the live stage specs. Each test names the stage spec it
 * establishes parity with.
 *
 * Parity boundary (documented, not a failure): the moments home hosts capture
 * and the Start -> Flow -> Close focus journey inline. Triage/Plan are reached
 * via summary sheets that link out to the demoted stage routes (P5 fallback),
 * and marking a session stuck/missed still lives in the stage review surface —
 * so those journeys stay proven by the existing stage specs until a later
 * packet brings them inline. This suite covers what the moments home owns.
 */

test.describe("moments home parity (/)", () => {
  // Parity with capture-parse-mock.spec.ts: the moments capture surface
  // exercises the real /api/parse-capture route, answering in mock mode
  // without AI env.
  test("capture round-trips through /api/parse-capture in mock mode", async ({
    page,
  }) => {
    await page.goto("/");
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
    const textarea = page.getByTestId("capture-overlay-textarea");
    await textarea.fill("Mock mode parse proof capture");
    await page.getByTestId("capture-overlay-return-hook").fill("the inbox");
    await textarea.press("Enter");

    // #556 FR-026 containment: held in context through the wait — the raw
    // text and return hook stay fully visible, the dialog does not close the
    // instant Enter is pressed, and no capture can begin again while this
    // one is in flight (Close is disabled).
    await expect(dialog).toBeVisible();
    await expect(textarea).toHaveValue("Mock mode parse proof capture");
    await expect(page.getByTestId("capture-overlay-return-hook")).toHaveValue(
      "the inbox",
    );
    await expect(page.getByTestId("capture-overlay-close")).toBeDisabled();

    // The real parity claim (mirrors capture-parse-mock.spec.ts): the moments
    // capture surface round-trips through /api/parse-capture in mock mode.
    const parseResponse = await parseResponsePromise;
    expect(parseResponse.status()).toBe(200);
    const body = await parseResponse.json();
    expect(body.ok).toBe(true);
    expect(body.parser).toBe("mock");

    // Containment's closing beat, still inside the dialog before it closes:
    // the "back to: <hook>" conclusion.
    await expect(page.getByTestId("capture-overlay-conclusion")).toContainText(
      "back to: the inbox",
    );

    // The "Captured" toast is transient (~2.5s) and intentionally not
    // asserted here.
    await expect(dialog).toBeHidden();

    // #551 state truth: the capture just landed in triage as a pending
    // draft, so the Start column must show that visibly rather than still
    // reading "Nothing queued".
    await expect(page.getByTestId("start-pending-triage")).toBeVisible();
    await expect(page.getByTestId("start-pending-triage")).toHaveText(
      /waiting for a decision/,
    );
  });

  // Parity with the golden-journey / cockpit-flow-repair "start -> execute ->
  // complete" arc: starting the first move moves into Flow with a running
  // block hero, and the moment can be switched forward to Close.
  test("start-first-move enters Flow, and moments switch Start/Flow/Close", async ({
    page,
  }) => {
    await page.goto("/");
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

// #553 (2026-07-13 owner-lens audit): at 390x844 the pill visibly covered two
// rows of the Areas card (side-rail-areas-card, SideRail.tsx) on the Start
// moment's default empty-state load. As #477's comment above documents, a
// viewport-fixed always-visible pill can transiently sit over whatever
// content occupies its band at scroll offsets other than the true end of the
// page — that's inherent to a persistent FAB and not something bottom
// padding can fix (padding only reserves space *after* the last child; it
// cannot move earlier content, like the Areas card, out of the pill's band
// before the user scrolls). What IS a real, fixable regression is the pill
// still sitting over the Areas card once the page is scrolled all the way to
// its true end — exactly the guarantee #477 established for the Pipeline
// row and MomentsThemeShell's reserved bottom padding is supposed to
// provide. This extends that same guard to the Areas card, at the issue's
// literal 390px viewport plus a 1280px desktop case to prove no regression
// there (the pill's size/position is breakpoint-independent — see #477's
// page.tsx comment — so desktop, whose content is short enough to never
// need scrolling, should already pass and stays a non-regression check).
test.describe("moments home capture pill clears the Areas card (#553)", () => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1280, height: 900 },
  ]) {
    test(`capture pill does not intersect the Areas card at ${viewport.width}px`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await expect(page.getByTestId("today-moments")).toBeVisible();
      await page.keyboard.press("1");
      await expect(page.getByTestId("start-moment")).toBeVisible();

      const pill = page.getByTestId("capture-affordance");
      const areasCard = page.getByTestId("side-rail-areas-card");
      await expect(pill).toBeVisible();
      await expect(areasCard).toBeVisible();
      await page.evaluate(() =>
        window.scrollTo(0, document.documentElement.scrollHeight),
      );

      const pillBox = await pill.boundingBox();
      const areasBox = await areasCard.boundingBox();
      expect(pillBox).not.toBeNull();
      expect(areasBox).not.toBeNull();

      const intersects =
        pillBox!.x < areasBox!.x + areasBox!.width &&
        pillBox!.x + pillBox!.width > areasBox!.x &&
        pillBox!.y < areasBox!.y + areasBox!.height &&
        pillBox!.y + pillBox!.height > areasBox!.y;

      expect(intersects).toBe(false);
    });
  }
});

// #574 (epic #555 item 6, mobile shell): below 640px a fixed bottom
// navigator (BottomNavigator.tsx) now carries the Start/Flow/Close switch +
// Settings link into the thumb zone. Mirrors the #553 pill/Areas-card
// overlap guard above: visibility at the issue's literal 390x844 viewport,
// plus a geometric non-intersection check against the capture pill (the
// other fixed bottom-band element) once scrolled to the true end of the
// page — same "reached the bottom of a short page" rationale #477/#553
// already established for why that's the meaningful check for two
// viewport-fixed elements.
test.describe("moments home bottom navigator (#574)", () => {
  test("bottom navigator is visible at 390x844 and never overlaps the capture pill", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.getByTestId("today-moments")).toBeVisible();
    await page.keyboard.press("1");
    await expect(page.getByTestId("start-moment")).toBeVisible();

    const nav = page.getByTestId("bottom-navigator");
    const pill = page.getByTestId("capture-affordance");
    await expect(nav).toBeVisible();
    await expect(pill).toBeVisible();

    // Thumb-zone reachability: both the moment switch and Settings are in
    // the bottom navigator, with no scroll required.
    await expect(
      page.getByTestId("moment-switcher-bottom-nav-start"),
    ).toBeVisible();
    await expect(
      page.getByTestId("bottom-navigator-settings-link"),
    ).toBeVisible();

    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );

    const navBox = await nav.boundingBox();
    const pillBox = await pill.boundingBox();
    expect(navBox).not.toBeNull();
    expect(pillBox).not.toBeNull();

    const intersects =
      navBox!.x < pillBox!.x + pillBox!.width &&
      navBox!.x + navBox!.width > pillBox!.x &&
      navBox!.y < pillBox!.y + pillBox!.height &&
      navBox!.y + navBox!.height > pillBox!.y;

    expect(intersects).toBe(false);
  });

  test("bottom navigator is not rendered at 1280px (desktop keeps the header switcher only)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await expect(page.getByTestId("today-moments")).toBeVisible();
    await expect(page.getByTestId("bottom-navigator")).toBeHidden();
  });
});

// MANUAL VERIFICATION NOTE (#553): what this guard does not, and cannot,
// prove — on the Start moment's default *unscrolled* load at 390px, the
// pill still visibly sits over the bottom of the Areas card (verified by
// screenshot during this fix; scroll=0 pill/Areas bounding boxes do
// intersect). #553's centering fix (CaptureAffordance.tsx) shrank the pill
// from two lines/~70px tall to one line/~46px, which measurably reduces how
// much of the card it covers, but does not eliminate the overlap — doing
// that fully would mean either giving up "always visible without
// scrolling" or bounding this shell to its own internally-scrolled pane
// (a structural change out of scope for this fix; see MomentsThemeShell.tsx
// and page.tsx for the tradeoff notes). Flagged for a follow-up product
// decision (e.g. auto-hiding the pill while scrolling, or condensing the
// empty-state's Waiting-on/Areas cards) rather than silently declared fixed.

// D-6 (#483): the bottom-left keyboard legend (KeyboardLegend.tsx) must never
// overlap or crowd the fixed capture pill. The legend hides below `sm`
// (matching the prototype's own <720px cutoff) so mobile is a visibility
// check; at desktop width both are visible and geometrically checked for
// overlap, mirroring the #477 pill/pipeline guard above.
test.describe("moments home keyboard legend clears the capture pill (#483 D-6)", () => {
  test("legend is hidden below the sm breakpoint at 375px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    await expect(page.getByTestId("today-moments")).toBeVisible();
    await expect(page.getByTestId("capture-affordance")).toBeVisible();
    await expect(page.getByTestId("keyboard-legend")).toBeHidden();
  });

  test("legend does not intersect the capture pill at 1280px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await expect(page.getByTestId("today-moments")).toBeVisible();

    const pill = page.getByTestId("capture-affordance");
    const legend = page.getByTestId("keyboard-legend");
    await expect(pill).toBeVisible();
    await expect(legend).toBeVisible();

    const pillBox = await pill.boundingBox();
    const legendBox = await legend.boundingBox();
    expect(pillBox).not.toBeNull();
    expect(legendBox).not.toBeNull();

    const intersects =
      pillBox!.x < legendBox!.x + legendBox!.width &&
      pillBox!.x + pillBox!.width > legendBox!.x &&
      pillBox!.y < legendBox!.y + legendBox!.height &&
      pillBox!.y + pillBox!.height > legendBox!.y;

    expect(intersects).toBe(false);
  });
});
