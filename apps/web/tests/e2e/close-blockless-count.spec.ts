import { expect, test, type Page } from "@playwright/test";
import { stubParseCaptureRoute } from "./helpers/mockParseCapture";
import { pinMomentPreference } from "./helpers/momentPreference";

/**
 * #737 C1 re-score GAP 4 — a completed BLOCKLESS session is counted at Close.
 *
 * ## The gap
 *
 * `/?moment=close` read `0 COMPLETED TODAY` at a moment when the account held
 * an `execution_sessions` row with `outcome:"completed"` for that same local
 * day. `buildCloseVM` counted `calendarBlocks` and nothing else, so the exact
 * path audit P0#2 rescued — a focus session on an UNSCHEDULED task — was the
 * one the day's summary could not see.
 *
 * This is the INVERSE of a phantom save: nothing was claimed that did not
 * happen; something that did happen was left out. The fix is in the count, not
 * in the write path, and this spec pins it where a user meets it.
 *
 * ## What is proven here, and what is not
 *
 * PROVEN (device tier, real browser): finish a session on a task with no
 * block, open Close, and the count reads 1 — end to end through the real
 * reducer, the real end sheet, and the real view model.
 *
 * NOT PROVEN here: that the account row exists. This suite's dev server runs
 * with no Supabase env at all, so there is nothing to write to. The account
 * half is already pinned by `session-truth.spec.ts` (the journalled write) and
 * `src/__tests__/phase4aRls.local.test.ts` (the row against real Postgres).
 * The derivation itself is pinned exhaustively — block-linked sessions,
 * ghost outcomes, other days, missing timestamps — in
 * `momentsViewModel.test.ts`.
 *
 * ## Clock pinning
 *
 * `pinMomentPreference` is used for both moments, for the reason its own
 * header gives: `heuristicMoment` reads the browser's local hour, so a spec
 * that navigates to `/` without a pin renders a different surface depending on
 * when CI runs. The Close half uses the `?moment=close` deep link on top, so
 * the moment is fixed by the URL as well.
 */

const STORAGE_KEY = "lifeos.phase2.workflow";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const AREA_ID = "e2e-area-blockless-count";
const TASK_ID = "e2e-task-blockless-count";
const TASK_TITLE = "Call the insurance broker";

test.beforeEach(async ({ page }) => {
  await stubParseCaptureRoute(page);
});

// The dev server compiles `/` on its first request, and a cold compile has
// exceeded this suite's per-test timeout before. Pay it once, outside any
// test's budget. (Same reasoning as `session-truth.spec.ts`.)
test.beforeAll(async ({ browser }) => {
  const warmup = await browser.newPage();
  await warmup.goto("/", { timeout: 180_000 });
  await warmup.close();
});

/**
 * One ACTIVE task with no block anywhere, and nothing else.
 *
 * No blocks at all is the point: every number the Close card shows has to come
 * from the session, so a passing assertion cannot be a block's doing.
 */
function buildSeedState() {
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
    captureItems: [],
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
        source_capture_item_id: null,
        title: TASK_TITLE,
        description: null,
        status: "active",
        priority_score: null,
        priority_confidence: null,
        task_type: null,
        energy_type: null,
        estimated_minutes_low: 25,
        estimated_minutes_high: 60,
        due_at: null,
        definition_of_done: null,
        first_tiny_step: null,
        created_at: daysBefore(9),
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

async function openHome(page: Page) {
  await pinMomentPreference(page, "start");
  await page.addInitScript(
    ({ key, value }) => {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    },
    { key: STORAGE_KEY, value: buildSeedState() },
  );
  await page.goto("/");
  await expect(page.getByTestId("today-moments")).toBeVisible();
}

test.describe("#737 C1 GAP 4 — Close counts a blockless completed session", () => {
  test("finishing a session on an unscheduled task makes Close read 1 completed", async ({
    page,
  }) => {
    await openHome(page);

    // Start the session on the blockless task, exactly as the Start moment
    // offers it.
    await page.getByTestId("first-move-start").click();
    await expect(page.getByTestId("current-block-hero")).toBeVisible();

    // End it with the outcome the user picks. Nothing is recorded before this.
    await page.getByTestId("current-block-hero-done").click();
    await expect(page.getByTestId("end-session-sheet")).toBeVisible();
    await page.getByTestId("end-session-outcome-completed").click();
    await page.getByTestId("end-session-minutes").fill("17");
    await page.getByTestId("end-session-note").fill("They picked up");
    await page.getByTestId("end-session-save").click();

    // The device holds the finished session. Reading it here means a failing
    // count below is a COUNTING bug, not a lost write — which is the whole
    // distinction the re-score drew for this gap.
    await expect
      .poll(async () =>
        page.evaluate((key) => {
          const raw = window.sessionStorage.getItem(key);
          const state = JSON.parse(raw ?? "{}") as {
            executionSessions?: {
              outcome: string;
              calendar_block_id: string | null;
            }[];
          };
          return (state.executionSessions ?? []).filter(
            (session) =>
              session.outcome === "completed" &&
              session.calendar_block_id === null,
          ).length;
        }, STORAGE_KEY),
      )
      .toBe(1);

    await page.goto("/?moment=close");
    await expect(page.getByTestId("close-moment-summary")).toBeVisible({
      timeout: 15_000,
    });

    // THE ASSERTION. Before the fix this read "0" while the row above existed.
    await expect(page.getByTestId("close-moment-completed")).toHaveText("1");
  });

  test("with nothing finished, Close still reads 0 — the fix does not invent one", async ({
    page,
  }) => {
    await openHome(page);

    await page.goto("/?moment=close");
    await expect(page.getByTestId("close-moment-summary")).toBeVisible({
      timeout: 15_000,
    });

    await expect(page.getByTestId("close-moment-completed")).toHaveText("0");
  });
});
