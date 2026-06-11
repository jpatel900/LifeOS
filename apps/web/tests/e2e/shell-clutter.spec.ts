import { expect, test, type Page } from "@playwright/test";

async function expectNoHorizontalOverflow(page: Page) {
  const layout = await page.evaluate(() => {
    const html = document.documentElement;
    const body = document.body;
    return {
      scrollWidth: Math.max(
        html.scrollWidth,
        body?.scrollWidth ?? 0,
        html.clientWidth,
      ),
      viewportWidth: window.innerWidth,
    };
  });

  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
}

async function expectSingleRowNav(page: Page, label: string) {
  const rows = await page
    .getByRole("navigation", { name: label })
    .evaluate((nav) => {
      const links = Array.from(nav.querySelectorAll("a"));
      return new Set(
        links.map((link) => Math.round(link.getBoundingClientRect().top)),
      ).size;
    });

  expect(rows).toBe(1);
}

test.describe("shell clutter guards", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("quiet shell routes keep the extra context band off above route-local work", async ({
    page,
  }) => {
    for (const [route, heading] of [
      ["/", "Today"],
      ["/capture", "Capture"],
      ["/calendar", "Planning"],
      ["/execute", "Execute"],
      ["/review", "Review"],
    ] as const) {
      await page.goto(route);
      await expect(
        page.getByRole("heading", { level: 1, name: heading }),
      ).toBeVisible();
      await expect(page.getByTestId("app-shell-context-header")).toHaveCount(0);
      await expectNoHorizontalOverflow(page);
    }
  });

  test("home and capture keep quick note controls off on mobile", async ({
    page,
  }) => {
    for (const [route, heading] of [
      ["/", "Today"],
      ["/capture", "Capture"],
    ] as const) {
      await page.goto(route);
      await expect(
        page.getByRole("heading", { level: 1, name: heading }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Save quick note" }),
      ).toHaveCount(0);
      await expect(page.getByLabel("Quick note text")).toHaveCount(0);
      await expectNoHorizontalOverflow(page);
    }
  });

  test("mobile shell keeps one active nav item and one visible shell input path on triage", async ({
    page,
  }) => {
    await page.goto("/triage");

    await expect(
      page.getByRole("heading", { level: 1, name: "Triage" }),
    ).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Quick note text" })).toBeVisible();
    await expect(
      page.locator('[aria-label="Primary"] a[aria-current="page"]'),
    ).toHaveCount(1);
    await expectSingleRowNav(page, "Primary");
    await expect(page.getByTestId("app-shell-context-header")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("areas stays in supporting admin nav instead of the primary workflow loop", async ({
    page,
  }) => {
    await page.goto("/triage");

    const primaryNav = page.getByRole("navigation", { name: "Primary" });
    const supportingNav = page.getByRole("navigation", { name: "Supporting" });

    await expect(primaryNav.getByRole("link", { name: "Areas admin" })).toHaveCount(0);
    await expect(supportingNav.getByRole("link", { name: "Areas admin" })).toBeVisible();
    await expectSingleRowNav(page, "Primary");
    await expectNoHorizontalOverflow(page);
  });
});
