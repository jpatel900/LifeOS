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
        id: "task-proof-focus",
        user_id: "00000000-0000-0000-0000-000000000001",
        area_id: "area-main-job",
        title: "Focus flagship proof task",
        description: null,
        status: "active",
        priority_score: null,
        priority_confidence: null,
        task_type: null,
        energy_type: null,
        estimated_minutes_low: 25,
        estimated_minutes_high: 40,
        due_at: null,
        definition_of_done: "Finish one useful move and record the result.",
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

test("Execute keeps one flagship mission with clear local focus-state transitions", async ({
  page,
}) => {
  await seedExecuteMission(page);
  await page.goto("/execute");

  const focusStateCard = page.getByTestId("execute-focus-state-card");
  await expect(focusStateCard).toHaveAttribute("data-focus-state", "not_started");
  await expect(focusStateCard).toContainText("Ready to focus");

  await page.getByRole("button", { name: "Start focus session" }).click();
  await expect(focusStateCard).toHaveAttribute("data-focus-state", "running");
  await expect(focusStateCard).toContainText("Focus in progress");

  await page.getByRole("button", { name: "Pause focus session" }).click();
  await expect(focusStateCard).toHaveAttribute("data-focus-state", "paused");
  await expect(focusStateCard).toContainText("Paused on purpose");

  await page.getByRole("button", { name: "Resume focus session" }).click();
  await expect(focusStateCard).toHaveAttribute("data-focus-state", "running");

  await page.getByRole("button", { name: "Missed" }).click();
  await expect(focusStateCard).toHaveAttribute("data-focus-state", "missed");
  await expect(focusStateCard).toContainText("Missed block");
  await expect(page.getByRole("link", { name: "Capture follow-up" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Plan next block" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Review this session" })).toBeVisible();
});

test("Execute flagship polish stays usable in empty and mission states at 390px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto("/execute");
  await expect(page.getByText("No current task is in execution.")).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await seedExecuteMission(page);
  await page.goto("/execute");
  await expect(page.getByTestId("execute-focus-state-card")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
