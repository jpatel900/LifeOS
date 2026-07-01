import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const evidenceDir = path.join(process.cwd(), "test-results", "handoff-cockpit");

const routes = [
  ["today", "/"],
  ["capture", "/capture"],
  ["triage", "/triage"],
  ["plan", "/calendar"],
  ["execute", "/execute"],
  ["review", "/review"],
  ["health", "/health"],
] as const;

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

async function captureEvidence(page: Page, name: string) {
  mkdirSync(evidenceDir, { recursive: true });
  await page.screenshot({
    path: path.join(evidenceDir, name),
    fullPage: true,
  });
}

async function expectCockpit(page: Page) {
  await expect(page.getByTestId("lifeos-cockpit")).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Workflow stages" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "All areas" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Main Job" })).toBeVisible();
}

test("desktop cockpit renders every workflow route with no overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });

  for (const [stage, route] of routes) {
    await page.goto(route);
    await expectCockpit(page);
    await expectNoHorizontalOverflow(page);
    await captureEvidence(page, `desktop-${stage}.png`);
  }
});

test("mobile cockpit renders every workflow route with no overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });

  for (const [stage, route] of routes) {
    await page.goto(route);
    await expectCockpit(page);
    await expectNoHorizontalOverflow(page);
    await captureEvidence(page, `mobile-${stage}.png`);
  }
});

test("theme toggle uses data-theme light on the cockpit root", async ({
  page,
}) => {
  await page.goto("/capture");

  const cockpit = page.getByTestId("lifeos-cockpit");
  await expect(cockpit).toBeVisible();
  await expect(cockpit).not.toHaveAttribute("data-theme", "light");

  await page.getByRole("button", { name: "Toggle theme" }).click();

  await expect(cockpit).toHaveAttribute("data-theme", "light");
  await captureEvidence(page, "desktop-capture-light.png");
});

test("capture saves raw thought and routes the item to triage", async ({
  page,
}) => {
  await page.goto("/capture");

  await page.getByRole("textbox").fill("Browser handoff proof capture item");
  await page.getByRole("button", { name: "Save thought" }).click();

  await expect(page).toHaveURL(/\/triage$/);
  await expect(
    page.getByRole("heading", {
      name: "Browser handoff proof capture item",
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Drop" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Someday" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Do today" })).toBeVisible();
});

test("triage someday and do-today choices feed the plan screen", async ({
  page,
}) => {
  await page.goto("/capture");
  await page.getByRole("textbox").fill("Someday proof item");
  await page.getByRole("button", { name: "Save thought" }).click();
  await page.getByRole("button", { name: "Someday" }).click();

  await expect(
    page.getByRole("heading", { name: "Inbox clear" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Plan the day" }).click();
  await expect(page).toHaveURL(/\/calendar$/);
  await expect(
    page.getByText("Move to today: Someday proof item"),
  ).toBeVisible();

  await page.goto("/capture");
  await page.getByRole("textbox").fill("Do today proof item");
  await page.getByRole("button", { name: "Save thought" }).click();
  await page.getByRole("button", { name: "Do today" }).click();

  await expect(
    page.getByRole("heading", { name: "Inbox clear" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Plan the day" }).click();
  await expect(page).toHaveURL(/\/calendar$/);
  await expect(page.getByRole("heading", { name: "To place" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Do today proof item.*60m/ }),
  ).toBeVisible();
});

test("plan hour rail creates local blocks and keeps Google writes secondary", async ({
  page,
}) => {
  await page.goto("/capture");
  await page.getByRole("textbox").fill("Plan rail proof item");
  await page.getByRole("button", { name: "Save thought" }).click();
  await page.getByRole("button", { name: "Do today" }).click();

  await expect(
    page.getByRole("heading", { name: "Inbox clear" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Plan the day" }).click();
  await expect(page).toHaveURL(/\/calendar$/);
  await page.getByRole("button", { name: /Plan rail proof item.*60m/ }).click();
  await page.getByRole("button", { name: /8a.*Drop here/i }).click();

  await expect(page.getByText("Tap to unplan")).toBeVisible();
  await expect(page.getByText("Google writes are separate")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start focusing" }),
  ).toBeVisible();
});

test("execute, review, health, and all areas keep the handoff hierarchy", async ({
  page,
}) => {
  await page.goto("/execute");
  await expect(
    page.getByRole("heading", { name: "Focus queue" }),
  ).toBeVisible();
  await expect(page.getByText("Pick a block")).toBeVisible();

  await page.goto("/review");
  await expect(
    page.getByRole("heading", { name: /Day closed clean|carry over/ }),
  ).toBeVisible();
  await expect(page.getByText("Carry-forward details")).toBeVisible();

  await page.goto("/health");
  await expect(
    page.getByRole("heading", {
      name: /All systems healthy|checks need attention/,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Run system check" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "All areas" }).click();
  await expect(
    page.getByRole("heading", { name: "All areas overview" }),
  ).toBeVisible();
  await expect(page.getByText("Global scope")).toBeVisible();
});
