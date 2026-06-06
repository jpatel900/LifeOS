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
        id: "task-proof-1",
        user_id: "00000000-0000-0000-0000-000000000001",
        area_id: "area-main-job",
        title: "Workflow card accent proof task",
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
        first_tiny_step: "Open the task and make the first move.",
        created_at: now,
        updated_at: now,
        project_id: null,
        source_capture_item_id: null,
      },
    ];
    window.sessionStorage.setItem(storageKey, JSON.stringify(state));
  });
}

test("workflow cards reuse area accent tokens across core routes", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("today-next-card")).toHaveCSS(
    "--area-accent",
    "#2563eb",
  );
  await expect(
    page.getByTestId("today-next-card").getByText("Current area: Main Job"),
  ).toBeVisible();

  await page.goto("/capture");
  await expect(page.getByTestId("capture-save-options-card")).toHaveCSS(
    "--area-accent",
    "#2563eb",
  );
  await page.getByLabel("What are you thinking about?").fill(
    "Playwright capture for accent proof",
  );
  await page.getByText("Local draft pass").click();
  await page.getByRole("button", { name: "Organize on this device" }).click();
  await page.getByText("Device-only drafts").click();
  await expect(page.getByTestId("capture-recent-card").first()).toBeVisible();
  await expect(page.getByTestId("capture-recent-card").first()).toHaveCSS(
    "--area-accent",
    "#2563eb",
  );

  await seedExecuteMission(page);
  await page.goto("/execute");
  await expect(page.getByTestId("execute-current-mission-card")).toBeVisible();
  await expect(
    page.getByTestId("execute-current-mission-card"),
  ).toHaveCSS("--area-accent", "#2563eb");

  await page.goto("/review");
  await expect(
    page.getByTestId("review-today-at-a-glance-card"),
  ).toHaveCSS("--area-accent", "#2563eb");
  await expect(page.getByTestId("review-carry-forward-card")).toBeVisible();

  await page.goto("/settings/areas");
  await expect(page.getByTestId("areas-area-card").first()).toHaveCSS(
    "--area-accent",
    "#2563eb",
  );
});

test("accented workflow cards stay usable at 390px width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });

  for (const route of ["/", "/capture", "/execute", "/review", "/settings/areas"]) {
    await page.goto(route);
    await expectNoHorizontalOverflow(page);
  }
});
