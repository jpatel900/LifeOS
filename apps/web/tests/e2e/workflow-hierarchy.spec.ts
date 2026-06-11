import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

const homeEvidenceDir = path.join(
  process.cwd(),
  "test-results",
  "pass-7",
  "178-181-home-launchpad",
);

const triageEvidenceDir = path.join(
  process.cwd(),
  "test-results",
  "pass-7",
  "182-183-triage-decision",
);

const planningEvidenceDir = path.join(
  process.cwd(),
  "test-results",
  "pass-7",
  "184-185-planning-flow",
);

const captureEvidenceDir = path.join(
  process.cwd(),
  "test-results",
  "pass-7",
  "173-176-capture-hierarchy",
);

const executeEvidenceDir = path.join(
  process.cwd(),
  "test-results",
  "pass-7",
  "186-execute-mission",
);

const reviewEvidenceDir = path.join(
  process.cwd(),
  "test-results",
  "pass-7",
  "187-review-carry-forward",
);

const healthEvidenceDir = path.join(
  process.cwd(),
  "test-results",
  "pass-7",
  "188-health-diagnostic-home",
);

const areasEvidenceDir = path.join(
  process.cwd(),
  "test-results",
  "pass-7",
  "189-areas-admin-registry",
);

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

async function captureWorkflowEvidence(
  page: Page,
  evidenceDir: string,
  filename: string,
) {
  mkdirSync(evidenceDir, { recursive: true });
  await page.screenshot({
    path: path.join(evidenceDir, filename),
    fullPage: false,
  });
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
  await expect(page.getByTestId("triage-waiting-queue-card")).toHaveClass(
    /workflow-support-card/,
  );
  await expect(page.getByTestId("triage-queue-summary-card")).toHaveClass(
    /workflow-support-card/,
  );

  await seedPlanningHierarchyState(page);
  await page.goto("/calendar");
  await expect(page.getByTestId("app-shell-context-header")).toHaveCount(0);
  await expect(page.getByTestId("planning-flow-card")).toHaveClass(
    /workflow-flagship-card/,
  );
  await expect(page.getByTestId("planning-queue-summary-card")).toHaveClass(
    /workflow-support-card/,
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
  await expect(page.getByTestId("execute-next-move-card")).toHaveClass(
    /workflow-support-card/,
  );

  await page.goto("/review");
  await expect(page.getByTestId("app-shell-context-header")).toHaveCount(0);
  await expect(page.getByTestId("review-next-decision-card")).toHaveClass(
    /workflow-flagship-card/,
  );
  await expect(page.getByTestId("review-close-loop-card")).toHaveClass(
    /workflow-support-card/,
  );
  await expect(page.getByText("Review details and history", { exact: true })).toBeVisible();
  await expect(page.getByTestId("review-today-at-a-glance-card")).not.toBeVisible();

  await page.goto("/settings/areas");
  await expect(page.getByTestId("areas-create-card")).toHaveClass(
    /workflow-flagship-card/,
  );
  await expect(page.getByTestId("areas-header-summary-card")).toHaveCount(0);

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
  const readOnlyNote = page.getByTestId("home-read-only-note");
  const todayDetails = page.getByText("Today details", { exact: true });

  await expect(nextCard).toBeVisible();
  await expect(nextAction).toBeVisible();
  await expect(readOnlyNote).toBeVisible();
  await expect(page.getByText("Daily loop", { exact: true })).toHaveCount(0);
  await expectElementWithinViewport(page, nextAction, "Home next action");
  await expectTopBefore(
    nextCard,
    todayDetails,
    "Home should keep the dominant next-action card above Today details diagnostics.",
  );
  await captureWorkflowEvidence(
    page,
    homeEvidenceDir,
    "2026-06-11-178-181-home-mobile-rest.png",
  );
});

test("home keeps the launchpad quiet and read-only on desktop", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/");

  const nextCard = page.getByTestId("today-next-card");
  const nextAction = page.getByRole("link", { name: "Capture a thought" });
  const readOnlyNote = page.getByTestId("home-read-only-note");
  const todayDetails = page.getByText("Today details", { exact: true });

  await expect(nextCard).toBeVisible();
  await expect(nextAction).toBeVisible();
  await expect(readOnlyNote).toBeVisible();
  await expect(page.getByText("Daily loop", { exact: true })).toHaveCount(0);
  await expectTopBefore(
    nextCard,
    todayDetails,
    "Home should keep Today details below the launchpad card on desktop.",
  );
  await captureWorkflowEvidence(
    page,
    homeEvidenceDir,
    "2026-06-11-178-181-home-desktop-rest.png",
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
  await captureWorkflowEvidence(
    page,
    captureEvidenceDir,
    "2026-06-11-173-176-capture-mobile-rest.png",
  );
});

test("triage keeps the current decision ahead of queue summary and diagnostics at 390px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedTriageQueue(page);
  await page.goto("/triage");

  const currentItem = page.getByTestId("triage-current-item-card");
  const queueSummary = page.getByTestId("triage-queue-summary-card");
  const triageDetails = page.getByText("Triage details", { exact: true });

  await expect(currentItem).toBeVisible();
  await expectElementStartsWithinViewport(
    page,
    currentItem,
    "Triage current item",
  );
  await expectTopBefore(
    currentItem,
    queueSummary,
    "Triage should place the current decision before the queue summary on mobile.",
  );
  await expectTopBefore(
    currentItem,
    triageDetails,
    "Triage should keep Triage details diagnostics after the current decision on mobile.",
  );
  await captureWorkflowEvidence(
    page,
    triageEvidenceDir,
    "2026-06-11-182-183-triage-mobile-rest.png",
  );
});

test("planning keeps the local-first flow ahead of support summary and diagnostics at 390px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedPlanningHierarchyState(page);
  await page.goto("/calendar");

  const flowCard = page.getByTestId("planning-flow-card");
  const queueSummary = page.getByTestId("planning-queue-summary-card");
  const planningDetails = page.getByText("Planning details", { exact: true });

  await expect(flowCard).toBeVisible();
  await expectElementStartsWithinViewport(
    page,
    flowCard,
    "Planning flow card",
  );
  await expectTopBefore(
    flowCard,
    queueSummary,
    "Planning should place the local-first flow before the planning summary on mobile.",
  );
  await expectTopBefore(
    flowCard,
    planningDetails,
    "Planning should keep Planning details diagnostics after the local-first flow on mobile.",
  );
  await captureWorkflowEvidence(
    page,
    planningEvidenceDir,
    "2026-06-11-184-185-planning-mobile-rest.png",
  );
});

test("capture keeps raw input ahead of support summary and details on desktop", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/capture");

  const mainCard = page.getByTestId("capture-main-card");
  const saveThought = page.getByRole("button", { name: "Save thought" });
  const saveAndOrganize = page.getByRole("button", {
    name: "Save and organize",
  });
  const summaryCard = page.getByTestId("capture-header-summary-card");
  const captureDetails = page.getByText("Capture details", { exact: true });

  await expect(mainCard).toBeVisible();
  await expect(saveThought).toBeVisible();
  await expect(saveAndOrganize).toBeVisible();
  await expectTopBefore(
    mainCard,
    summaryCard,
    "Capture should keep the raw-input card before support summary content on desktop.",
  );
  await expectTopBefore(
    mainCard,
    captureDetails,
    "Capture should keep Capture details diagnostics after the main raw-input card on desktop.",
  );
  await captureWorkflowEvidence(
    page,
    captureEvidenceDir,
    "2026-06-11-173-176-capture-desktop-rest.png",
  );
});

test("triage keeps the current decision ahead of queue summary and diagnostics on desktop", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await seedTriageQueue(page);
  await page.goto("/triage");

  const currentItem = page.getByTestId("triage-current-item-card");
  const queueSummary = page.getByTestId("triage-queue-summary-card");
  const triageDetails = page.getByText("Triage details", { exact: true });

  await expect(currentItem).toBeVisible();
  await expectTopBefore(
    currentItem,
    queueSummary,
    "Triage should keep the current decision ahead of the queue summary on desktop.",
  );
  await expectTopBefore(
    currentItem,
    triageDetails,
    "Triage should keep Triage details diagnostics after the current decision on desktop.",
  );
  await captureWorkflowEvidence(
    page,
    triageEvidenceDir,
    "2026-06-11-182-183-triage-desktop-rest.png",
  );
});

test("planning keeps the local-first flow ahead of support summary and diagnostics on desktop", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await seedPlanningHierarchyState(page);
  await page.goto("/calendar");

  const flowCard = page.getByTestId("planning-flow-card");
  const queueSummary = page.getByTestId("planning-queue-summary-card");
  const planningDetails = page.getByText("Planning details", { exact: true });

  await expect(flowCard).toBeVisible();
  await expectTopBefore(
    flowCard,
    queueSummary,
    "Planning should keep the local-first flow ahead of the planning summary on desktop.",
  );
  await expectTopBefore(
    flowCard,
    planningDetails,
    "Planning should keep Planning details diagnostics after the local-first flow on desktop.",
  );
  await captureWorkflowEvidence(
    page,
    planningEvidenceDir,
    "2026-06-11-184-185-planning-desktop-rest.png",
  );
});

test("execute keeps one mission ahead of visible state and next-move support at 390px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedExecuteMission(page);
  await page.goto("/execute");

  const missionCard = page.getByTestId("execute-current-mission-card");
  const stateCard = page.getByTestId("execute-focus-state-card");
  const nextMoveCard = page.getByTestId("execute-next-move-card");

  await expect(missionCard).toBeVisible();
  await expectElementStartsWithinViewport(
    page,
    missionCard,
    "Execute mission card",
  );
  await expectTopBefore(
    missionCard,
    stateCard,
    "Execute should keep the current mission above the visible-state card on mobile.",
  );
  await expectTopBefore(
    missionCard,
    nextMoveCard,
    "Execute should keep the current mission above the next-move lane on mobile.",
  );
  await captureWorkflowEvidence(
    page,
    executeEvidenceDir,
    "2026-06-11-186-execute-mobile-rest.png",
  );
});

test("execute keeps one mission ahead of visible state and next-move support on desktop", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await seedExecuteMission(page);
  await page.goto("/execute");

  const missionCard = page.getByTestId("execute-current-mission-card");
  const stateCard = page.getByTestId("execute-focus-state-card");
  const nextMoveCard = page.getByTestId("execute-next-move-card");

  await expect(missionCard).toBeVisible();
  await expectTopBefore(
    missionCard,
    stateCard,
    "Execute should keep the current mission above the visible-state card on desktop.",
  );
  await expectTopBefore(
    missionCard,
    nextMoveCard,
    "Execute should keep the current mission above the next-move lane on desktop.",
  );
  await captureWorkflowEvidence(
    page,
    executeEvidenceDir,
    "2026-06-11-186-execute-desktop-rest.png",
  );
});

test("review keeps closure and carry-forward actions ahead of board and history at 390px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/review");

  const nextDecisionCard = page.getByTestId("review-next-decision-card");
  const closeLoopCard = page.getByTestId("review-close-loop-card");
  const reviewDetails = page.getByText("Review details and history", {
    exact: true,
  });

  await expect(nextDecisionCard).toBeVisible();
  await expect(closeLoopCard).toBeVisible();
  await expectElementStartsWithinViewport(
    page,
    nextDecisionCard,
    "Review next-decision card",
  );
  await expectTopBefore(
    nextDecisionCard,
    closeLoopCard,
    "Review should keep the closure flagship above carry-forward routing on mobile.",
  );
  await expectTopBefore(
    closeLoopCard,
    reviewDetails,
    "Review should keep board and history details below the carry-forward actions on mobile.",
  );
  await expect(page.getByTestId("review-today-at-a-glance-card")).not.toBeVisible();
  await captureWorkflowEvidence(
    page,
    reviewEvidenceDir,
    "2026-06-11-187-review-mobile-rest.png",
  );
});

test("review keeps closure and carry-forward actions ahead of board and history on desktop", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/review");

  const nextDecisionCard = page.getByTestId("review-next-decision-card");
  const closeLoopCard = page.getByTestId("review-close-loop-card");
  const reviewDetails = page.getByText("Review details and history", {
    exact: true,
  });

  await expect(nextDecisionCard).toBeVisible();
  await expect(closeLoopCard).toBeVisible();
  await expectTopBefore(
    nextDecisionCard,
    closeLoopCard,
    "Review should keep the closure flagship above carry-forward routing on desktop.",
  );
  await expectTopBefore(
    closeLoopCard,
    reviewDetails,
    "Review should keep board and history details below the carry-forward actions on desktop.",
  );
  await expect(page.getByTestId("review-today-at-a-glance-card")).not.toBeVisible();
  await captureWorkflowEvidence(
    page,
    reviewEvidenceDir,
    "2026-06-11-187-review-desktop-rest.png",
  );
});

test("health keeps the trust answer ahead of route diagnostics at 390px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/health");

  const reliabilityCard = page.getByTestId("health-reliability-card");
  const trustMapCard = page.getByTestId("health-trust-summary-card");
  const healthDetails = page.getByText("System and developer details", {
    exact: true,
  });

  await expect(reliabilityCard).toBeVisible();
  await expectElementStartsWithinViewport(
    page,
    reliabilityCard,
    "Health reliability card",
  );
  await expectTopBefore(
    reliabilityCard,
    trustMapCard,
    "Health should keep the trust answer above the trust map on mobile.",
  );
  await expectTopBefore(
    reliabilityCard,
    healthDetails,
    "Health should keep lower-level diagnostics below the trust answer on mobile.",
  );
  await captureWorkflowEvidence(
    page,
    healthEvidenceDir,
    "2026-06-11-188-health-mobile-rest.png",
  );
});

test("health keeps the trust answer ahead of route diagnostics on desktop", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/health");

  const reliabilityCard = page.getByTestId("health-reliability-card");
  const trustMapCard = page.getByTestId("health-trust-summary-card");
  const healthDetails = page.getByText("System and developer details", {
    exact: true,
  });

  await expect(reliabilityCard).toBeVisible();
  await expectTopBefore(
    reliabilityCard,
    trustMapCard,
    "Health should keep the trust answer above the trust map on desktop.",
  );
  await expectTopBefore(
    reliabilityCard,
    healthDetails,
    "Health should keep lower-level diagnostics below the trust answer on desktop.",
  );
  await captureWorkflowEvidence(
    page,
    healthEvidenceDir,
    "2026-06-11-188-health-desktop-rest.png",
  );
});

test("areas keeps creation ahead of registry records and lower admin details at 390px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings/areas");

  const createCard = page.getByTestId("areas-create-card");
  const firstAreaCard = page.getByTestId("areas-area-card").first();
  const registryDetails = page.getByText("Registry details", { exact: true });

  await expect(createCard).toBeVisible();
  await expect(page.getByTestId("areas-header-summary-card")).toHaveCount(0);
  await expectElementStartsWithinViewport(
    page,
    createCard,
    "Areas create card",
  );
  await expectTopBefore(
    createCard,
    firstAreaCard,
    "Areas should keep create-area work above registry records on mobile.",
  );
  await expectTopBefore(
    createCard,
    registryDetails,
    "Areas should keep lower admin details below the create-area card on mobile.",
  );
  await captureWorkflowEvidence(
    page,
    areasEvidenceDir,
    "2026-06-11-189-areas-mobile-rest.png",
  );
});

test("areas keeps creation ahead of registry records and lower admin details on desktop", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/settings/areas");

  const createCard = page.getByTestId("areas-create-card");
  const firstAreaCard = page.getByTestId("areas-area-card").first();
  const registryDetails = page.getByText("Registry details", { exact: true });

  await expect(createCard).toBeVisible();
  await expect(page.getByTestId("areas-header-summary-card")).toHaveCount(0);
  await expectTopBefore(
    createCard,
    firstAreaCard,
    "Areas should keep create-area work above registry records on desktop.",
  );
  await expectTopBefore(
    createCard,
    registryDetails,
    "Areas should keep lower admin details below the create-area card on desktop.",
  );
  await captureWorkflowEvidence(
    page,
    areasEvidenceDir,
    "2026-06-11-189-areas-desktop-rest.png",
  );
});
