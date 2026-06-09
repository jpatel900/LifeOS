import { expect, test, type Locator, type Page } from "@playwright/test";

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

async function expectElementWithinViewport(
  page: Page,
  locator: Locator,
  label: string,
) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();

  expect(box, `${label} should have a visible bounding box.`).not.toBeNull();
  expect(viewport, "Viewport size should be available.").not.toBeNull();
  expect(box!.y, `${label} should start in the first viewport.`).toBeGreaterThanOrEqual(0);
  expect(
    box!.y + box!.height,
    `${label} should remain visible in the first viewport.`,
  ).toBeLessThanOrEqual(viewport!.height);
}

async function expectElementStartsWithinViewport(
  page: Page,
  locator: Locator,
  label: string,
) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();

  expect(box, `${label} should have a visible bounding box.`).not.toBeNull();
  expect(viewport, "Viewport size should be available.").not.toBeNull();
  expect(box!.y, `${label} should start in the first viewport.`).toBeGreaterThanOrEqual(0);
  expect(box!.y, `${label} should start before the first viewport ends.`).toBeLessThan(
    viewport!.height,
  );
}

async function expectTopBefore(
  first: Locator,
  second: Locator,
  message: string,
) {
  const firstBox = await first.boundingBox();
  const secondBox = await second.boundingBox();

  expect(firstBox, "First element should have a visible bounding box.").not.toBeNull();
  expect(secondBox, "Second element should have a visible bounding box.").not.toBeNull();
  expect(firstBox!.y, message).toBeLessThan(secondBox!.y);
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

async function seedTriageQueue(page: Page) {
  await page.goto("/");
  await page.evaluate(() => {
    const storageKey = "lifeos.phase2.workflow";
    const stored = window.sessionStorage.getItem(storageKey);
    if (!stored) {
      throw new Error("Workflow state was not available for Triage seeding.");
    }

    const state = JSON.parse(stored) as {
      areas: Array<{ id: string; user_id: string }>;
      taskDrafts: Array<Record<string, unknown>>;
      projectDrafts: Array<Record<string, unknown>>;
      ambiguityAssessments: Array<Record<string, unknown>>;
      timeBlockProposalDrafts: Array<Record<string, unknown>>;
    };
    const areaId = state.areas[0]?.id ?? "area-main-job";
    const userId = state.areas[0]?.user_id ?? "workflow-proof-user";
    const now = new Date().toISOString();

    state.taskDrafts = [
      {
        id: "task-draft-proof-current",
        user_id: userId,
        capture_item_id: "capture-proof-current",
        area_id: areaId,
        title: "Current triage proof item",
        description: "Keep one current decision visually dominant.",
        confidence: 0.82,
        estimated_minutes_low: 20,
        estimated_minutes_high: 35,
        first_tiny_step: "Review the current item first.",
        status: "pending",
        created_at: now,
      },
      {
        id: "task-draft-proof-next",
        user_id: userId,
        capture_item_id: "capture-proof-next",
        area_id: areaId,
        title: "Up-next triage proof item",
        description: "Secondary queue context should stay quieter.",
        confidence: 0.71,
        estimated_minutes_low: 15,
        estimated_minutes_high: 25,
        first_tiny_step: "Wait until the current item is resolved.",
        status: "pending",
        created_at: now,
      },
    ];
    state.projectDrafts = [];
    state.ambiguityAssessments = [];
    state.timeBlockProposalDrafts = [];
    window.sessionStorage.setItem(storageKey, JSON.stringify(state));
  });
}

async function seedPlanningHierarchyState(page: Page) {
  await page.goto("/");
  await page.evaluate(() => {
    const storageKey = "lifeos.phase2.workflow";
    const stored = window.sessionStorage.getItem(storageKey);
    if (!stored) {
      throw new Error("Workflow state was not available for Planning seeding.");
    }

    const state = JSON.parse(stored) as {
      areas: Array<{ id: string; user_id: string }>;
      tasks: Array<Record<string, unknown>>;
      timeBlockProposals: Array<Record<string, unknown>>;
      calendarBlocks: Array<Record<string, unknown>>;
      taskDrafts: Array<Record<string, unknown>>;
      projectDrafts: Array<Record<string, unknown>>;
      timeBlockProposalDrafts: Array<Record<string, unknown>>;
    };
    const areaId = state.areas[0]?.id ?? "area-main-job";
    const userId = state.areas[0]?.user_id ?? "workflow-proof-user";
    const now = new Date().toISOString();
    const proposalStart = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const proposalEnd = new Date(proposalStart.getTime() + 45 * 60 * 1000);
    const blockStart = new Date(Date.now() + 5 * 60 * 60 * 1000);
    const blockEnd = new Date(blockStart.getTime() + 50 * 60 * 1000);

    state.tasks = [
      {
        id: "task-proof-needs-time",
        user_id: userId,
        area_id: areaId,
        title: "Needs-time hierarchy proof task",
        description: "This should stay the visible start-here planning item.",
        status: "active",
        priority_score: 2,
        priority_confidence: null,
        task_type: null,
        energy_type: null,
        estimated_minutes_low: 25,
        estimated_minutes_high: 40,
        due_at: null,
        definition_of_done: "Create the next useful local time suggestion.",
        first_tiny_step: "Choose a first suggested slot.",
        created_at: now,
        updated_at: now,
        project_id: null,
        source_capture_item_id: null,
      },
      {
        id: "task-proof-review",
        user_id: userId,
        area_id: areaId,
        title: "Review-ready planning proof task",
        description: "Used to prove quieter review and planned sections.",
        status: "active",
        priority_score: 1,
        priority_confidence: null,
        task_type: null,
        energy_type: null,
        estimated_minutes_low: 30,
        estimated_minutes_high: 45,
        due_at: null,
        definition_of_done: "Approve or adjust the suggestion.",
        first_tiny_step: "Check the suggested time.",
        created_at: now,
        updated_at: now,
        project_id: null,
        source_capture_item_id: null,
      },
    ];
    state.timeBlockProposals = [
      {
        id: "proposal-proof-review",
        user_id: userId,
        area_id: areaId,
        task_id: "task-proof-review",
        proposed_start: proposalStart.toISOString(),
        proposed_end: proposalEnd.toISOString(),
        rationale: "Proof proposal for review hierarchy.",
        conflict_flag: false,
        status: "proposed",
        created_at: now,
      },
    ];
    state.calendarBlocks = [
      {
        id: "block-proof-planned",
        user_id: userId,
        area_id: areaId,
        proposal_id: "proposal-proof-review",
        task_id: "task-proof-review",
        google_event_id: null,
        start_at: blockStart.toISOString(),
        end_at: blockEnd.toISOString(),
        status: "scheduled",
        created_at: now,
        updated_at: now,
      },
    ];
    state.taskDrafts = [];
    state.projectDrafts = [];
    state.timeBlockProposalDrafts = [];
    window.sessionStorage.setItem(storageKey, JSON.stringify(state));
  });
}

test("workflow screens keep one dominant card and quieter supporting cards", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("today-next-card")).toHaveClass(
    /workflow-flagship-card/,
  );

  await page.goto("/capture");
  await expect(page.getByTestId("app-shell-context-header")).toHaveCount(0);
  await expect(page.getByTestId("capture-main-card")).toHaveClass(
    /workflow-flagship-card/,
  );

  await seedTriageQueue(page);
  await page.goto("/triage");
  await expect(page.getByTestId("triage-current-item-card")).toHaveClass(
    /workflow-flagship-card/,
  );
  await expect(page.getByTestId("triage-next-action-card")).toHaveClass(
    /workflow-support-card/,
  );
  await expect(page.getByTestId("triage-waiting-queue-card")).toHaveClass(
    /workflow-support-card/,
  );

  await seedPlanningHierarchyState(page);
  await page.goto("/calendar");
  await expect(page.getByTestId("app-shell-context-header")).toHaveCount(0);
  await expect(page.getByTestId("planning-flow-card")).toHaveClass(
    /workflow-flagship-card/,
  );
  await expect(page.getByTestId("planning-needs-time-card")).toHaveClass(
    /workflow-support-card/,
  );
  await expect(page.getByTestId("planning-ready-review-card")).toHaveClass(
    /workflow-support-card/,
  );
  await expect(page.getByTestId("planning-planned-blocks-card")).toHaveClass(
    /workflow-support-card/,
  );

  await seedExecuteMission(page);
  await page.goto("/execute");
  await expect(page.getByTestId("app-shell-context-header")).toHaveCount(0);
  await expect(page.getByTestId("execute-current-mission-card")).toHaveClass(
    /workflow-flagship-card/,
  );

  await page.goto("/review");
  await expect(page.getByTestId("app-shell-context-header")).toHaveCount(0);
  await expect(page.getByTestId("review-next-decision-card")).toHaveClass(
    /workflow-flagship-card/,
  );
  await expect(page.getByTestId("review-close-loop-card")).toHaveClass(
    /workflow-support-card/,
  );
  await expect(page.getByTestId("review-today-at-a-glance-card")).toHaveClass(
    /workflow-support-card/,
  );

  await page.goto("/settings/areas");
  await expect(page.getByTestId("areas-create-card")).toHaveClass(
    /workflow-flagship-card/,
  );

  await page.goto("/health");
  await expect(page.getByTestId("health-reliability-card")).toHaveClass(
    /workflow-flagship-card/,
  );
  await expect(page.getByTestId("health-trust-summary-card")).toHaveClass(
    /workflow-support-card/,
  );
});

test("hierarchy pass stays usable at 390px width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  for (const route of [
    "/",
    "/capture",
    "/triage",
    "/calendar",
    "/execute",
    "/review",
    "/settings/areas",
    "/health",
  ]) {
    await page.goto(route);
    await expectNoHorizontalOverflow(page);
  }
});

test("home keeps the next action ahead of support and diagnostic surfaces at 390px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const nextCard = page.getByTestId("today-next-card");
  const nextAction = page.getByRole("link", { name: "Capture a thought" });
  const dailyLoop = page.getByText("Daily loop", { exact: true });
  const todayDetails = page.getByText("Today details", { exact: true });

  await expect(nextCard).toBeVisible();
  await expect(nextAction).toBeVisible();
  await expectElementWithinViewport(page, nextAction, "Home next action");
  await expectTopBefore(
    nextCard,
    dailyLoop,
    "Home should show the dominant next-action card before Daily loop support content.",
  );
  await expectTopBefore(
    nextCard,
    todayDetails,
    "Home should keep the dominant next-action card above Today details diagnostics.",
  );
});

test("capture keeps raw input and primary actions ahead of support and diagnostics at 390px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/capture");

  const mainCard = page.getByTestId("capture-main-card");
  const textarea = page.getByPlaceholder("What's on your mind? Type anything...");
  const saveThought = page.getByRole("button", { name: "Save thought" });
  const saveAndOrganize = page.getByRole("button", {
    name: "Save and organize",
  });
  const summaryCard = page.getByTestId("capture-header-summary-card");
  const captureDetails = page.getByText("Capture details", { exact: true });

  await expect(mainCard).toBeVisible();
  await expect(textarea).toBeVisible();
  await expect(saveThought).toBeVisible();
  await expect(saveAndOrganize).toBeVisible();
  await expectElementStartsWithinViewport(page, textarea, "Capture textarea");
  await expectElementWithinViewport(page, saveThought, "Capture Save thought button");
  await expectTopBefore(
    mainCard,
    summaryCard,
    "Capture should place the raw-input card before support summary content on mobile.",
  );
  await expectTopBefore(
    mainCard,
    captureDetails,
    "Capture should place the raw-input card before Capture details diagnostics on mobile.",
  );
});
