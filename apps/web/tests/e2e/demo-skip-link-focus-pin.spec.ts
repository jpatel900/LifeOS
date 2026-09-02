import { expect, test, type Page } from "@playwright/test";

/**
 * #974 second review — REFUTED FIX, two regressions neither
 * `hit-target-overlap-pin.spec.ts` nor `a11y-axe-pin.spec.ts` could catch,
 * because neither ever presses Tab:
 *
 *  1. The shared skip link `AppShell.tsx` added copied the class string from
 *     one of the four removed per-page versions but dropped
 *     `min-h-[44px] min-w-[44px]` — measured focused size 165x24 (was 165x44
 *     on every one of the removed versions).
 *  2. This link and `DemoModeBanner` are both `z-50`, and the link now
 *     precedes the banner in DOM order — on a z-index TIE, later DOM order
 *     paints on top, so the STICKY banner painted over the focused, visible
 *     pill. Measured directly: `elementFromPoint` at the focused pill's own
 *     center returned `#demo-mode-banner`, not the link itself.
 *
 * `hit-target-overlap-pin.spec.ts`'s own geometry scan (`interactiveGeometry
 * .ts`) only ever measures elements as rendered at page load — it never
 * focuses anything, so a skip link's UNFOCUSED `sr-only` 1x1/32x16 box is all
 * it ever sees. `a11y-axe-pin.spec.ts` (axe-core) checks color contrast,
 * labeling, and structure — it does not simulate a real Tab keypress and
 * measure the resulting focus ring's geometry or paint order either. Both
 * gates were green while this was broken, which is exactly why this file
 * exists: it presses Tab for real and reads back what a keyboard user would
 * actually get.
 */

const ROUTES: Array<{ id: string; goto: (page: Page) => Promise<void> }> = [
  {
    id: "/",
    async goto(page) {
      await page.goto("/");
      await expect(page.getByTestId("today-moments")).toBeVisible();
    },
  },
  {
    id: "/settings/areas",
    async goto(page) {
      await page.goto("/settings/areas");
      await expect(
        page.getByRole("heading", { name: "Areas", level: 1 }),
      ).toBeVisible();
    },
  },
  {
    id: "/login",
    async goto(page) {
      await page.goto("/login");
      await expect(
        page.getByRole("heading", { name: "Sign in" }),
      ).toBeVisible();
    },
  },
  {
    // #687: the demoted stage pages are flag-gated redirect shims when the
    // moments home is live (the e2e dev server's default) — `/execute`
    // redirects to `/?moment=flow` (same pattern `nav-truth.spec.ts` already
    // asserts), landing on the `flow-moment` surface, not a bare cockpit.
    id: "/execute",
    async goto(page) {
      await page.goto("/execute");
      await expect(page.getByTestId("flow-moment")).toBeVisible();
    },
  },
  {
    id: "404",
    async goto(page) {
      await page.goto("/this-path-does-not-exist-974");
      await expect(
        page.getByRole("heading", { name: "Page not found" }),
      ).toBeVisible();
    },
  },
];

const VIEWPORTS = [
  { id: "desktop", width: 1440, height: 1000 },
  { id: "mobile", width: 390, height: 844 },
];

test.describe("demo banner sign-in door: skip link stays a real, visible, on-top focus target (#974 second review)", () => {
  for (const viewport of VIEWPORTS) {
    for (const route of ROUTES) {
      test(`Tab #1 on ${route.id} @ ${viewport.id} (${viewport.width}x${viewport.height}) is the skip link, >=44x44, and hit-tests to itself`, async ({
        page,
      }) => {
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });
        await route.goto(page);

        await page.keyboard.press("Tab");

        const active = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el) return null;
          return {
            tag: el.tagName,
            text: el.textContent?.trim() ?? "",
            href: el.getAttribute("href"),
          };
        });
        expect(active?.tag).toBe("A");
        expect(active?.text).toBe("Skip to stage content");
        expect(active?.href).toBe("#stage-content");

        // Real geometry of the FOCUSED element — the regression this pin
        // exists for lived entirely in the gap between "exists in the DOM"
        // and "is actually a usable, visible, on-top 44x44 target".
        const geometry = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el) return null;
          const rect = el.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const hit = document.elementFromPoint(cx, cy);
          const style = getComputedStyle(el);
          return {
            width: rect.width,
            height: rect.height,
            hitIsSelfOrDescendant: hit === el || el.contains(hit),
            hitTag: hit?.tagName ?? null,
            hitId: hit?.id ?? null,
            visibility: style.visibility,
            clipPath: style.clipPath,
          };
        });

        expect(geometry, "focused skip link must be measurable").not.toBeNull();
        expect(geometry!.width).toBeGreaterThanOrEqual(44);
        expect(geometry!.height).toBeGreaterThanOrEqual(44);
        expect(geometry!.visibility).not.toBe("hidden");
        expect(geometry!.clipPath).toBe("none");
        // THE regression, pinned directly: the banner (or anything else)
        // must not be the element actually painted at the focused pill's
        // own center.
        expect(
          geometry!.hitIsSelfOrDescendant,
          `expected the focused skip link's own center to hit-test to itself, got <${geometry!.hitTag}${geometry!.hitId ? `#${geometry!.hitId}` : ""}> instead — something is painting over the focused pill`,
        ).toBe(true);

        // Activating it must land on a REAL target — a skip link to
        // nothing (the not-found.tsx regression) is as broken as one that's
        // invisible.
        await page.keyboard.press("Enter");
        const target = page.locator("#stage-content");
        await expect(target).toHaveCount(1);
      });
    }
  }
});
