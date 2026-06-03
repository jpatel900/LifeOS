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

async function seedExecuteMission(page: Page) {
  await page.goto("/");
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
        id: "task-proof-2",
        user_id: "00000000-0000-0000-0000-000000000001",
        area_id: "area-main-job",
        title: "Workflow hierarchy proof task",
        description: null,
        status: "active",
        priority_score: null,
        priority_confidence: null,
        task_type: null,
        energy_type: null,
        estimated_minutes_low: 25,
        estimated_minutes_high: 40,
        due_at: null,
        definition_of_done: "Finish the next useful move.",
        first_tiny_step: "Open the task and start.",
        created_at: now,
        updated_at: now,
        project_id: null,
        source_capture_item_id: null,
      },
    ];
    window.sessionStorage.setItem(storageKey, JSON.stringify(state));
  });
}

test("workflow screens keep one dominant card and quieter supporting cards", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("today-next-card")).toHaveClass(
    /workflow-primary-card/,
  );

  await page.goto("/capture");
  await expect(page.getByTestId("capture-main-card")).toHaveClass(
    /workflow-primary-card/,
  );

  await seedExecuteMission(page);
  await page.goto("/execute");
  await expect(page.getByTestId("execute-current-mission-card")).toHaveClass(
    /workflow-primary-card/,
  );

  await page.goto("/review");
  await expect(page.getByTestId("review-next-decision-card")).toHaveClass(
    /workflow-primary-card/,
  );
  await expect(page.getByTestId("review-close-loop-card")).toHaveClass(
    /workflow-secondary-card/,
  );
  await expect(page.getByTestId("review-today-at-a-glance-card")).toHaveClass(
    /workflow-secondary-card/,
  );

  await page.goto("/settings/areas");
  await expect(page.getByTestId("areas-create-card")).toHaveClass(
    /workflow-primary-card/,
  );

  await page.goto("/health");
  await expect(page.getByTestId("health-reliability-card")).toHaveClass(
    /workflow-primary-card/,
  );
  await expect(page.getByTestId("health-trust-summary-card")).toHaveClass(
    /workflow-secondary-card/,
  );
});

test("hierarchy pass stays usable at 390px width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  for (const route of [
    "/",
    "/capture",
    "/execute",
    "/review",
    "/settings/areas",
    "/health",
  ]) {
    await page.goto(route);
    await expectNoHorizontalOverflow(page);
  }
});
