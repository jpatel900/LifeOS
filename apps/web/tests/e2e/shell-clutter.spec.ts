import { mkdirSync } from "node:fs";
import path from "node:path";
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

async function captureShellEvidence(
  page: Page,
  issueSlug: string,
  filename: string,
) {
  const shellEvidenceDir = path.join(
    process.cwd(),
    "test-results",
    "pass-7",
    issueSlug,
  );
  mkdirSync(shellEvidenceDir, { recursive: true });
  await page.screenshot({
    path: path.join(shellEvidenceDir, filename),
    fullPage: false,
  });
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

  test("mobile shell keeps quick note secondary until opened on triage", async ({
    page,
  }) => {
    await page.goto("/triage");

    await expect(
      page.getByRole("heading", { level: 1, name: "Triage" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Quick note" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Quick note text" })).toHaveCount(0);
    await expect(
      page.locator('[aria-label="Primary"] a[aria-current="page"]'),
    ).toHaveCount(1);
    await expectSingleRowNav(page, "Primary");
    await expect(page.getByTestId("app-shell-context-header")).toBeVisible();
    await captureShellEvidence(
      page,
      "171-shell-route-behavior",
      "2026-06-11-171-triage-mobile-rest.png",
    );
    await page.getByRole("button", { name: "Quick note" }).click();
    await expect(page.getByRole("textbox", { name: "Quick note text" })).toBeVisible();
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

test("desktop shell keeps quick note secondary until opened on triage", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/triage");

  await expect(
    page.getByRole("heading", { level: 1, name: "Triage" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Quick note" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Quick note text" })).toHaveCount(0);
  await expect(
    page.locator('[aria-label="Primary"] a[aria-current="page"]'),
  ).toHaveCount(1);
  await expect(page.getByTestId("app-shell-context-header")).toBeVisible();
  await captureShellEvidence(
    page,
    "171-shell-route-behavior",
    "2026-06-11-171-triage-desktop-rest.png",
  );
});

test("shell context header stops repeating area text on triage", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/triage");

  await expect(
    page.getByRole("heading", { level: 1, name: "Triage" }),
  ).toBeVisible();
  await expect(page.getByLabel("Current area context")).toContainText("Main Job");
  await expect(page.getByLabel("Current area context")).toContainText("Area");
  await expect(page.getByTestId("app-shell-context-header")).toBeVisible();
  await expect(page.getByTestId("app-shell-context-header")).not.toContainText(
    "Current area",
  );
  await captureShellEvidence(
    page,
    "172-area-display-pass",
    "2026-06-11-172-triage-mobile-rest.png",
  );
});

test("desktop shell keeps area visible without the extra spotlight repeat", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/triage");

  await expect(
    page.getByRole("heading", { level: 1, name: "Triage" }),
  ).toBeVisible();
  await expect(page.getByLabel("Current area context")).toContainText("Main Job");
  await expect(page.getByTestId("app-shell-context-header")).not.toContainText(
    "Current area",
  );
  await captureShellEvidence(
    page,
    "172-area-display-pass",
    "2026-06-11-172-triage-desktop-rest.png",
  );
});
