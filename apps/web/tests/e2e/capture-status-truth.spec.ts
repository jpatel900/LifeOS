import { expect, test, type Page } from "@playwright/test";
import { stubParseCaptureRoute } from "./helpers/mockParseCapture";

/**
 * Final UX Loop C1 — Target Cards 1 + 4, audit P0#3: "sorted/accepted work
 * never resurrects as unsorted", and "one item = one truth: never
 * simultaneously 'unsorted' and an accepted task anywhere in the app".
 *
 * ## What THIS tier proves, and what it deliberately does not
 *
 * Same split as `session-truth.spec.ts` (#737/PR #764): this suite's dev
 * server runs with NO Supabase env, so `createSupabaseBrowserClient()` returns
 * null and there is no account to write to. That is what makes the split
 * necessary, and honest:
 *
 *  - DEVICE tier (this file, real browser): a live capture → sort → accept
 *    journey removes the thought from every "not sorted yet" surface; and a
 *    session that STARTS from the exact state the account used to hand back
 *    (capture `status: "new"`, a task pointing at it, no drafts) still shows
 *    it nowhere as unsorted. The second test is the audit's reproduction: the
 *    audit's "new browser session" observed precisely this state, because
 *    task drafts are device-local and never survive.
 *  - ACCOUNT tier (`src/__tests__/phase4aRls.local.test.ts`, real Postgres):
 *    `resolveCaptureItems` is permitted, lands, is ownership-bounded and never
 *    drags a decided row backwards — so the account stops producing that state
 *    for new work at all.
 *  - WIRING tier (`src/lib/workflowContext/persistenceSync.captureStatus.test.ts`):
 *    accepting a draft actually issues that write.
 *
 * No tier alone is the claim. Together they are.
 *
 * Red-first on `origin/main` @ 6cc76ade: the resurrection test fails there —
 * the thought is listed under `Captured, not sorted yet` with a `Sort` button
 * while the same screen offers it as an accepted task.
 */

const STORAGE_KEY = "lifeos.phase2.workflow";
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const AREA_ID = "e2e-area-capture-status";
const CAPTURE_ID = "e2e-capture-resurrection";
const TASK_ID = "e2e-task-from-capture";
const DECIDED_TEXT = "Call the accountant about the quarterly filing";
const CAPTURE_TEXT = "Capture status truth proof";

test.beforeEach(async ({ page }) => {
  await stubParseCaptureRoute(page);
});

// The dev server compiles `/` on its first request; pay that once outside any
// test's timeout budget (same guard as session-truth.spec.ts).
test.beforeAll(async ({ browser }) => {
  const warmup = await browser.newPage();
  await warmup.goto("/", { timeout: 180_000 });
  await warmup.close();
});

/**
 * The state a fresh session held after the audit's run: the capture is back at
 * `status: "new"` because the accept never advanced it, the task that came
 * from it is present and points at it, and the draft that briefly sat between
 * them is gone (drafts are device-local).
 */
function buildResurrectedState() {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const daysBefore = (days: number) =>
    new Date(nowMs - days * MS_PER_DAY).toISOString();

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
        id: CAPTURE_ID,
        user_id: "e2e-user",
        area_id: AREA_ID,
        raw_text: DECIDED_TEXT,
        return_hook: null,
        capture_mode: "text",
        inferred_area_confidence: null,
        status: "new",
        created_at: daysBefore(2),
      },
    ],
    taskDrafts: [],
    projectDrafts: [],
    ambiguityAssessments: [],
    timeBlockProposalDrafts: [],
    projects: [],
    tasks: [
      {
        id: TASK_ID,
        user_id: "e2e-user",
        area_id: AREA_ID,
        project_id: null,
        source_capture_item_id: CAPTURE_ID,
        title: DECIDED_TEXT,
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
        first_tiny_step: "Find the filing reference",
        created_at: daysBefore(2),
        updated_at: nowIso,
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

/**
 * The Pipeline "Capture" badge, in whichever of its two forms is on screen:
 * the rail hides the numbers entirely when every stage is zero and shows
 * captions instead, so "no badge" and "a badge reading 0" are both truthful.
 * A badge reading anything else is the lie this pins.
 */
async function pipelineCaptureCounts(page: Page): Promise<string[]> {
  return (
    await page.getByTestId("pipeline-overview-count-capture").allTextContents()
  ).map((text) => text.trim());
}

async function openStart(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("today-moments")).toBeVisible();
  // The opening moment is wall-clock derived; pin it so the run is
  // deterministic at any hour (the same pin every other moments spec uses).
  await page.keyboard.press("1");
  await expect(page.getByTestId("start-moment")).toBeVisible();
}

test.describe("C1 cards 1+4 — capture status truth", () => {
  test("a thought an accepted task already came from is never offered back as unsorted", async ({
    browser,
  }) => {
    // A genuinely fresh session: its own context, its own storage. Seeded with
    // the shape the account handed back after the audit's capture→sort→accept.
    const context = await browser.newContext();
    const page = await context.newPage();
    await stubParseCaptureRoute(page);
    await page.addInitScript(
      ({ key, value }) => {
        window.sessionStorage.setItem(key, JSON.stringify(value));
      },
      { key: STORAGE_KEY, value: buildResurrectedState() },
    );

    try {
      await openStart(page);

      // The task IS there — this is the half of the truth that was always
      // right, and the half that makes the other half a lie.
      await expect(page.getByTestId("start-moment")).toContainText(
        DECIDED_TEXT,
      );

      // 1. The Start hero must not claim a decision is outstanding.
      await expect(page.getByTestId("start-pending-triage")).toHaveCount(0);
      await expect(page.getByTestId("start-pending-triage-card")).toHaveCount(
        0,
      );

      // 2. The Pipeline Capture badge must not count it.
      expect(await pipelineCaptureCounts(page)).not.toContain("1");

      // 3. The triage sheet must not list it, and must not offer a Sort
      //    button for a thought that already became a task.
      await page.getByTestId("pipeline-overview-stage-triage").click();
      await expect(page.getByTestId("triage-sheet-captures")).toHaveCount(0);
      await expect(page.getByTestId(/^triage-sheet-sort-/)).toHaveCount(0);
      await expect(page.getByTestId("triage-sheet-empty")).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("capture → sort → accept takes the thought out of every unsorted surface", async ({
    page,
  }) => {
    await openStart(page);

    await page.getByTestId("capture-affordance").click();
    await page.getByTestId("capture-overlay-textarea").fill(CAPTURE_TEXT);
    await page.getByTestId("capture-overlay-save").click();
    await expect(page.getByTestId("capture-overlay")).toHaveCount(0, {
      timeout: 15_000,
    });

    // Unsorted, and honestly counted as such.
    await page.getByTestId("pipeline-overview-stage-triage").click();
    await expect(page.getByTestId("triage-sheet-captures")).toContainText(
      CAPTURE_TEXT,
    );

    // Sort turns it into a draft.
    await page
      .getByTestId(/^triage-sheet-sort-/)
      .first()
      .click();
    await expect(page.getByTestId("triage-sheet-list")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("triage-sheet-captures")).toHaveCount(0);

    // Accept it.
    await page
      .getByTestId(/^triage-sheet-accept-/)
      .first()
      .click();
    await expect(page.getByTestId("triage-sheet-empty")).toBeVisible({
      timeout: 15_000,
    });

    // And it stays gone from every surface that says "not sorted yet" — the
    // accepted task is now the thought's one truth.
    await expect(page.getByTestId("triage-sheet-captures")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("start-moment")).toBeVisible();
    await expect(page.getByTestId("start-pending-triage")).toHaveCount(0);
    expect(await pipelineCaptureCounts(page)).not.toContain("1");
  });
});
