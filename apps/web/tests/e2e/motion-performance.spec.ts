import { expect, test, type Page } from "@playwright/test";

async function seedExecuteMission(page: Page) {
  await page.goto("/execute");
  await page.evaluate(() => {
    const storageKey = "lifeos.phase2.workflow";
    const stored = window.sessionStorage.getItem(storageKey);
    if (!stored) {
      throw new Error("Workflow state was not available for Execute seeding.");
    }

    const state = JSON.parse(stored) as {
      tasks: Array<Record<string, unknown>>;
    };
    const now = new Date().toISOString();
    state.tasks = [
      {
        id: "task-motion-proof-1",
        user_id: "00000000-0000-0000-0000-000000000001",
        area_id: "area-main-job",
        title: "Motion and performance proof task",
        description: null,
        status: "active",
        priority_score: null,
        priority_confidence: null,
        task_type: null,
        energy_type: null,
        estimated_minutes_low: 25,
        estimated_minutes_high: 40,
        due_at: null,
        definition_of_done: "Start and complete a focus session.",
        first_tiny_step: "Start the session.",
        created_at: now,
        updated_at: now,
        project_id: null,
        source_capture_item_id: null,
      },
    ];
    window.sessionStorage.setItem(storageKey, JSON.stringify(state));
  });
}

test.describe("reduced motion", () => {
  test("shared motion respects reduced-motion preferences", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/triage");
    const navTransition = await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Capture", exact: true })
      .evaluate((element) => window.getComputedStyle(element).transitionDuration);
    expect(navTransition).toBe("0s");

    await page.goto("/capture");
    await page.getByRole("textbox", { name: "What are you thinking about?" }).fill(
      "Reduced motion save proof",
    );
    await page.getByRole("button", { name: "Save thought" }).click();
    const alertAnimation = await page
      .locator(".workflow-celebration-alert")
      .first()
      .evaluate((element) => window.getComputedStyle(element).animationName);
    expect(alertAnimation).toBe("none");

    await seedExecuteMission(page);
    await page.goto("/execute");
    await page.getByRole("button", { name: "Start" }).click();
    const orbAnimation = await page
      .locator(".focus-state-orb")
      .evaluate((element) => window.getComputedStyle(element).animationName);
    const orbTransition = await page
      .locator(".focus-state-orb")
      .evaluate((element) => window.getComputedStyle(element).transitionDuration);
    expect(orbAnimation).toBe("none");
    expect(orbTransition).toBe("0s");
  });
});

test("capture stays quickly usable on a warm navigation and the flagship card stays stable", async ({
  page,
}) => {
  await page.goto("/capture");
  await expect(
    page.getByRole("textbox", { name: "What are you thinking about?" }),
  ).toBeVisible();

  await page.goto("/");
  const startedAt = Date.now();
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Capture", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "What are you thinking about?" }),
  ).toBeVisible();
  const navigationDuration = Date.now() - startedAt;
  expect(navigationDuration).toBeLessThan(2000);

  const before = await page.getByTestId("capture-main-card").boundingBox();
  expect(before).not.toBeNull();
  await page.waitForTimeout(600);
  const after = await page.getByTestId("capture-main-card").boundingBox();
  expect(after).not.toBeNull();

  expect(Math.abs((before?.y ?? 0) - (after?.y ?? 0))).toBeLessThanOrEqual(4);
  expect(Math.abs((before?.height ?? 0) - (after?.height ?? 0))).toBeLessThanOrEqual(4);
});
