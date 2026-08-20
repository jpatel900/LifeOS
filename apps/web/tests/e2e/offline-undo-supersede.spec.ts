import { expect, test, type Page } from "@playwright/test";
import { pinMomentPreference } from "./helpers/momentPreference";

/**
 * #737 C1 slice S5 — undoing an unsent write must not be undone by the sync.
 *
 * ## The failure this pins, in the words of the PR that disclosed it
 *
 * PR #778 shipped `plan_placement` to the journal and recorded, in its own
 * truth map, the failure mode it CREATED by doing so:
 *
 *   (1) signed out or offline, place a task at 10am -> a `plan_placement` is
 *       journalled; (2) still offline, tap the hour row again -> `unplanTask`
 *       runs, the reducer drops the block, and `persistUnplannedBlock` takes
 *       its `markLocalOnly` early return because there is no persisted block
 *       id -- the undo is NOT journalled; (3) sign in -> the drain runs
 *       `place_time_block` and creates a `calendar_blocks` row for a block the
 *       user explicitly deleted.
 *
 * Before #778 this could not happen, because the placement was not durable
 * either. The user's LAST instruction was "take this off my day", and the sync
 * was about to overrule it.
 *
 * ## What this spec asserts, and why the journal is the assertion target
 *
 * The e2e dev server runs with NO Supabase env, so step (3) has no account to
 * sign in to and the resurrection itself cannot be staged in a browser. What
 * CAN be staged in a browser -- and is the whole cause -- is the journal
 * contents after step (2): if a `plan_placement` is still queued once the user
 * has undone it, the resurrection is guaranteed the moment an account appears.
 * So the assertion is: after the undo, NOTHING is queued that would recreate
 * the block, and the record count does not merely shrink by accident -- it is
 * still zero after reloads that re-arm the drain, and from a second tab.
 *
 * The account tier of the same fix (an undo of an ALREADY-DELIVERED placement
 * really does reach `unplan_calendar_block`) is proven in
 * `src/lib/durability/durableWrites.test.ts`, which drives the handler map
 * directly against stub server ops.
 *
 * ## Why this file drives `?sheet=plan` (RE-ANCHORED, C2-S6 #687)
 *
 * Same reason as `durable-plans-drafts.spec.ts`: the hour rail, and the tap
 * that unplans a placed block, live on `PlanSheet.tsx` (`?sheet=plan`) now —
 * the same `unplanTask` write the legacy `/calendar` route (`PlanView`) used,
 * per PlanSheet's own invariant table (C2-S2, #804/#809). `/calendar` itself
 * is a flag-gated redirect shim to `?sheet=plan` now (C2-S6).
 *
 * Clock pinning: `PlanSheet` is a sheet layered atop whichever moment is
 * active, unlike the legacy `PlanView` route it replaces (which rendered one
 * fixed 8a-6p rail regardless of moment) — so this spec now pins the moment
 * preference (`pinMomentPreference`, same helper `durable-plans-drafts.spec.ts`
 * uses) rather than depending on the wall clock.
 */

const STORAGE_KEY = "lifeos.phase2.workflow";
const JOURNAL_DB = "lifeos-pending-writes";
const JOURNAL_STORE = "pending";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const AREA_ID = "e2e-area-s5";
const PLAN_TASK_ID = "e2e-task-place-then-undo";
const KEEP_TASK_ID = "e2e-task-place-and-keep";
const PLAN_HOUR = 10;
const KEEP_HOUR = 12;
const PLAN_TASK_TITLE = "Place this block then take it back";
const KEEP_TASK_TITLE = "Place this block and leave it alone";

interface JournalRecord {
  seq: number;
  client_write_id: string;
  entity: string;
  payload: Record<string, unknown>;
}

/**
 * Read the journal straight out of IndexedDB, without going through app code.
 * Asking the app whether it cancelled something is not evidence; asking the
 * browser is. (Same helper, same reasoning, as `durable-plans-drafts.spec.ts`.)
 */
async function readJournal(page: Page): Promise<JournalRecord[]> {
  return page.evaluate(
    ({ dbName, storeName }) =>
      new Promise<JournalRecord[]>((resolve, reject) => {
        const request = indexedDB.open(dbName);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(storeName)) {
            db.close();
            resolve([]);
            return;
          }
          const all = db
            .transaction(storeName, "readonly")
            .objectStore(storeName)
            .getAll();
          all.onerror = () => {
            db.close();
            reject(all.error);
          };
          all.onsuccess = () => {
            db.close();
            resolve(all.result as JournalRecord[]);
          };
        };
      }),
    { dbName: JOURNAL_DB, storeName: JOURNAL_STORE },
  );
}

/**
 * ACTIVE tasks carrying a first move, and nothing else.
 *
 * The non-blank `first_tiny_step` is load-bearing: a task without one sets
 * `missingLaunchStep`, which makes `onPlan` a no-op and would fail this spec
 * for the wrong reason.
 *
 * `taskCount` exists because the two tests need different `vm.today` sizes.
 * With ONE ready task PlanView auto-selects it (`onlyReadyTaskId`) and the
 * hour row is clickable straight away. With TWO it renders "Select a task
 * first" and each placement needs an explicit click on the task, which is what
 * the control test wants: two placements of two different tasks, one undone
 * and one not. (Placing the same task twice is not an option — placement moves
 * it to `scheduled`, so it leaves `vm.today` entirely.)
 */
function buildSeedState(taskCount: 1 | 2 = 1) {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const daysBefore = (days: number) =>
    new Date(nowMs - days * MS_PER_DAY).toISOString();

  const task = (id: string, title: string) => ({
    id,
    user_id: "e2e-user",
    area_id: AREA_ID,
    project_id: null,
    source_capture_item_id: null,
    title,
    description: null,
    status: "active",
    priority_score: null,
    priority_confidence: null,
    task_type: null,
    energy_type: null,
    estimated_minutes_low: 30,
    estimated_minutes_high: 60,
    due_at: null,
    definition_of_done: null,
    first_tiny_step: "Open the file",
    created_at: daysBefore(2),
    updated_at: nowIso,
  });

  return {
    areas: [
      {
        id: AREA_ID,
        user_id: "e2e-user",
        name: "Work",
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
    tasks:
      taskCount === 1
        ? [task(PLAN_TASK_ID, PLAN_TASK_TITLE)]
        : [
            task(PLAN_TASK_ID, PLAN_TASK_TITLE),
            task(KEEP_TASK_ID, KEEP_TASK_TITLE),
          ],
    timeBlockProposals: [],
    calendarBlocks: [],
    executionSessions: [],
    healthChecks: [],
    reviewLog: [],
    wipRefusal: null,
  };
}

async function openPlanRail(page: Page, taskCount: 1 | 2 = 1) {
  await pinMomentPreference(page, "start");
  await page.addInitScript(
    ({ key, state }) => {
      window.sessionStorage.setItem(key, JSON.stringify(state));
    },
    { key: STORAGE_KEY, state: buildSeedState(taskCount) },
  );
  await page.goto("/?sheet=plan");
  await expect(page.getByTestId(`plan-sheet-hour-${PLAN_HOUR}`)).toBeVisible({
    timeout: 15_000,
  });
}

function placements(records: JournalRecord[]) {
  return records.filter((record) => record.entity === "plan_placement");
}

test.describe("#737 C1 S5 — an undo cancels the write it undoes", () => {
  test("placing then unplanning while the account is unreachable leaves nothing queued to resurrect the block", async ({
    page,
    context,
  }) => {
    await openPlanRail(page);

    // Step 1 of the disclosed sequence: place the block. This part already
    // worked before S5 — it is the setup, not the assertion.
    await page.getByTestId(`plan-sheet-hour-${PLAN_HOUR}`).click();

    await expect
      .poll(async () => placements(await readJournal(page)).length, {
        message: "placing a block must journal a plan_placement first (#778)",
      })
      .toBe(1);

    const placement = placements(await readJournal(page))[0]!;
    expect(placement.payload.workflow_task_id).toBe(PLAN_TASK_ID);

    // The row now reads "Tap to take it off" (PlanSheet's copy for the
    // `unplan` row-action kind, planRail.ts:139 — the legacy PlanView's
    // wording was "Tap to unplan"), which is the affordance step 2 uses.
    await expect(
      page.getByTestId(`plan-sheet-hour-${PLAN_HOUR}`),
    ).toContainText("Tap to take it off");

    // Step 2: the user takes it back, still with no account reachable.
    await page.getByTestId(`plan-sheet-hour-${PLAN_HOUR}`).click();
    await expect(
      page.getByTestId(`plan-sheet-hour-${PLAN_HOUR}`),
    ).not.toContainText("Tap to take it off");

    // THE ASSERTION. The queued placement must be gone — cancelled by the
    // user's own compensating action, not left waiting to be delivered. A
    // queued `plan_placement` here IS the resurrection bug: it needs only an
    // account to appear.
    await expect
      .poll(async () => placements(await readJournal(page)).length, {
        message:
          "unplanning must cancel the queued placement, not leave it to be delivered later (#778 AGENT-TODO)",
      })
      .toBe(0);

    // And the compensating entry must not linger either: it had nothing to
    // send, because the write it compensates never reached the account.
    await expect
      .poll(
        async () =>
          (await readJournal(page)).filter(
            (record) => record.entity === "plan_unplacement",
          ).length,
      )
      .toBe(0);

    // Step 3, as far as a Supabase-less build can take it: every reload
    // re-arms the mount drain. A cancellation that only held until the next
    // replay would show up here.
    for (const attempt of [1, 2]) {
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(
        page.getByTestId(`plan-sheet-hour-${PLAN_HOUR}`),
      ).toBeVisible();
      expect(
        placements(await readJournal(page)),
        `replay ${attempt} must not resurrect the cancelled placement`,
      ).toHaveLength(0);
    }

    // And from a second tab, which shares IndexedDB and has its own empty
    // sessionStorage — the tier where the placement was durable in the first
    // place.
    const newTab = await context.newPage();
    await newTab.goto("/?sheet=plan");
    await expect(
      newTab.getByTestId(`plan-sheet-hour-${PLAN_HOUR}`),
    ).toBeVisible();
    expect(placements(await readJournal(newTab))).toHaveLength(0);
    await newTab.close();
  });

  test("undoing one placement leaves an unrelated queued placement untouched", async ({
    page,
  }) => {
    await openPlanRail(page, 2);

    // The control. A cancellation that drained the whole journal — rather than
    // only the one write it compensates — would take this second placement
    // with it, breaking never-discard in the other direction. This test is the
    // reason the fix cannot be "clear the journal on undo".
    await page.getByRole("button", { name: PLAN_TASK_TITLE }).click();
    await page.getByTestId(`plan-sheet-hour-${PLAN_HOUR}`).click();
    await expect
      .poll(async () => placements(await readJournal(page)).length)
      .toBe(1);

    // No task-selector tap needed here: PLAN_TASK was the only OTHER ready
    // task, and PlanSheet auto-selects the sole remaining ready task
    // (`onlyReadyTaskId`, PlanSheet.tsx:203) once it placed — the same
    // auto-select `durable-plans-drafts.spec.ts` relies on for a single
    // seeded task. Every empty hour row's own aria-label now names
    // KEEP_TASK_TITLE too (it's the row-action label, not a selector), which
    // is why clicking a `getByRole("button", { name: KEEP_TASK_TITLE })`
    // here would match every empty row ambiguously rather than one control.
    await page.getByTestId(`plan-sheet-hour-${KEEP_HOUR}`).click();
    await expect
      .poll(async () => placements(await readJournal(page)).length)
      .toBe(2);

    // Undo only the first.
    await page.getByTestId(`plan-sheet-hour-${PLAN_HOUR}`).click();

    await expect
      .poll(async () => placements(await readJournal(page)).length, {
        message:
          "cancelling one placement must not drain the other queued writes",
      })
      .toBe(1);

    // The one left is the one the user did NOT undo — identified by its task,
    // not merely by the count.
    expect(
      placements(await readJournal(page))[0]!.payload.workflow_task_id,
    ).toBe(KEEP_TASK_ID);
    await expect(
      page.getByTestId(`plan-sheet-hour-${KEEP_HOUR}`),
    ).toContainText("Tap to take it off");
  });
});
