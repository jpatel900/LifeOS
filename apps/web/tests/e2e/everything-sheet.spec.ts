import { expect, test, type Page } from "@playwright/test";
import { stubParseCaptureRoute } from "./helpers/mockParseCapture";

// FR-050 (#1160): the Everything sheet, driven in a real browser on the
// device tier. The rules are unit-pinned in `everythingList.test.ts`; this
// proves the shipped wiring: the door on Start, the URL contract, one row per
// item, and that the sheet holds at 390px with a worst-case title.
//
// Nothing here asserts "Today" or any other clock-relative label, so the spec
// needs no pinned clock.

const STORAGE_KEY = "lifeos.phase2.workflow";
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const AREA_ID = "e2e-area-everything";
const DECIDED_TEXT = "Call the accountant about the quarterly filing";
const AGENT_TEXT = "Send the budget numbers to the committee";
const DONE_TEXT = "Pay the hydro bill";
const LONG_TEXT =
  "Supercalifragilisticexpialidocious-unbroken-reference-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-and-a-very-long-title-that-keeps-going";

function buildState() {
  const nowMs = Date.now();
  const daysBefore = (days: number) =>
    new Date(nowMs - days * MS_PER_DAY).toISOString();
  const task = {
    user_id: "e2e-user",
    area_id: AREA_ID,
    project_id: null,
    source_capture_item_id: null,
    description: null,
    status: "active",
    priority_score: null,
    priority_confidence: null,
    task_type: null,
    energy_type: null,
    estimated_minutes_low: 25,
    estimated_minutes_high: 40,
    due_at: null,
    definition_of_done: null,
    first_tiny_step: "Find the reference",
    created_at: daysBefore(3),
    updated_at: daysBefore(3),
  };
  const capture = {
    user_id: "e2e-user",
    area_id: AREA_ID,
    return_hook: null,
    capture_mode: "text",
    inferred_area_confidence: null,
    status: "new",
  };
  return {
    areas: [
      {
        id: AREA_ID,
        user_id: "e2e-user",
        name: "Main Job",
        color: "#2563eb",
        created_at: daysBefore(100),
      },
    ],
    captureItems: [
      {
        ...capture,
        id: "e2e-cap-decided",
        raw_text: DECIDED_TEXT,
        created_at: daysBefore(5),
      },
      {
        ...capture,
        id: "e2e-cap-agent",
        raw_text: `${AGENT_TEXT} (via Hermes)`,
        created_at: daysBefore(2),
      },
      {
        ...capture,
        id: "e2e-cap-long",
        raw_text: LONG_TEXT,
        created_at: daysBefore(4),
      },
    ],
    taskDrafts: [],
    projectDrafts: [],
    ambiguityAssessments: [],
    timeBlockProposalDrafts: [],
    projects: [],
    tasks: [
      {
        ...task,
        id: "e2e-task-decided",
        title: DECIDED_TEXT,
        source_capture_item_id: "e2e-cap-decided",
      },
      { ...task, id: "e2e-task-done", title: DONE_TEXT, status: "done" },
    ],
    timeBlockProposals: [],
    calendarBlocks: [],
    executionSessions: [],
    healthChecks: [],
    reviewLog: [],
    wipRefusal: null,
  };
}

async function seed(page: Page) {
  await stubParseCaptureRoute(page);
  await page.addInitScript(
    ({ key, value }) => {
      // Seed once per tab: a reload must read back what the app itself saved.
      if (!window.sessionStorage.getItem(key)) {
        window.sessionStorage.setItem(key, JSON.stringify(value));
      }
    },
    { key: STORAGE_KEY, value: buildState() },
  );
}

test.beforeAll(async ({ browser }) => {
  const warmup = await browser.newPage();
  await warmup.goto("/", { timeout: 180_000 });
  await warmup.close();
});

test.describe("FR-050 — Everything sheet", () => {
  test("opens from Start, lists each item once, and survives reload from its URL", async ({
    page,
  }) => {
    await seed(page);
    await page.goto("/");
    await expect(page.getByTestId("today-moments")).toBeVisible();
    await page.keyboard.press("1");
    await expect(page.getByTestId("start-moment")).toBeVisible();

    await page.getByTestId("start-open-everything").click();
    const sheet = page.getByTestId("everything-sheet");
    await expect(sheet).toBeVisible();
    await expect(page).toHaveURL(/[?&]sheet=everything\b/);

    // One item, one truth: the thought that became a task is one row, the task.
    await expect(sheet.getByText(DECIDED_TEXT, { exact: true })).toHaveCount(1);
    await expect(
      page.getByTestId("everything-item-task:e2e-task-decided"),
    ).toContainText("Ready");
    await expect(
      page.getByTestId("everything-item-thought:e2e-cap-decided"),
    ).toHaveCount(0);

    // The agent's mark is shown as a tag and kept out of the title.
    const agentRow = page.getByTestId("everything-item-thought:e2e-cap-agent");
    await expect(agentRow).toContainText(AGENT_TEXT);
    await expect(agentRow).not.toContainText("(via Hermes)");
    await expect(agentRow.getByTestId("everything-source")).toHaveText(
      "via Hermes",
    );

    // Closed items wait until asked for; the header counts them regardless.
    await expect(page.getByTestId("everything-summary")).toContainText(
      "4 items. 3 still open.",
    );
    await expect(sheet.getByText(DONE_TEXT)).toHaveCount(0);
    await page.getByTestId("everything-show-closed").click();
    await expect(
      page.getByTestId("everything-item-task:e2e-task-done"),
    ).toContainText("Done");

    // By date entered: each row carries how far it got.
    await page.getByTestId("everything-grouping-entered").click();
    await expect(
      agentRow.getByRole("img", { name: "Got as far as: Thought" }),
    ).toBeVisible();
    await expect(
      page
        .getByTestId("everything-item-task:e2e-task-decided")
        .getByRole("img", { name: "Got as far as: Task" }),
    ).toBeVisible();

    // The URL owns the sheet: reload keeps it, Escape clears it.
    await page.reload();
    await expect(page.getByTestId("everything-sheet")).toBeVisible();
    await expect(
      page.getByTestId("everything-item-task:e2e-task-decided"),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("everything-sheet")).toHaveCount(0);
    await expect(page).not.toHaveURL(/sheet=everything/);
  });

  test("opens from Start at 390px and holds with an unbroken, very long title", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seed(page);
    await page.goto("/");
    await expect(page.getByTestId("today-moments")).toBeVisible();
    await page.keyboard.press("1");
    const door = page.getByTestId("start-open-everything");
    await door.scrollIntoViewIfNeeded();
    const doorBox = await door.boundingBox();
    expect(doorBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    await door.click();
    const dialog = page.getByTestId("moment-sheet-dialog");
    await expect(page.getByTestId("everything-sheet")).toBeVisible();
    await expect(
      page.getByTestId("everything-item-thought:e2e-cap-long"),
    ).toBeVisible();

    const overflow = await dialog.evaluate((node) => ({
      sheet: node.scrollWidth - node.clientWidth,
      page:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    }));
    expect(overflow.sheet).toBeLessThanOrEqual(0);
    expect(overflow.page).toBeLessThanOrEqual(0);

    // Every control stays a real touch target.
    for (const testId of [
      "everything-grouping-due",
      "everything-grouping-entered",
      "everything-show-closed",
      "everything-search",
    ]) {
      const box = await page.getByTestId(testId).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });
});
