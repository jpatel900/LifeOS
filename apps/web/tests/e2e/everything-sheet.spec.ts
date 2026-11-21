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
const DUE_TEXT = "Send the signed form back";
const LONG_AREA_ID = "e2e-area-second";
const LONG_AREA_NAME = "Extraordinarilylongunbrokenareanamewithnospaces";
const LONG_TEXT =
  "Supercalifragilisticexpialidocious-unbroken-reference-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-and-a-very-long-title-that-keeps-going";

function buildState(secondAreaName: string) {
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
      {
        id: LONG_AREA_ID,
        user_id: "e2e-user",
        name: secondAreaName,
        color: "#d97706",
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
      {
        ...task,
        id: "e2e-task-due",
        title: `${DUE_TEXT} ${LONG_TEXT}`,
        area_id: LONG_AREA_ID,
        due_at: new Date(nowMs + 40 * MS_PER_DAY).toISOString(),
      },
    ],
    timeBlockProposals: [],
    calendarBlocks: [],
    executionSessions: [],
    healthChecks: [],
    reviewLog: [],
    wipRefusal: null,
  };
}

async function seed(page: Page, secondAreaName = "Volunteer Work") {
  await stubParseCaptureRoute(page);
  await page.addInitScript(
    ({ key, value }) => {
      // Seed once per tab: a reload must read back what the app itself saved.
      if (!window.sessionStorage.getItem(key)) {
        window.sessionStorage.setItem(key, JSON.stringify(value));
      }
    },
    { key: STORAGE_KEY, value: buildState(secondAreaName) },
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
      "5 items. 4 still open.",
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

    // One row shape on the phone: the details sit under the title, in view.
    const longRow = page.getByTestId("everything-item-thought:e2e-cap-long");
    await expect(longRow.getByTestId("everything-stage")).toBeVisible();
    await expect(longRow.getByTestId("everything-area-tag")).toBeVisible();
    await expect(longRow).toContainText("Entered");

    // The same shape as desktop: details under the title, due day beside it.
    const dueRow = page.getByTestId("everything-item-task:e2e-task-due");
    await expect(dueRow.getByTestId("everything-due")).toBeVisible();
    const shape = async () => {
      const title = await dueRow.locator("p").first().boundingBox();
      const stage = await dueRow.getByTestId("everything-stage").boundingBox();
      const due = await dueRow.getByTestId("everything-due").boundingBox();
      return {
        stageUnderTitle:
          (stage?.y ?? 0) >= (title?.y ?? 0) + (title?.height ?? 0),
        dueRightOfTitle: (due?.x ?? 0) >= (title?.x ?? 0) + (title?.width ?? 0),
      };
    };
    expect(await shape()).toEqual({
      stageUnderTitle: true,
      dueRightOfTitle: true,
    });

    // All four grouping tabs fit; none is cut off behind a hidden scroll.
    const tabs = await page
      .getByTestId("everything-groupings")
      .evaluate((node) => ({
        sideways: node.scrollWidth - node.clientWidth,
        upDown: node.scrollHeight - node.clientHeight,
      }));
    expect(tabs).toEqual({ sideways: 0, upDown: 0 });

    // A group folds from its heading and opens again: by touch...
    const fold = page.getByTestId("everything-fold-none");
    await fold.click();
    await expect(fold).toHaveAttribute("aria-expanded", "false");
    await expect(longRow).toHaveCount(0);
    await fold.click();
    await expect(longRow).toBeVisible();
    // ...and by keyboard.
    await fold.focus();
    await page.keyboard.press("Enter");
    await expect(fold).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Space");
    await expect(fold).toHaveAttribute("aria-expanded", "true");

    // Desktop keeps the same row shape.
    await page.setViewportSize({ width: 1440, height: 900 });
    expect(await shape()).toEqual({
      stageUnderTitle: true,
      dueRightOfTitle: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });

    // Every control stays a real touch target.
    for (const testId of [
      "everything-grouping-due",
      "everything-grouping-entered",
      "everything-show-closed",
      "everything-search",
      "everything-fold-none",
    ]) {
      const box = await page.getByTestId(testId).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });

  // The sheet's own claim: its dialog holds. The page behind it is pinned
  // by the tests below (#1163), which measure Start with no sheet open.
  test("holds at 390px when grouped by a long, unbroken area name", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seed(page, LONG_AREA_NAME);
    await page.goto("/?sheet=everything");
    const dialog = page.getByTestId("moment-sheet-dialog");
    await expect(page.getByTestId("everything-sheet")).toBeVisible();
    await page.getByTestId("everything-grouping-area").click();
    const heading = page.getByTestId(`everything-fold-${LONG_AREA_ID}`);
    await expect(heading).toBeVisible();
    await expect(heading).toContainText(LONG_AREA_NAME);

    const overflow = await dialog.evaluate(
      (node) => node.scrollWidth - node.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const box = await heading.boundingBox();
    const dialogBox = await dialog.boundingBox();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
      (dialogBox?.x ?? 0) + (dialogBox?.width ?? 0),
    );
  });

  // #1163: one area with a long, unbroken name must not push Start sideways.
  // The page, the masthead, the Start hero and the pipeline rail all have to
  // end inside the phone's width, at the usual phone size and at the narrowest.
  for (const width of [390, 320]) {
    test(`Start holds at ${width}px with a long, unbroken area name`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await seed(page, LONG_AREA_NAME);
      await page.goto("/");
      await expect(page.getByTestId("today-moments")).toBeVisible();
      await page.keyboard.press("1");
      await expect(page.getByTestId("start-moment")).toBeVisible();
      await expect(page.getByTestId("pipeline-overview")).toBeVisible();

      const measured = await page.evaluate(() => {
        const rightEdge = (testId: string) =>
          document
            .querySelector(`[data-testid="${testId}"]`)
            ?.getBoundingClientRect().right ?? null;
        return {
          sideways:
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
          viewport: document.documentElement.clientWidth,
          rightEdges: {
            masthead: rightEdge("today-moments-area-switcher"),
            hero: rightEdge("start-moment"),
            rail: rightEdge("pipeline-overview"),
          },
        };
      });
      expect(measured.sideways).toBeLessThanOrEqual(0);
      for (const edge of Object.values(measured.rightEdges)) {
        expect(edge).not.toBeNull();
        expect(edge ?? 0).toBeLessThanOrEqual(measured.viewport);
      }
    });
  }
});
