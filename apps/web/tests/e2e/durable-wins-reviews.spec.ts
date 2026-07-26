import { expect, test, type Page } from "@playwright/test";
import { stubParseCaptureRoute } from "./helpers/mockParseCapture";

/**
 * #737-A slice 2 — wins and reviews survive the device, in a real browser.
 *
 * ## Why this spec exists when unit tests already cover the journal
 *
 * The claim under test is a claim about a BROWSER: "your win is saved on this
 * device". `fake-indexeddb` in jsdom cannot prove that — it proves the code
 * calls the API it was told to call. Only a real IndexedDB in a real browser
 * proves the write outlives a hard reload and is visible from a second tab,
 * which is exactly what the #750 probe showed `sessionStorage` fails to do.
 *
 * ## What this spec proves, and what it deliberately does not
 *
 * PROVEN HERE (device tier):
 *  1. confirming a win writes a journal entry before anything else,
 *  2. it survives a HARD RELOAD,
 *  3. a NEW PAGE in the same browser context reads it back — the discriminator
 *     between IndexedDB and the per-tab `sessionStorage` mirror,
 *  4. replaying twice with no account reachable leaves exactly one entry:
 *     never duplicated, and never silently dropped.
 *
 * NOT PROVEN HERE (account tier): that a replay delivers the row to Supabase
 * exactly once. This suite's dev server runs with no Supabase env at all
 * (`createSupabaseBrowserClient()` returns null), so there is no server to
 * deliver to. That half is proven at two other tiers, both in CI:
 *  - `src/lib/data/workflow.test.ts` asserts the exact upsert options,
 *  - `src/__tests__/phase4aRls.local.test.ts` upserts the same
 *    `client_write_id` TWICE against a real Postgres and asserts one row.
 *
 * ## The new-tab mechanic
 *
 * `context.newPage()`, never `browser.newContext()`. IndexedDB is partitioned
 * per browser context, so a new context would start with an empty journal and
 * this spec would pass or fail for reasons that have nothing to do with the
 * code. A new PAGE shares origin storage and gets a fresh `sessionStorage` —
 * the real "I opened another tab" case.
 *
 * Seeding matches `moments-wins-harvest.spec.ts`: `page.addInitScript` writes
 * a valid `WorkflowState` into sessionStorage before any app script runs.
 */

const STORAGE_KEY = "lifeos.phase2.workflow";
const JOURNAL_DB = "lifeos-pending-writes";
const JOURNAL_STORE = "pending";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const AREA_ID = "e2e-area-durable";
const TASK_ID = "e2e-task-durable";
const BLOCK_ID = "e2e-block-durable";
const WIN_TITLE = "Made the saved-on-this-device promise true";

test.beforeEach(async ({ page }) => {
  await stubParseCaptureRoute(page);
});

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
    tasks: [
      {
        id: TASK_ID,
        user_id: "e2e-user",
        area_id: AREA_ID,
        project_id: null,
        source_capture_item_id: null,
        title: "Shipped durable writes",
        description: null,
        status: "done",
        priority_score: null,
        priority_confidence: null,
        task_type: null,
        energy_type: null,
        estimated_minutes_low: null,
        estimated_minutes_high: null,
        due_at: null,
        definition_of_done: null,
        first_tiny_step: null,
        created_at: daysBefore(5),
        updated_at: nowIso,
      },
    ],
    timeBlockProposals: [],
    calendarBlocks: [
      {
        id: BLOCK_ID,
        user_id: "e2e-user",
        area_id: AREA_ID,
        proposal_id: null,
        task_id: TASK_ID,
        google_event_id: null,
        start_at: nowIso,
        end_at: nowIso,
        status: "completed",
        created_at: nowIso,
        updated_at: nowIso,
      },
    ],
    executionSessions: [],
    healthChecks: [],
    reviewLog: [],
    wipRefusal: null,
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
 * browser is.
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

async function openCloseMoment(page: Page) {
  await page.addInitScript(
    ({ key, value }) => {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    },
    { key: STORAGE_KEY, value: buildSeedState() },
  );
  await page.goto("/");
  await expect(page.getByTestId("today-moments")).toBeVisible();
  await page.keyboard.press("3");
  await expect(page.getByTestId("close-moment")).toBeVisible();
}

test.describe("#737-A durable wins and reviews", () => {
  test("a confirmed win survives a hard reload and is readable from a new tab", async ({
    page,
    context,
  }) => {
    await openCloseMoment(page);

    const titleInput = page.getByTestId(`close-moment-win-title-${TASK_ID}`);
    await expect(titleInput).toBeVisible();
    await titleInput.fill(WIN_TITLE);
    await page.getByTestId(`close-moment-win-confirm-${TASK_ID}`).click();

    // 1. The device has it, before anything else could have.
    await expect
      .poll(async () => (await readJournal(page)).length)
      .toBeGreaterThan(0);

    const afterConfirm = await readJournal(page);
    const wins = afterConfirm.filter((record) => record.entity === "win");
    expect(wins).toHaveLength(1);
    expect(wins[0]!.payload.title).toBe(WIN_TITLE);
    const clientWriteId = wins[0]!.client_write_id;
    expect(clientWriteId).toBeTruthy();

    // The copy the user is shown must match the state the browser is in. With
    // no account reachable this is the device-only wording, and it is now
    // true.
    await expect(page.getByTestId("today-moments-toast")).toContainText(
      "saved on this device",
    );

    // 2. A hard reload. `sessionStorage` survives this too, so on its own it
    // proves little -- it is the floor, not the discriminator.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("today-moments")).toBeVisible();

    const afterReload = await readJournal(page);
    expect(
      afterReload.filter((record) => record.client_write_id === clientWriteId),
    ).toHaveLength(1);

    // 3. THE DISCRIMINATOR. A new tab in the same context: fresh
    // `sessionStorage`, shared IndexedDB. Pre-#737-A the win existed in
    // neither, so this read is the whole proof that the promise is now true.
    const newTab = await context.newPage();
    await newTab.goto("/");
    await expect(newTab.getByTestId("today-moments")).toBeVisible();

    const sessionInNewTab = await newTab.evaluate(
      (key) => window.sessionStorage.getItem(key),
      STORAGE_KEY,
    );
    const fromNewTab = await readJournal(newTab);
    const winFromNewTab = fromNewTab.filter(
      (record) => record.client_write_id === clientWriteId,
    );

    expect(winFromNewTab).toHaveLength(1);
    expect(winFromNewTab[0]!.payload.title).toBe(WIN_TITLE);
    // Recorded rather than asserted-absent: whatever the new tab's own
    // sessionStorage holds, it does not hold this win.
    expect(sessionInNewTab ?? "").not.toContain(WIN_TITLE);

    await newTab.close();
  });

  test("replaying with no account reachable never duplicates and never drops the win", async ({
    page,
  }) => {
    await openCloseMoment(page);

    const titleInput = page.getByTestId(`close-moment-win-title-${TASK_ID}`);
    await expect(titleInput).toBeVisible();
    await titleInput.fill(WIN_TITLE);
    await page.getByTestId(`close-moment-win-confirm-${TASK_ID}`).click();

    await expect
      .poll(async () => (await readJournal(page)).length)
      .toBeGreaterThan(0);
    const baseline = await readJournal(page);
    const winSeq = baseline.find((record) => record.entity === "win")!.seq;

    // Each reload arms the mount replay again. With no Supabase client the
    // drain must be a no-op that keeps the entry -- the failure mode that
    // would lose the user's work here is a replay that "succeeds" against
    // nothing and deletes the record.
    for (const attempt of [1, 2]) {
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("today-moments")).toBeVisible();

      const afterReplay = await readJournal(page);
      const winsNow = afterReplay.filter((record) => record.entity === "win");
      expect(
        winsNow,
        `replay ${attempt} must keep exactly one win`,
      ).toHaveLength(1);
      // Same primary key: an idempotent retry keeps its queue position rather
      // than re-queueing behind later writes.
      expect(winsNow[0]!.seq).toBe(winSeq);
    }
  });

  test("closing the day journals the review and it survives a new tab", async ({
    page,
    context,
  }) => {
    await openCloseMoment(page);

    await page.getByTestId("close-moment-close-day").click();

    await expect
      .poll(
        async () =>
          (await readJournal(page)).filter(
            (record) => record.entity === "review",
          ).length,
      )
      .toBe(1);

    const [review] = (await readJournal(page)).filter(
      (record) => record.entity === "review",
    );
    expect(review!.payload.review_type).toBe("daily");
    const clientWriteId = review!.client_write_id;

    // The shell may only claim the day is closed when the account has it. With
    // no account it must say where the review actually is.
    await expect(page.getByTestId("today-moments-toast")).toContainText(
      "saved on this device",
    );

    const newTab = await context.newPage();
    await newTab.goto("/");
    await expect(newTab.getByTestId("today-moments")).toBeVisible();

    const fromNewTab = (await readJournal(newTab)).filter(
      (record) => record.client_write_id === clientWriteId,
    );
    expect(fromNewTab).toHaveLength(1);

    await newTab.close();
  });
});
