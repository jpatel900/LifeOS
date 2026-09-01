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
 * 39.3px wide inside a 44px-min-width box against the 64px reservation — real
 * slack today, 12px of it, with no pin on the actual number. `whitespace-nowrap`
 * (`DemoModeBanner.tsx`) turns a future copy change that would have silently
 * wrapped the link onto a second line (potentially under the sentence text)
 * into a link that visibly grows past its own box instead — this is the
 * geometric proof that growth stays caught: a real browser measurement of the
 * link's rendered width against the column it has to stay inside, jsdom/RTL
 * cannot compute layout so this cannot be a unit test.
 */
test.describe("demo banner sign-in link stays inside its reserved column", () => {
  const RESERVED_COLUMN_PX = 64; // `pr-16` in DemoModeBanner.tsx

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
