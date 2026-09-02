import { expect, test } from "@playwright/test";
import { stubParseCaptureRoute } from "./helpers/mockParseCapture";

// HIGH-1 (#670): /api/parse-capture requires a verified bearer token and the
// E2E dev server has no Supabase env, so every capture flow in this file runs
// against the deterministic mock-parser stub (task-map lifecycle precedent).
test.beforeEach(async ({ page }) => {
  await stubParseCaptureRoute(page);
});

// #687 main-red incident (2026-09-02): `formatMastheadDate` renders a real
// weekday + day + month string, and its width varies with the calendar.
// This is the MEASURED widest value it can ever render — swept every
// weekday name against every month name against a 1- and 2-digit day via an
// in-page canvas `measureText` using the date span's own computed font
// (Inter): "Wednesday" is the longest weekday (9 chars), and among the two
// 9-char months ("September") a 2-digit day is wider than a 1-digit one, so
// the true maximum is a 2-digit-day Wednesday in September. 2026-09-30 is
// the highest such day this calendar year (getDate() width is who-cares
// beyond 2 digits — every 2-digit day measures the same to within rounding).
// `new Date("...T09:00:00")` (no `Z`/offset) is parsed as LOCAL time, so
// which weekday it resolves to depends on the runner's timezone — pinning
// `timezoneId` alongside this string is what makes "2026-09-30" reliably
// mean Wednesday everywhere (the exact gap this fix's review caught: this
// literal, unpinned, renders as Thursday the 17th under
// `PLAYWRIGHT_TZ=Pacific/Auckland`).
const MASTHEAD_DATE_WORST_CASE_ISO = "2026-09-30T09:00:00";
const MASTHEAD_DATE_WORST_CASE_TIMEZONE = "America/Toronto";

async function pinMastheadWorstCaseDate(page: import("@playwright/test").Page) {
  await page.clock.setFixedTime(new Date(MASTHEAD_DATE_WORST_CASE_ISO));
}

/**
 * Moments pass P7 — parity proof (pre-flip).
 *
 * These specs prove the moments-native equivalents of the stage-chrome
 * journeys work, running against `/` (this suite's webServer sets
 * NEXT_PUBLIC_MOMENTS_HOME=true, see playwright.config.ts) so they cannot
 * regress the live stage specs. Each test names the stage spec it
 * establishes parity with.
 *
 * Parity boundary (documented, not a failure): the moments home hosts capture,
 * the Start -> Flow -> Close focus journey, and — since #703 — the triage
 * sheet's Sort action inline. Plan is still reached via a summary sheet that
 * links out to the demoted stage routes (P5 fallback), and marking a session
 * stuck/missed still lives in the stage review surface — so those journeys
 * stay proven by the existing stage specs until a later packet brings them
 * inline. This suite covers what the moments home owns.
 */

test.describe("moments home parity (/)", () => {
  // Parity with capture-parse-mock.spec.ts, re-anchored for #703: capture is
  // a pure raw save, and the moments home's own triage sheet is what
  // round-trips through /api/parse-capture in mock mode via its Sort action.
  // The round-trip assertion MOVED here from the capture step with the parse
  // itself — it did not go away. HIGH-1 (#670): the route requires a verified
  // bearer token and E2E has no Supabase env, so the route is stubbed with
  // the deterministic mock-parser payload.
  test("capture saves raw, then triage Sort round-trips through /api/parse-capture in mock mode", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("today-moments")).toBeVisible();
    // The home's default moment is time-of-day derived, so pin it to Start for
    // a deterministic run regardless of the wall clock (1/2/3 switch moments).
    await page.keyboard.press("1");
    await expect(page.getByTestId("start-moment")).toBeVisible();

    await page.getByTestId("capture-affordance").click();
    const dialog = page.getByRole("dialog", { name: "Capture a thought" });
    await expect(dialog).toBeVisible();
    const textarea = page.getByTestId("capture-overlay-textarea");
    await textarea.fill("Mock mode parse proof capture");
    await page.getByTestId("capture-overlay-return-hook").fill("the inbox");

    // #703: one action. The second save button is gone from this surface.
    await expect(page.getByTestId("capture-overlay-save")).toHaveText(
      "Capture",
    );
    await expect(page.getByTestId("capture-overlay-save-raw")).toHaveCount(0);
    await textarea.press("Enter");

    // #556 FR-026 containment, re-anchored: there is no parse wait to sit
    // through any more, but the dialog still holds the person in context
    // through the closing beat — the raw text and return hook stay fully
    // visible, the dialog does not vanish the instant Enter is pressed, and
    // no new capture can begin while the conclusion is on screen (Close is
    // disabled). The parse-wait spinner has no trigger here and must not
    // appear at all.
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId("capture-overlay-parsing")).toHaveCount(0);
    await expect(textarea).toHaveValue("Mock mode parse proof capture");
    await expect(page.getByTestId("capture-overlay-return-hook")).toHaveValue(
      "the inbox",
    );
    await expect(page.getByTestId("capture-overlay-close")).toBeDisabled();

    // Containment's closing beat, still inside the dialog before it closes:
    // the "back to: <hook>" conclusion.
    await expect(page.getByTestId("capture-overlay-conclusion")).toContainText(
      "back to: the inbox",
    );

    // The "Captured" toast is transient (~2.5s) and intentionally not
    // asserted here.
    await expect(dialog).toBeHidden();

    // #551 state truth: the capture just landed in triage awaiting a
    // decision, so the Start column must show that visibly rather than still
    // reading "Nothing queued". With no first move queued (empty demo
    // state), the pending item is PROMOTED into the flagship card
    // (start-pending-triage-card); with a first move present it renders as
    // the start-pending-triage line under the card. Either is the truth —
    // assert the surface that actually hosts it.
    const pendingTriageSurface = page
      .getByTestId("start-pending-triage-card")
      .or(page.getByTestId("start-pending-triage"));
    await expect(pendingTriageSurface).toBeVisible();
    await expect(pendingTriageSurface).toContainText(/waiting for a decision/);

    // --- Triage: the thought is listed, unsorted, and nothing parsed yet ---
    await page.getByTestId("pipeline-overview-stage-triage").click();
    const capturesList = page.getByTestId("triage-sheet-captures");
    await expect(capturesList).toBeVisible({ timeout: 15_000 });
    await expect(capturesList).toContainText("Mock mode parse proof capture");
    await expect(capturesList).toContainText("Saved as you wrote it");
    await expect(page.getByTestId("triage-sheet-list")).toHaveCount(0);

    // --- Sort: the parity claim, on the action that now owns the parse ----
    const parseResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/parse-capture") &&
        response.request().method() === "POST",
    );

    await page
      .getByTestId(/^triage-sheet-sort-/)
      .first()
      .click();

    const parseResponse = await parseResponsePromise;
    expect(parseResponse.status()).toBe(200);
    const body = await parseResponse.json();
    expect(body.ok).toBe(true);
    expect(body.parser).toBe("mock");

    // ...and the round-trip produced a reviewable draft on this surface.
    const draftList = page.getByTestId("triage-sheet-list");
    await expect(draftList).toBeVisible({ timeout: 15_000 });
    await expect(draftList).toContainText("Mock mode parse proof capture");
    await expect(page.getByRole("button", { name: "Do today" })).toBeVisible();
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
// #593: the pill is desktop-only now (`hidden sm:flex`) — the mobile capture
// action lives in the BottomNavigator band, and the mobile zero-intersection
// contract is proven by the #593 guard below. This check keeps the desktop
// pill honest.
test.describe("moments home capture pill clears the Pipeline row (#477)", () => {
  for (const viewport of [{ width: 1280, height: 900 }]) {
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

// R4-A (premium push #483 round 4): the #477 guard above only ever checked
// one viewport (1280x900) at the scrolled-to-the-true-end position. Neither
// caught the actual round-3 regression — at 1366x768 (the owner's real
// laptop viewport), R3-A's LoopOrientation card grew the empty-day page
// just tall enough that the pill covered real content (the last card's
// caption row, mid-word) at the NATURAL, unscrolled load — not a scroll
// position the trailing shell padding (MomentsThemeShell's pb-*, scoped to
// the true scroll end) can ever reach. R4-A deleted LoopOrientation (merged
// its content into the pipeline rail's own empty state, see
// PipelineOverview.tsx), which is most of the fix, but the guarantee this
// extends to prove is content-height-independent: on the genuinely-empty
// Start day, at EVERY one of these desktop heights, in BOTH scroll
// positions, the pill must never cover the rail, the schedule card, or the
// Areas card. Unlike the #593 mobile-band guard's `endsAboveFold` carve-out
// (written for content that's still reachable by scrolling further), scroll
// ZERO here gets a STRICT check: the empty day is short enough that there's
// nothing further below to scroll to reveal — a covered caption at rest is
// exactly the "tim" cut-off bug, whether or not the user could later scroll
// clear of it.
test.describe("moments home capture pill clears content on the empty Start day at every desktop height (#483 round 4)", () => {
  // See MASTHEAD_DATE_WORST_CASE_TIMEZONE's own comment above.
  test.use({ timezoneId: MASTHEAD_DATE_WORST_CASE_TIMEZONE });

  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1280, height: 800 },
    { width: 1440, height: 900 },
  ]) {
    test(`pill never covers the rail/schedule/areas card at ${viewport.width}x${viewport.height}, scroll 0 and end`, async ({
      page,
    }) => {
      // Pinned to the masthead date's own measured worst case (see
      // MASTHEAD_DATE_WORST_CASE_ISO's comment above). Left unpinned, this
      // guard measured the real wall-clock date and silently passed on
      // every day except the ~4/7 where the weekday name was long enough
      // to overflow the masthead's width budget and wrap the header to a
      // second line — exactly what broke main on 2026-09-02 (a Wednesday)
      // despite this file having run green on every prior date. Pinning to
      // the measured maximum proves the fix holds under the worst case on
      // every run, not just on short-weekday days.
      await pinMastheadWorstCaseDate(page);
      await page.setViewportSize(viewport);
      await page.goto("/");
      await expect(page.getByTestId("today-moments")).toBeVisible();
      await page.keyboard.press("1");
      await expect(page.getByTestId("start-moment")).toBeVisible();

      const pill = page.getByTestId("capture-affordance");
      const rail = page.getByTestId("start-moment-pipeline-rail");
      const schedule = page.getByTestId("start-schedule-card");
      const areas = page.getByTestId("side-rail-areas-card");
      await expect(pill).toBeVisible();
      await expect(rail).toBeVisible();
      await expect(schedule).toBeVisible();
      await expect(areas).toBeVisible();

      // Truthful-data precondition: this guard is about the genuinely-empty
      // day (the only state the deleted LoopOrientation ever rendered for),
      // proven by the rail itself sitting in explain mode — a caption cell,
      // not a numeral badge.
      await expect(
        page.getByTestId("pipeline-overview-caption-capture"),
      ).toBeVisible();

      const intersects = (
        a: { x: number; y: number; width: number; height: number },
        b: { x: number; y: number; width: number; height: number },
      ) =>
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y;

      for (const position of ["zero", "end"] as const) {
        await page.evaluate((pos) => {
          window.scrollTo(
            0,
            pos === "zero" ? 0 : document.documentElement.scrollHeight,
          );
        }, position);

        const pillBox = await pill.boundingBox();
        expect(pillBox, `pill box at scroll ${position}`).not.toBeNull();

        for (const [name, locator] of [
          ["pipeline rail", rail],
          ["schedule card", schedule],
          ["areas card", areas],
        ] as const) {
          const box = await locator.boundingBox();
          expect(box, `${name} box at scroll ${position}`).not.toBeNull();
          expect(
            intersects(pillBox!, box!),
            `pill intersects ${name} at scroll ${position} (${viewport.width}x${viewport.height})`,
          ).toBe(false);
        }
      }
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
// #593: mobile (390x844) moved to the #593 band guard below — the pill no
// longer renders there. Desktop non-regression retained.
test.describe("moments home capture pill clears the Areas card (#553)", () => {
  for (const viewport of [{ width: 1280, height: 900 }]) {
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
// Settings link into the thumb zone. #593 update: the capture pill no
// longer exists below `sm` — the navigator now carries the capture action
// itself (one bottom-band action model), so this guard asserts the pill's
// mobile absence and the in-band capture button's presence instead of
// managing an overlap between two fixed elements.
test.describe("moments home bottom navigator (#574)", () => {
  test("bottom navigator at 390x844 carries moment switch, capture, and settings; the pill is gone", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.getByTestId("today-moments")).toBeVisible();
    await page.keyboard.press("1");
    await expect(page.getByTestId("start-moment")).toBeVisible();

    const nav = page.getByTestId("bottom-navigator");
    await expect(nav).toBeVisible();
    // #593: the floating pill is desktop-only; capture lives in the band.
    await expect(page.getByTestId("capture-affordance")).toBeHidden();
    const captureButton = page.getByTestId("bottom-navigator-capture");
    await expect(captureButton).toBeVisible();
    const captureBox = await captureButton.boundingBox();
    expect(captureBox!.height).toBeGreaterThanOrEqual(44);
    expect(captureBox!.width).toBeGreaterThanOrEqual(44);

    // Thumb-zone reachability: both the moment switch and Settings are in
    // the bottom navigator, with no scroll required.
    await expect(
      page.getByTestId("moment-switcher-bottom-nav-start"),
    ).toBeVisible();
    await expect(
      page.getByTestId("bottom-navigator-settings-link"),
    ).toBeVisible();
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

// #593 (audit #2) — resolves the #553 manual-verification gap that used to
// live here: the unscrolled-view pill/Areas overlap was inherent to a
// mid-viewport floating pill, so the pill no longer renders below `sm` at
// all. The mobile capture action moved into the BottomNavigator band (one
// bottom-band action model). The band is the only fixed bottom element on
// mobile now, so pairwise capture/nav/content intersection reduces to
// nav-vs-Pipeline and nav-vs-Areas.
//
// Invariant, at 375x667 AND 390x844:
// - scroll END: strict zero intersection — the shell's reserved clearance
//   must fully clear the band (the #477/#553 guarantee).
// - scroll ZERO: an intersection is a violation ONLY if the covered element
//   ends above the viewport bottom. An element that continues past the
//   fold sliding under an edge-docked translucent bar is inherent to every
//   fixed bottom nav (content height varies with platform font metrics —
//   this exact case passed on Windows and failed on CI Linux) and is
//   recoverable by scrolling, unlike the mid-viewport floater #553 flagged,
//   which covered content that could never scroll clear of it.
test.describe("mobile bottom band never intersects content (#593)", () => {
  for (const viewport of [
    { width: 375, height: 667 },
    { width: 390, height: 844 },
  ]) {
    test(`band clears Pipeline and Areas at ${viewport.width}x${viewport.height}, scroll 0 and end`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await expect(page.getByTestId("today-moments")).toBeVisible();
      await page.keyboard.press("1");
      await expect(page.getByTestId("start-moment")).toBeVisible();

      const nav = page.getByTestId("bottom-navigator");
      await expect(nav).toBeVisible();
      await expect(page.getByTestId("capture-affordance")).toBeHidden();

      const pipeline = page.getByTestId("start-moment-pipeline-rail");
      const areasCard = page.getByTestId("side-rail-areas-card");
      await expect(pipeline).toBeVisible();
      await expect(areasCard).toBeVisible();

      for (const position of ["zero", "end"] as const) {
        await page.evaluate((pos) => {
          window.scrollTo(
            0,
            pos === "zero" ? 0 : document.documentElement.scrollHeight,
          );
        }, position);

        const navBox = await nav.boundingBox();
        expect(navBox).not.toBeNull();

        for (const [name, locator] of [
          ["pipeline", pipeline],
          ["areas", areasCard],
        ] as const) {
          const box = await locator.boundingBox();
          expect(box, `${name} box at scroll ${position}`).not.toBeNull();
          const intersects =
            navBox!.x < box!.x + box!.width &&
            navBox!.x + navBox!.width > box!.x &&
            navBox!.y < box!.y + box!.height &&
            navBox!.y + navBox!.height > box!.y;
          // Below-fold continuation sliding under the edge-docked band is
          // allowed at scroll zero (see the describe comment); everything
          // else — and the entire scroll-end state — must be clear.
          const endsAboveFold = box!.y + box!.height <= viewport.height;
          const violation = intersects && (position === "end" || endsAboveFold);
          expect(
            violation,
            `bottom band intersects ${name} at scroll ${position} (${viewport.width}px)`,
          ).toBe(false);
        }
      }
    });
  }
});

// R5 (premium push #483 round 5, blocker 1): the explain-mode rail
// (PipelineOverview.tsx, all-zero counts) used to silently clip stages at
// narrow/mid viewports — measured before the fix: 196px hidden at 640px
// width (Execute AND Review gone entirely), 44-81px hidden at 375-430px
// (Review clipped). This app's truthfulness doctrine treats silently
// dropped content as worse than an imperfect display, so the fix is
// structural (a wrapping grid below `lg:`, see the component's R5 doc
// comment), not a scroll affordance — every stage must be FULLY visible
// (not just present in the DOM) at every one of these widths. This guard
// checks both rail modes: explain mode (the default empty day) and counts
// mode (after a real capture moves a stage off zero), since the pre-fix bug
// affected both, just by different amounts.
test.describe("moments home Pipeline rail never clips a stage, in either mode (#483 round 5, blocker 1)", () => {
  for (const width of [375, 390, 430, 640, 1366]) {
    test(`explain mode: every stage cell is fully within the viewport at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await expect(page.getByTestId("today-moments")).toBeVisible();
      await page.keyboard.press("1");
      await expect(page.getByTestId("start-moment")).toBeVisible();
      await expect(
        page.getByTestId("pipeline-overview-caption-capture"),
      ).toBeVisible();

      for (const stage of ["capture", "triage", "plan", "execute", "review"]) {
        const cell = page.getByTestId(`pipeline-overview-stage-${stage}`);
        await expect(cell).toBeVisible();
        const box = await cell.boundingBox();
        expect(box, `${stage} cell box at ${width}px`).not.toBeNull();
        expect(
          box!.width,
          `${stage} cell has real width at ${width}px`,
        ).toBeGreaterThan(0);
        expect(
          box!.x + box!.width,
          `${stage} cell's right edge stays within the ${width}px viewport`,
        ).toBeLessThanOrEqual(width + 1);
        expect(
          box!.x,
          `${stage} cell's left edge stays within the ${width}px viewport`,
        ).toBeGreaterThanOrEqual(0);
      }

      // The rail must never force the page itself wider than the viewport.
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
    });
  }

  test("counts mode: every stage cell is fully within the viewport at every width, after a real capture", async ({
    page,
  }) => {
    // Perform one real capture (parity with the mock-mode capture test
    // above) so every stage cell renders a numeral badge, not a caption —
    // the pre-fix bug's smaller ~18-81px counts-mode clip at narrow widths.
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto("/");
    await expect(page.getByTestId("today-moments")).toBeVisible();
    await page.keyboard.press("1");
    await page.getByTestId("capture-affordance").click();
    const textarea = page.getByTestId("capture-overlay-textarea");
    await expect(textarea).toBeVisible();
    await textarea.fill("Round 5 counts-mode rail guard capture");
    await textarea.press("Enter");
    await expect(page.getByTestId("capture-overlay-textarea")).toBeHidden();

    for (const width of [375, 390, 430, 640, 1366]) {
      await page.setViewportSize({ width, height: 900 });
      await page.reload();
      await expect(page.getByTestId("today-moments")).toBeVisible();
      await page.keyboard.press("1");
      await expect(page.getByTestId("start-moment")).toBeVisible();
      await expect(
        page.getByTestId("pipeline-overview-count-capture"),
      ).toBeVisible();

      for (const stage of ["capture", "triage", "plan", "execute", "review"]) {
        const cell = page.getByTestId(`pipeline-overview-stage-${stage}`);
        const box = await cell.boundingBox();
        expect(
          box,
          `${stage} cell box at ${width}px (counts mode)`,
        ).not.toBeNull();
        expect(
          box!.x + box!.width,
          `${stage} cell's right edge stays within ${width}px (counts mode)`,
        ).toBeLessThanOrEqual(width + 1);
      }
    }
  });
});

// R5 (premium push #483 round 5, blocker 2): R4-A's own honest disclosure —
// clearance under SideRail's Areas card was only 4.78-7.33px with the demo
// seed's 4 areas, and arithmetic proved a 5th area would go negative (each
// row ~32.8px, no cap existed). The fix bounds the Areas list to a fixed
// height (AreaHealthDots.tsx/globals.css's --rail-areas-max-h) regardless of
// area count, so this guard asserts a real numeric MARGIN — not just
// non-intersection — at the owner's real 1366x768 viewport, in both scroll
// positions and both themes, with the real (currently 4-area) demo seed.
// >=20px is a deliberately generous floor versus the ~55.78px this fix
// measured in development: real-browser/headless font-metric variance was
// itself ~2.5px on the OLD single-digit-px baseline (see R4-A), so a floor
// well above that noise band is what actually proves the fix, not a bare
// `> 0`.
test.describe("moments home capture pill keeps a real clearance margin under the Areas card, regardless of theme (#483 round 5, blocker 2)", () => {
  // See MASTHEAD_DATE_WORST_CASE_TIMEZONE's own comment above.
  test.use({ timezoneId: MASTHEAD_DATE_WORST_CASE_TIMEZONE });

  for (const theme of ["light", "dark"] as const) {
    test(`pill clears the Areas card by a real margin at 1366x768 in ${theme} theme, scroll 0 and end`, async ({
      page,
    }) => {
      // Pinned for the same reason as the R4-A guard above: the masthead
      // date string's width varies by weekday name length, and an unpinned
      // real clock only exercises that variance on whichever day CI happens
      // to run — it silently passed on every date but the worst-case
      // weekdays (see 2026-09-02, a Wednesday). See
      // MASTHEAD_DATE_WORST_CASE_ISO's own comment for the measured
      // maximum this is now pinned to.
      await pinMastheadWorstCaseDate(page);
      await page.setViewportSize({ width: 1366, height: 768 });
      await page.goto("/");
      await expect(page.getByTestId("today-moments")).toBeVisible();
      await page.evaluate((t) => localStorage.setItem("theme", t), theme);
      await page.reload();
      await expect(page.getByTestId("today-moments")).toBeVisible();
      await page.keyboard.press("1");
      await expect(page.getByTestId("start-moment")).toBeVisible();

      const pill = page.getByTestId("capture-affordance");
      const areasCard = page.getByTestId("side-rail-areas-card");
      await expect(pill).toBeVisible();
      await expect(areasCard).toBeVisible();

      // Truthfulness precondition: capping the list must never remove an
      // area from the DOM. The demo seed's real area count stays reachable
      // regardless of the internal scroll pane.
      const areaRowCount = await page
        .locator('[data-testid^="area-health-row-"]')
        .count();
      expect(areaRowCount).toBeGreaterThan(0);

      for (const position of ["zero", "end"] as const) {
        await page.evaluate((pos) => {
          window.scrollTo(
            0,
            pos === "zero" ? 0 : document.documentElement.scrollHeight,
          );
        }, position);

        const pillBox = await pill.boundingBox();
        const areasBox = await areasCard.boundingBox();
        expect(pillBox, `pill box at scroll ${position}`).not.toBeNull();
        expect(areasBox, `areas box at scroll ${position}`).not.toBeNull();

        const clearance = pillBox!.y - (areasBox!.y + areasBox!.height);
        expect(
          clearance,
          `pill-to-areas-card clearance at scroll ${position} (${theme} theme) was ${clearance}px`,
        ).toBeGreaterThan(20);
      }
    });
  }
});

// #687 structural-fix verification (fixes main red at a629d608, part of the
// masthead-date-wrap incident): the R4-A/R5 guards above pin the masthead
// DATE string's own worst case, but the masthead's width budget is also
// squeezed by the CONTROL CLUSTER on the same row — a longer selected-area
// name (AreaSelector) or the AuthAffordance "Sign in"/who pill (rendered
// only once Supabase is configured; CI's device tier runs in demo mode,
// where AuthAffordance renders nothing, so this pressure is otherwise
// invisible to this whole suite). An earlier version of this fix reclaimed
// a fixed number of px via tighter gaps — that only ever covers the
// specific width deficit it was measured against, and review found real
// combinations (worst-case date + "Volunteer Work" selected; worst-case
// date + a simulated auth pill) that still re-wrapped the header and drove
// clearance negative even with that fix applied. The STRUCTURAL fix
// (TodayMoments.tsx's brand+date row: `flex-nowrap` + `min-w-0` + a
// truncating date span) has no such budget to exhaust — the date span
// degrades to an ellipsis under ANY amount of width pressure instead of
// wrapping the header, so clearance should hold regardless of what else is
// squeezing the row. This proves that directly, stacking the worst-case
// date with each width-pressure source individually.
test.describe("moments home masthead never wraps under combined width pressure (#687 structural fix verification)", () => {
  test.use({ timezoneId: MASTHEAD_DATE_WORST_CASE_TIMEZONE });

  const DESKTOP_VIEWPORTS = [
    { width: 1280, height: 900 },
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
  ];

  // #574/#593: AreaSelector's rendered width scales with the selected
  // area's name. "Volunteer Work" is the demo seed's longest area name
  // (tied with "Side Project" by word count but wider glyphs) — see
  // TodayMoments.tsx's own `<header>` comment history for why this
  // specific name has reopened the masthead-wrap bug before.
  const VOLUNTEER_WORK_AREA_ID = "area-volunteer";

  async function measureClearance(page: import("@playwright/test").Page) {
    const pill = page.getByTestId("capture-affordance");
    const areasCard = page.getByTestId("side-rail-areas-card");
    await expect(pill).toBeVisible();
    await expect(areasCard).toBeVisible();

    const results: Record<string, number> = {};
    for (const position of ["zero", "end"] as const) {
      await page.evaluate((pos) => {
        window.scrollTo(
          0,
          pos === "zero" ? 0 : document.documentElement.scrollHeight,
        );
      }, position);
      const pillBox = await pill.boundingBox();
      const areasBox = await areasCard.boundingBox();
      expect(pillBox, `pill box at scroll ${position}`).not.toBeNull();
      expect(areasBox, `areas box at scroll ${position}`).not.toBeNull();
      results[position] = pillBox!.y - (areasBox!.y + areasBox!.height);
    }
    return results;
  }

  for (const viewport of DESKTOP_VIEWPORTS) {
    test(`worst-case date + "Volunteer Work" selected clears the Areas card by a real margin at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await pinMastheadWorstCaseDate(page);
      await page.setViewportSize(viewport);
      await page.goto(`/?area=${VOLUNTEER_WORK_AREA_ID}`);
      await expect(page.getByTestId("today-moments")).toBeVisible();
      await page.keyboard.press("1");
      await expect(page.getByTestId("start-moment")).toBeVisible();
      await expect(
        page.getByTestId("today-moments-area-switcher"),
      ).toContainText("Volunteer Work");

      const clearance = await measureClearance(page);
      for (const [position, value] of Object.entries(clearance)) {
        expect(
          value,
          `pill-to-areas-card clearance at scroll ${position}, area=Volunteer Work, ${viewport.width}x${viewport.height} was ${value}px`,
        ).toBeGreaterThan(20);
      }
    });
  }

  // HONEST LIMITATION: AuthAffordance only renders a pill once
  // `isSupabaseConfigured()` is true, which is a build-time env check the
  // E2E dev server never satisfies (no Supabase env is wired into the
  // device-tier webServer — see HIT-1 at the top of this file) — a real
  // signed-in run of this exact scenario is not feasible in this suite as
  // configured. This test SIMULATES the pill's width contribution instead
  // of exercising the real component: it injects a DOM node matching
  // AuthAffordance's real rendered footprint (a `PILL_CLASS` pill,
  // `HIT_TARGET_MIN` sized, holding the longest real copy the component
  // ever shows — a signed-in short-label pill with "Sign out", wider than
  // the signed-out "Sign in" pill) into the same masthead cluster slot,
  // then proves the structural fix holds with it present. This is a
  // deliberate stand-in, not proof against the real component — flagged
  // here and in the PR body as residual risk until a signed-in device-tier
  // (or a dedicated Supabase-configured) run can exercise the real pill.
  for (const viewport of DESKTOP_VIEWPORTS) {
    test(`worst-case date + a simulated AuthAffordance pill clears the Areas card by a real margin at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await pinMastheadWorstCaseDate(page);
      await page.setViewportSize(viewport);
      await page.goto("/");
      await expect(page.getByTestId("today-moments")).toBeVisible();
      await page.keyboard.press("1");
      await expect(page.getByTestId("start-moment")).toBeVisible();

      await page.evaluate(() => {
        const cluster = document.querySelector(
          '[data-testid="masthead-settingslink-slot"]',
        )?.parentElement;
        if (!cluster) {
          throw new Error(
            "masthead-settingslink-slot not found — cluster DOM shape changed, update this simulated-pill injection",
          );
        }
        const fake = document.createElement("span");
        fake.setAttribute("data-testid", "simulated-auth-affordance-pill");
        fake.className =
          "inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 text-xs font-semibold text-muted-foreground min-h-[44px] min-w-[44px]";
        fake.textContent = "Sign out";
        cluster.appendChild(fake);
      });
      await expect(
        page.getByTestId("simulated-auth-affordance-pill"),
      ).toBeVisible();

      const clearance = await measureClearance(page);
      for (const [position, value] of Object.entries(clearance)) {
        expect(
          value,
          `pill-to-areas-card clearance at scroll ${position}, simulated auth pill present, ${viewport.width}x${viewport.height} was ${value}px`,
        ).toBeGreaterThan(20);
      }
    });
  }

  // Unchanged-at-mobile check: the brand+date row's `flex-nowrap` applies
  // at every breakpoint (it is not `sm:`-scoped), but below `sm` the header
  // itself is `flex-col` — brand+date gets the full viewport width to
  // itself, not a shared budget — so the date should never need to
  // truncate there. Proves the structural fix didn't introduce a NEW mobile
  // regression (accidental truncation) while fixing the desktop one.
  test("worst-case date renders the full, untruncated date string at 390px (mobile masthead has its own full-width row)", async ({
    page,
  }) => {
    await pinMastheadWorstCaseDate(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.getByTestId("today-moments")).toBeVisible();

    const dateSpan = page.getByTestId("today-moments-date");
    await expect(dateSpan).toBeVisible();
    await expect(dateSpan).toHaveText("Wednesday 30 September");

    const scrollWidth = await dateSpan.evaluate((el) => el.scrollWidth);
    const clientWidth = await dateSpan.evaluate((el) => el.clientWidth);
    expect(
      scrollWidth,
      `date span truncated at 390px: scrollWidth=${scrollWidth} > clientWidth=${clientWidth}`,
    ).toBeLessThanOrEqual(clientWidth);
  });
});

// R6 (premium push #483 round 6, regression fix): the fix above shipped an
// unconditional cap (AREAS_SCROLL_THRESHOLD one below the real demo seed's
// 4 areas), so it hid 2 of the owner's 4 real areas at EVERY viewport,
// including roomy ones — 1440x900 measured ~187px of unused canvas below
// the card while the list still scrolled and only 2 of 4 areas showed. The
// owner is map-first; the Areas list is a primary at-a-glance surface, so
// hiding half of it to protect a floating pill's clearance was backwards.
// This guard proves the actual fix: at both the owner's real desktop
// viewports, all 4 real areas render with zero internal scrolling — no
// `moments-rail-scroll` cap class, no scrollable overflow, no "more below"
// fade (a fade here would be a lie: there's nothing more to scroll to).
// The R5 guard above still holds (clearance now measures 28.78px at
// 1366x768/scroll-zero, safely above its >20 floor) — this is additive,
// not a replacement.
test.describe("moments home shows every real area unscrolled, at the owner's real viewports (#483 round 6)", () => {
  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    test(`all 4 demo areas are visible with no internal scroll at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await expect(page.getByTestId("today-moments")).toBeVisible();
      await page.evaluate(() => localStorage.setItem("theme", "dark"));
      await page.reload();
      await expect(page.getByTestId("today-moments")).toBeVisible();
      await page.keyboard.press("1");
      await expect(page.getByTestId("start-moment")).toBeVisible();

      const areasCard = page.getByTestId("side-rail-areas-card");
      await expect(areasCard).toBeVisible();

      const rows = page.locator('[data-testid^="area-health-row-"]');
      await expect(rows).toHaveCount(4);
      for (let i = 0; i < 4; i += 1) {
        await expect(rows.nth(i)).toBeVisible();
      }

      const list = page.getByTestId("area-health-dots");
      expect(await list.getAttribute("class")).not.toMatch(
        /\bmoments-rail-scroll\b/,
      );
      await expect(
        page.getByTestId("area-health-dots-fade"),
      ).not.toBeAttached();
      await expect(
        page.getByTestId("area-health-dots-overflow-hint"),
      ).not.toBeAttached();

      // No genuine internal overflow either, independent of which class
      // implements it — the list must actually fit its own box.
      const [scrollHeight, clientHeight] = await list.evaluate((el) => [
        el.scrollHeight,
        el.clientHeight,
      ]);
      expect(scrollHeight).toBeLessThanOrEqual(clientHeight + 1);
    });
  }
});

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
    // #593: the pill is desktop-only now; the mobile capture control lives
    // in the bottom navigator band.
    await expect(page.getByTestId("bottom-navigator-capture")).toBeVisible();
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
