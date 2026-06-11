import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const finalAuditDir = path.join(
  process.cwd(),
  "test-results",
  "pass-7",
  "final-audit",
);

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
    const userId = state.areas[0]?.user_id ?? "workflow-audit-user";
    const now = new Date().toISOString();

    state.taskDrafts = [
      {
        id: "task-draft-audit-current",
        user_id: userId,
        capture_item_id: "capture-audit-current",
        area_id: areaId,
        title: "Audit current triage item",
        description: "Keep one current decision visually dominant.",
        confidence: 0.82,
        estimated_minutes_low: 20,
        estimated_minutes_high: 35,
        first_tiny_step: "Review the current item first.",
        status: "pending",
        created_at: now,
      },
      {
        id: "task-draft-audit-next",
        user_id: userId,
        capture_item_id: "capture-audit-next",
        area_id: areaId,
        title: "Audit up-next triage item",
        description: "Secondary queue context stays quieter.",
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
        id: "task-final-audit-1",
        user_id: "00000000-0000-0000-0000-000000000001",
        area_id: "area-main-job",
        title: "Final audit mission",
        description: null,
        status: "active",
        priority_score: null,
        priority_confidence: null,
        task_type: null,
        energy_type: null,
        estimated_minutes_low: 25,
        estimated_minutes_high: 40,
        due_at: null,
        definition_of_done: "Finish the audit packet.",
        first_tiny_step: "Open the mission and start.",
        created_at: now,
        updated_at: now,
        project_id: null,
        source_capture_item_id: null,
      },
    ];
    window.sessionStorage.setItem(storageKey, JSON.stringify(state));
  });
}

async function captureRoute(
  page: Page,
  route: string,
  screenshotName: string,
  ready: () => Promise<void>,
) {
  mkdirSync(finalAuditDir, { recursive: true });
  await page.goto(route);
  await ready();
  await page.screenshot({
    path: path.join(finalAuditDir, screenshotName),
    fullPage: false,
  });
}

test("final audit packet captures the mobile first viewport for every audited surface", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await captureRoute(
    page,
    "/triage",
    "2026-06-11-app-shell-mobile-rest.png",
    async () => {
      await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
    },
  );
  await captureRoute(page, "/", "2026-06-11-home-mobile-rest.png", async () => {
    await expect(page.getByTestId("today-next-card")).toBeVisible();
  });
  await captureRoute(
    page,
    "/capture",
    "2026-06-11-capture-mobile-rest.png",
    async () => {
      await expect(page.getByTestId("capture-main-card")).toBeVisible();
    },
  );
  await captureRoute(
    page,
    "/triage",
    "2026-06-11-triage-mobile-rest.png",
    async () => {
      await seedTriageQueue(page);
      await page.goto("/triage");
      await expect(page.getByTestId("triage-current-item-card")).toBeVisible();
    },
  );
  await captureRoute(
    page,
    "/calendar",
    "2026-06-11-planning-mobile-rest.png",
    async () => {
      await expect(page.getByText("Planning flow")).toBeVisible();
    },
  );
  await seedExecuteMission(page);
  await captureRoute(
    page,
    "/execute",
    "2026-06-11-execute-mobile-rest.png",
    async () => {
      await expect(page.getByTestId("execute-current-mission-card")).toBeVisible();
    },
  );
  await captureRoute(
    page,
    "/review",
    "2026-06-11-review-mobile-rest.png",
    async () => {
      await expect(page.getByText("Review details and history")).toBeVisible();
    },
  );
  await captureRoute(
    page,
    "/health",
    "2026-06-11-health-mobile-rest.png",
    async () => {
      await expect(page.getByTestId("health-reliability-card")).toBeVisible();
    },
  );
  await captureRoute(
    page,
    "/settings/areas",
    "2026-06-11-areas-mobile-rest.png",
    async () => {
      await expect(page.getByTestId("areas-create-card")).toBeVisible();
    },
  );
});

test("final audit packet captures the desktop resting view for every audited surface", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });

  await captureRoute(
    page,
    "/triage",
    "2026-06-11-app-shell-desktop-rest.png",
    async () => {
      await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
    },
  );
  await captureRoute(page, "/", "2026-06-11-home-desktop-rest.png", async () => {
    await expect(page.getByTestId("today-next-card")).toBeVisible();
  });
  await captureRoute(
    page,
    "/capture",
    "2026-06-11-capture-desktop-rest.png",
    async () => {
      await expect(page.getByTestId("capture-main-card")).toBeVisible();
    },
  );
  await captureRoute(
    page,
    "/triage",
    "2026-06-11-triage-desktop-rest.png",
    async () => {
      await seedTriageQueue(page);
      await page.goto("/triage");
      await expect(page.getByTestId("triage-current-item-card")).toBeVisible();
    },
  );
  await captureRoute(
    page,
    "/calendar",
    "2026-06-11-planning-desktop-rest.png",
    async () => {
      await expect(page.getByText("Planning flow")).toBeVisible();
    },
  );
  await seedExecuteMission(page);
  await captureRoute(
    page,
    "/execute",
    "2026-06-11-execute-desktop-rest.png",
    async () => {
      await expect(page.getByTestId("execute-current-mission-card")).toBeVisible();
    },
  );
  await captureRoute(
    page,
    "/review",
    "2026-06-11-review-desktop-rest.png",
    async () => {
      await expect(page.getByText("Review details and history")).toBeVisible();
    },
  );
  await captureRoute(
    page,
    "/health",
    "2026-06-11-health-desktop-rest.png",
    async () => {
      await expect(page.getByTestId("health-reliability-card")).toBeVisible();
    },
  );
  await captureRoute(
    page,
    "/settings/areas",
    "2026-06-11-areas-desktop-rest.png",
    async () => {
      await expect(page.getByTestId("areas-create-card")).toBeVisible();
    },
  );
});
