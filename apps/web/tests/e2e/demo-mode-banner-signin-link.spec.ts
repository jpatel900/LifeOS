import { expect, test } from "@playwright/test";

/**
 * #974 polish (verifier finding on #934's demo-banner PR): `DemoModeBanner`
 * reserves a fixed-width trailing column (`pr-16`, 64px) for its "Sign in"
 * link so the link can never render on top of the warning sentence — see
 * `DemoModeBanner.tsx`'s own doc comment for the full geometry story
 * (`hit-target-overlap-pin.spec.ts` proved the column has to be reserved via
 * padding + `position: absolute`, not a second row, or `settings/areas`'s
 * hit-target count breaks).
 *
 * That reservation is only as safe as the copy staying short: "Sign in" measures
 * 39.3px wide inside a 44px-min-width box against the 56px real bound (64px
 * `pr-16` minus the link's own `right-2` offset) — real slack today, with no
 * pin on the actual number. `whitespace-nowrap`
 * (`DemoModeBanner.tsx`) turns a future copy change that would have silently
 * wrapped the link onto a second line (potentially under the sentence text)
 * into a link that visibly grows past its own box instead — this is the
 * geometric proof that growth stays caught: a real browser measurement of the
 * link's rendered width against the column it has to stay inside, jsdom/RTL
 * cannot compute layout so this cannot be a unit test.
 */
test.describe("demo banner sign-in link stays inside its reserved column", () => {
  // #974 second review: 64 (`pr-16`) is the column `DemoModeBanner.tsx`
  // reserves on the sentence, but the link itself sits at `right-2` (8px)
  // INSIDE that column — its real available width before it would start
  // overlapping the sentence's own `pr-16` edge is 64 - 8 = 56, not 64.
  const RESERVED_COLUMN_PX = 56; // `pr-16` (64) minus the link's own `right-2` (8)

  for (const viewport of [
    { id: "mobile", width: 390, height: 844 },
    { id: "desktop", width: 1366, height: 768 },
  ]) {
    test(`link width <= reserved column at ${viewport.id} (${viewport.width}x${viewport.height})`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.goto("/");

      const link = page.getByTestId("demo-banner-signin-link");
      await expect(link).toBeVisible();

      const box = await link.boundingBox();
      expect(box, "sign-in link must have a real bounding box").not.toBeNull();
      // The floor this codebase's own hitTarget.ts contract sets everywhere
      // else — must not silently shrink below it while also not exceeding
      // the column it has to fit inside.
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeLessThanOrEqual(RESERVED_COLUMN_PX);
      expect(box!.height).toBeGreaterThanOrEqual(44);

      // Single-line proof, not just a width number: a wrapped two-line link
      // would still measure under 64px wide (text wrapping narrows a box),
      // so the width assertion alone could pass while `whitespace-nowrap`
      // had silently been removed and the copy had started wrapping. This
      // checks the client rect count directly.
      const rectCount = await link.evaluate((el) => el.getClientRects().length);
      expect(rectCount).toBe(1);
    });
  }

  test("link carries the current path as ?next= (matches AuthAffordance's configured-door contract)", async ({
    page,
  }) => {
    await page.goto("/settings/areas");

    const link = page.getByTestId("demo-banner-signin-link");
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute(
      "href",
      "/login?next=%2Fsettings%2Fareas",
    );
  });
});

/**
 * #687 demo-seed round 3 (finding B) — the real-browser height/wrap proof
 * `demoModeBanner.test.tsx`'s own comment already claims lives here.
 * `DemoModeBanner.tsx` swaps its one sentence for a seeded variant ("Demo
 * mode — this is sample data...") instead of appending a second one,
 * specifically so it cannot regress `#974`'s measured settings-areas
 * hit-target count (23/10 -> 11/7 on as little as 2-4px of added banner
 * height). jsdom computes no layout, so the only place that claim can
 * actually be checked is here: navigate to BOTH servers (main = unseeded,
 * seeded = `NEXT_PUBLIC_DEMO_SEED=true` — `playwright.config.ts` exposes
 * both ports via `PLAYWRIGHT_PORT`/`PLAYWRIGHT_SEEDED_PORT` regardless of
 * which project runs this file) and assert the seeded banner's rendered
 * height never EXCEEDS the unseeded one, at all three widths that matter:
 * 320 (the narrowest real phone this app supports), 390 (this file's own
 * mobile pin width), and 1366 (this file's own desktop pin width, and the
 * exact width `moments-home-parity.spec.ts`'s pill-clearance guards use).
 */
test.describe("demo banner sample-data label never grows the banner (#687 round 3, finding B)", () => {
  const mainPort = process.env.PLAYWRIGHT_PORT;
  const seededPort = process.env.PLAYWRIGHT_SEEDED_PORT;

  for (const width of [320, 390, 1366]) {
    test(`seeded banner height <= unseeded banner height at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });

      await page.goto(`http://127.0.0.1:${mainPort}/`);
      const unseededBanner = page.getByTestId("demo-mode-banner");
      await expect(unseededBanner).toBeVisible();
      const unseededBox = await unseededBanner.boundingBox();
      expect(unseededBox, "unseeded banner box").not.toBeNull();
      await expect(unseededBanner).not.toContainText(/sample data/i);

      await page.goto(`http://127.0.0.1:${seededPort}/`);
      const seededBanner = page.getByTestId("demo-mode-banner");
      // A fresh seeded visit only decides seeded-vs-empty on the client's
      // hydration render (`createInitialWorkflowState`,
      // lib/workflow/shared.ts) — wait for the settled marker
      // (`TodayMoments.tsx`) so this measures the seeded sentence, not a
      // pre-hydration flash of the unseeded one.
      await expect(
        page.locator('[data-testid="today-moments"][data-demo-seeded="true"]'),
      ).toBeAttached({ timeout: 15_000 });
      await expect(seededBanner).toBeVisible();
      await expect(seededBanner).toContainText(/sample data/i);
      const seededBox = await seededBanner.boundingBox();
      expect(seededBox, "seeded banner box").not.toBeNull();

      expect(
        seededBox!.height,
        `seeded banner height (${seededBox!.height}) must not exceed unseeded (${unseededBox!.height}) at ${width}px`,
      ).toBeLessThanOrEqual(unseededBox!.height);
    });
  }
});
