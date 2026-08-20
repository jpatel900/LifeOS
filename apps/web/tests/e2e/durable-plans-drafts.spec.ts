import { expect, test, type Page } from "@playwright/test";
import { stubParseCaptureRoute } from "./helpers/mockParseCapture";
import { pinMomentPreference } from "./helpers/momentPreference";

/**
 * #737 C1 slice S3 — placed time blocks and accepted triage drafts survive the
 * device, in a real browser.
 *
 * ## What the #750 inventory said about these two, and what this spec asserts
 *
 * Rows 9/10 (accepted proposal, task planned at hour) and rows 6/7 (draft
 * edit/accept) all carried loss trigger **T**: they live in the reducer's
 * `sessionStorage` mirror, which survives a reload and dies the moment the tab
 * closes. Only a real IndexedDB in a real browser can tell those two apart, so
 * the discriminator here — as in `durable-wins-reviews.spec.ts` — is a NEW PAGE
 * in the SAME context, never a new context (IndexedDB is partitioned per
 * context, so a new context would pass or fail for reasons unrelated to the
 * code).
 *
 * PROVEN HERE (device tier):
 *  1. placing a block journals a `plan_placement` before anything else,
 *  2. accepting an edited triage draft journals a `task_draft_accept`,
 *  3. both survive a HARD RELOAD,
 *  4. both are readable from a NEW TAB, where `sessionStorage` holds nothing,
 *  5. replaying twice with no account reachable leaves exactly ONE entry each,
 *     at its original `seq` — never duplicated, never silently dropped.
 *
 * NOT PROVEN HERE (account tier): that a replay delivers the row to Supabase
 * exactly once. This suite's dev server runs with no Supabase env at all
 * (`createSupabaseBrowserClient()` returns null), so there is no server to
 * deliver to. That half is proven at two other tiers, both in CI:
 *  - `src/lib/data/workflow.test.ts` asserts the exact RPC/upsert arguments,
 *  - `src/__tests__/phase4aRls.local.test.ts` sends the same `client_write_id`
 *    TWICE against a real Postgres and asserts one row.
 *
 * ## Why the two halves use two different surfaces (RE-ANCHORED, C2-S6 #687)
 *
 * Both halves are on the moments home now. `PlanSheet.tsx` (`?sheet=plan`)
 * carries the hour rail directly — the same `planTaskAtHour`/`unplanTask`
 * writes the legacy `/calendar` route used, per PlanSheet's own invariant
 * table (C2-S2, #804/#809). `/calendar` itself is a flag-gated redirect
 * shim to `?sheet=plan` now (C2-S6): the plan half used to drive `/calendar`
 * directly because that was the only place the rail existed; it drives
 * `?sheet=plan` directly now for the same reason, on the current surface.
 * Draft accept IS on the moments home too, via the triage sheet's "Do
 * today" — unchanged.
 *
 * ## Clock pinning
 *
 * Both halves now pin the moment preference (`pinMomentPreference`) rather
 * than trusting `heuristicMoment`'s read of the browser's local hour — the
 * failure that took `session-truth.spec.ts` red on merged main while green
 * everywhere else. Before C2-S6, the plan half needed no pin because
 * `/calendar` rendered `PlanView`, a fixed 8a-6p hour rail unaffected by
 * moment; `PlanSheet` is a sheet layered atop whichever moment is active,
 * so it now needs the same pin the triage half always did.
 */

const STORAGE_KEY = "lifeos.phase2.workflow";
const JOURNAL_DB = "lifeos-pending-writes";
const JOURNAL_STORE = "pending";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const AREA_ID = "e2e-area-s3";
const PLAN_TASK_ID = "e2e-task-to-place";
const DRAFT_ID = "e2e-draft-to-accept";
const CAPTURE_ID = "e2e-capture-s3";
const PLAN_HOUR = 10;

const PLAN_TASK_TITLE = "Place this block and keep it";
const DRAFT_TITLE = "Accept this draft and keep it";

test.beforeEach(async ({ page }) => {
  await stubParseCaptureRoute(page);
});

function baseState() {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const daysBefore = (days: number) =>
    new Date(nowMs - days * MS_PER_DAY).toISOString();

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
    tasks: [],
    timeBlockProposals: [],
    calendarBlocks: [],
    executionSessions: [],
    healthChecks: [],
    reviewLog: [],
    wipRefusal: null,
    _nowIso: nowIso,
    _daysBefore: daysBefore,
  };
}

/**
 * One ACTIVE task carrying a first move, and nothing else.
 *
 * Both details are load-bearing in `PlanView`: `vm.today.length === 1` makes it
 * the auto-selected `onlyReadyTaskId`, so the hour row is clickable with no
 * separate select step; and a task with a blank `first_tiny_step` sets
 * `missingLaunchStep`, which makes `onPlan` a no-op and would make this spec
 * fail for the wrong reason.
 */
function buildPlanSeedState() {
  const base = baseState();
  const { _nowIso: nowIso, _daysBefore: daysBefore, ...state } = base;

  return {
    ...state,
    tasks: [
      {
        id: PLAN_TASK_ID,
        user_id: "e2e-user",
        area_id: AREA_ID,
        project_id: null,
        source_capture_item_id: null,
        title: PLAN_TASK_TITLE,
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
      },
    ],
  };
}

/**
 * One PENDING draft and NO active tasks.
 *
 * The empty `tasks` array is deliberate: "Do today" runs the WIP cap, and a
 * seed that already filled the slots would return a refusal instead of an
 * accept, so the spec would assert against a write that never happened.
 */
function buildDraftSeedState() {
  const base = baseState();
  const { _nowIso: nowIso, _daysBefore: daysBefore, ...state } = base;

  return {
    ...state,
    captureItems: [
      {
        id: CAPTURE_ID,
        user_id: "e2e-user",
        area_id: AREA_ID,
        raw_text: DRAFT_TITLE,
        return_hook: null,
        client_capture_id: null,
        capture_mode: "text",
        inferred_area_confidence: 0.9,
        status: "triage_required",
        created_at: daysBefore(1),
      },
    ],
    taskDrafts: [
      {
        id: DRAFT_ID,
        user_id: "e2e-user",
        capture_item_id: CAPTURE_ID,
        area_id: AREA_ID,
        title: DRAFT_TITLE,
        description: null,
        confidence: 0.8,
        estimated_minutes_low: 20,
        estimated_minutes_high: 40,
        first_tiny_step: "Write the first line",
        breakdown: null,
        person_mentions: [],
        is_commitment: false,
        status: "pending",
        created_at: nowIso,
      },
    ],
  };
}

interface JournalRecord {
  seq: number;
  client_write_id: string;
  entity: string;
  payload: Record<string, unknown>;
}

/**
 * Read the journal straight out of IndexedDB, without going through app code.
 * Asking the app whether it saved something is not evidence; asking the
 * browser is. (Verbatim in intent from `durable-wins-reviews.spec.ts` — the
 * same question, asked of the same store.)
 */
async function readJournal(page: Page): Promise<JournalRecord[]> {
  return page.evaluate(
    ({ dbName, storeName }) =>
      new Promise<JournalRecord[]>((resolve, reject) => {
        // Open with no version so this never triggers an upgrade of its own —
        // it observes whatever the app created.
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

async function seed(page: Page, value: unknown) {
  await page.addInitScript(
    ({ key, state }) => {
      window.sessionStorage.setItem(key, JSON.stringify(state));
    },
    { key: STORAGE_KEY, state: value },
  );
}

async function openPlanRail(page: Page) {
  // C2-S6 (#687): the hour rail now lives on the Plan sheet (`?sheet=plan`,
  // PlanSheet.tsx), not the retired `/calendar` route — same
  // `planTaskAtHour`/`unplanTask` writes, per PlanSheet's own invariant
  // table. Pinned to Start like every other sheet-surface e2e helper in
  // this repo (pinnedSurfaces.ts, openTriageSheet below): the sheet renders
  // atop whatever moment is active, and pinning removes that as a variable.
  await pinMomentPreference(page, "start");
  await seed(page, buildPlanSeedState());
  await page.goto("/?sheet=plan");
  await expect(page.getByTestId(`plan-sheet-hour-${PLAN_HOUR}`)).toBeVisible({
    timeout: 15_000,
  });
}

async function openTriageSheet(page: Page) {
  await pinMomentPreference(page, "start");
  await seed(page, buildDraftSeedState());
  await page.goto("/");
  await expect(page.getByTestId("today-moments")).toBeVisible();
  await page.keyboard.press("1");
  await expect(page.getByTestId("start-moment")).toBeVisible();
  await page.getByTestId("pipeline-overview-stage-triage").click();
  await expect(page.getByTestId(`triage-sheet-item-${DRAFT_ID}`)).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("#737 C1 S3 — durable plans and triage drafts", () => {
  test("placing a block journals it, and it survives a reload and a new tab", async ({
    page,
    context,
  }) => {
    await openPlanRail(page);

    await page.getByTestId(`plan-sheet-hour-${PLAN_HOUR}`).click();

    // 1. The device has it, before anything else could have.
    await expect
      .poll(
        async () =>
          (await readJournal(page)).filter(
            (record) => record.entity === "plan_placement",
          ).length,
        {
          message:
            "placing a block must journal a plan_placement to IndexedDB first",
        },
      )
      .toBe(1);

    const [placement] = (await readJournal(page)).filter(
      (record) => record.entity === "plan_placement",
    );
    expect(placement!.payload.workflow_task_id).toBe(PLAN_TASK_ID);
    // Clock-pinned at the moment the user acted: an absolute instant, not a
    // day string or an hour to be re-derived at replay time.
    expect(String(placement!.payload.proposed_start)).toMatch(
      /^\d{4}-\d{2}-\d{2}T/,
    );
    const clientWriteId = placement!.client_write_id;
    expect(clientWriteId).toBeTruthy();

    // 2. A hard reload. `sessionStorage` survives this too, so on its own it
    // proves little — it is the floor, not the discriminator.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.getByTestId(`plan-sheet-hour-${PLAN_HOUR}`),
    ).toBeVisible();

    expect(
      (await readJournal(page)).filter(
        (record) => record.client_write_id === clientWriteId,
      ),
    ).toHaveLength(1);

    // 3. THE DISCRIMINATOR. A new tab in the same context: fresh
    // `sessionStorage`, shared IndexedDB. Pre-S3 the placement existed only in
    // the first tab's sessionStorage, so this read is the whole proof.
    const newTab = await context.newPage();
    await newTab.goto("/?sheet=plan");
    await expect(
      newTab.getByTestId(`plan-sheet-hour-${PLAN_HOUR}`),
    ).toBeVisible();

    const fromNewTab = (await readJournal(newTab)).filter(
      (record) => record.client_write_id === clientWriteId,
    );
    expect(fromNewTab).toHaveLength(1);
    expect(fromNewTab[0]!.payload.workflow_task_id).toBe(PLAN_TASK_ID);

    await newTab.close();
  });

  test("replaying with no account reachable never duplicates and never drops the placement", async ({
    page,
  }) => {
    await openPlanRail(page);
    await page.getByTestId(`plan-sheet-hour-${PLAN_HOUR}`).click();

    await expect
      .poll(
        async () =>
          (await readJournal(page)).filter(
            (record) => record.entity === "plan_placement",
          ).length,
      )
      .toBe(1);

    const placementSeq = (await readJournal(page)).find(
      (record) => record.entity === "plan_placement",
    )!.seq;

    // Each reload arms the mount replay again. With no Supabase client the
    // drain must be a no-op that KEEPS the entry — the failure mode that would
    // lose the user's work here is a replay that "succeeds" against nothing
    // and deletes the record.
    for (const attempt of [1, 2]) {
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(
        page.getByTestId(`plan-sheet-hour-${PLAN_HOUR}`),
      ).toBeVisible();

      const now = (await readJournal(page)).filter(
        (record) => record.entity === "plan_placement",
      );
      expect(
        now,
        `replay ${attempt} must keep exactly one placement`,
      ).toHaveLength(1);
      // Same primary key: an idempotent retry keeps its queue position rather
      // than re-queueing behind later writes.
      expect(now[0]!.seq).toBe(placementSeq);
    }
  });

  test("accepting a triage draft journals it, and it survives a reload and a new tab", async ({
    page,
    context,
  }) => {
    await openTriageSheet(page);

    await page.getByTestId(`triage-sheet-today-${DRAFT_ID}`).click();

    await expect
      .poll(
        async () =>
          (await readJournal(page)).filter(
            (record) => record.entity === "task_draft_accept",
          ).length,
        {
          message:
            "accepting a draft must journal a task_draft_accept to IndexedDB first",
        },
      )
      .toBe(1);

    const [accept] = (await readJournal(page)).filter(
      (record) => record.entity === "task_draft_accept",
    );
    // The payload carries the DRAFT AS IT STOOD when the user accepted it —
    // that is what makes an edit-then-accept durable, since the edit itself
    // has no server destination of its own.
    expect(accept!.payload.title).toBe(DRAFT_TITLE);
    expect(accept!.payload.task_status).toBe("active");
    const clientWriteId = accept!.client_write_id;
    expect(clientWriteId).toBeTruthy();

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("today-moments")).toBeVisible();

    expect(
      (await readJournal(page)).filter(
        (record) => record.client_write_id === clientWriteId,
      ),
    ).toHaveLength(1);

    const newTab = await context.newPage();
    await newTab.goto("/");
    await expect(newTab.getByTestId("today-moments")).toBeVisible();

    const fromNewTab = (await readJournal(newTab)).filter(
      (record) => record.client_write_id === clientWriteId,
    );
    expect(fromNewTab).toHaveLength(1);
    expect(fromNewTab[0]!.payload.title).toBe(DRAFT_TITLE);

    await newTab.close();
  });

  test("replaying with no account reachable never duplicates and never drops the accepted draft", async ({
    page,
  }) => {
    await openTriageSheet(page);
    await page.getByTestId(`triage-sheet-today-${DRAFT_ID}`).click();

    await expect
      .poll(
        async () =>
          (await readJournal(page)).filter(
            (record) => record.entity === "task_draft_accept",
          ).length,
      )
      .toBe(1);

    const acceptSeq = (await readJournal(page)).find(
      (record) => record.entity === "task_draft_accept",
    )!.seq;

    for (const attempt of [1, 2]) {
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("today-moments")).toBeVisible();

      const now = (await readJournal(page)).filter(
        (record) => record.entity === "task_draft_accept",
      );
      expect(
        now,
        `replay ${attempt} must keep exactly one accepted draft`,
      ).toHaveLength(1);
      expect(now[0]!.seq).toBe(acceptSeq);
    }
  });
});
