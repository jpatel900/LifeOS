import { expect, test, type Page } from "@playwright/test";
import { stubParseCaptureRoute } from "./helpers/mockParseCapture";
import { pinMomentPreference } from "./helpers/momentPreference";

/**
 * #737 — Final UX Loop C1, Target Card 1: "a focus session ALWAYS produces
 * exactly one truthful record: user-chosen outcome only, never a silent
 * 'partial', never nothing."
 *
 * ## What each tier proves here
 *
 * This suite's dev server runs with NO Supabase env, exactly like
 * `durable-wins-reviews.spec.ts` — `createSupabaseBrowserClient()` returns
 * null, so there is no account to write to. That is deliberate, and it splits
 * the evidence the same way #737-A slice 2 split it:
 *
 *  - DEVICE tier (this file, real browser, real IndexedDB): a started session
 *    journals NOTHING; ending it journals exactly ONE write carrying the
 *    outcome the user picked; that write survives a reload and a second tab.
 *  - ACCOUNT tier (`src/__tests__/phase4aRls.local.test.ts`, real Postgres):
 *    `record_execution_session` inserts one row and a replay of the same
 *    `client_write_id` inserts no second row.
 *
 * Neither tier alone is the claim. Together they are.
 *
 * ## The two audit P0s this pins
 *
 * P0#1 (`docs/design/ux-audit-2026-07-26-fable.md`): switching moments left
 * the user with no way back to a running session, and an `execution_sessions`
 * row carrying `outcome:"partial"` existed that they never chose. NOTE: the
 * audit attributed the row to the navigation. It was not — `start_execution_
 * session` inserted it at START (`supabase/migrations/20260630180000...`,
 * literal `'partial'`), and the Execute badge moved 1→0 at start too because
 * `pipelineCounts` counts blocks whose status is `scheduled` and starting a
 * session flipped the block to `running`. The harm the audit described is
 * real; the mechanism is the start write, not the navigation.
 *
 * P0#2: `Start now` on a task with no block ran a whole session and kept
 * nothing, because `startExecutionSession` matched only
 * `status === "scheduled"` and silently returned the state unchanged.
 *
 * ## Clock pinning
 *
 * Blocks are seeded relative to `Date.now()` at seed time so the "now block"
 * classification (`momentsViewModel/shared.ts`: `startMs <= nowMs < endMs`)
 * holds regardless of when the suite runs. No wall-clock literals appear.
 *
 * That covers WHICH BLOCK is current. It did not cover WHICH MOMENT the home
 * opens on — `heuristicMoment` reads the browser's local hour, so `/` renders
 * Start, Flow or Close depending on the runner's clock and timezone. Every
 * spec here begins on a Start-moment card, so `openHome` now pins Start
 * explicitly (`helpers/momentPreference.ts`). Reproduce the original failure
 * with `PLAYWRIGHT_TZ=Pacific/Auckland` (see `playwright.config.ts`).
 */

const STORAGE_KEY = "lifeos.phase2.workflow";
const JOURNAL_DB = "lifeos-pending-writes";
const JOURNAL_STORE = "pending";
const RUNNING_SESSION_KEY = "lifeos.running-session";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const AREA_ID = "e2e-area-session-truth";
const SCHEDULED_TASK_ID = "e2e-task-scheduled";
const BLOCK_ID = "e2e-block-scheduled";
const BLOCKLESS_TASK_ID = "e2e-task-blockless";

test.beforeEach(async ({ page }) => {
  await stubParseCaptureRoute(page);
});

// The dev server compiles `/` on its first request, and that compile has
// exceeded this suite's 60s per-test timeout on a cold machine — the first
// spec then fails for a reason that has nothing to do with what it asserts.
// Pay the compile once, outside any test's budget.
test.beforeAll(async ({ browser }) => {
  const warmup = await browser.newPage();
  await warmup.goto("/", { timeout: 180_000 });
  await warmup.close();
});

interface SeedOptions {
  /** Include a scheduled task with a block that is running right now. */
  scheduled: boolean;
  /** Include an unscheduled `active` task (the blockless P0#2 case). */
  blockless: boolean;
}

function buildSeedState({ scheduled, blockless }: SeedOptions) {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const daysBefore = (days: number) =>
    new Date(nowMs - days * MS_PER_DAY).toISOString();

  function task(
    id: string,
    title: string,
    status: string,
    createdDays: number,
  ) {
    return {
      id,
      user_id: "e2e-user",
      area_id: AREA_ID,
      project_id: null,
      source_capture_item_id: null,
      title,
      description: null,
      status,
      priority_score: null,
      priority_confidence: null,
      task_type: null,
      energy_type: null,
      estimated_minutes_low: 25,
      estimated_minutes_high: 60,
      due_at: null,
      definition_of_done: null,
      first_tiny_step: null,
      created_at: daysBefore(createdDays),
      updated_at: nowIso,
    };
  }

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
      ...(scheduled
        ? [
            task(
              SCHEDULED_TASK_ID,
              "Draft the quarterly filing",
              "scheduled",
              5,
            ),
          ]
        : []),
      ...(blockless
        ? [task(BLOCKLESS_TASK_ID, "Call the accountant", "active", 9)]
        : []),
    ],
    timeBlockProposals: [],
    calendarBlocks: scheduled
      ? [
          {
            id: BLOCK_ID,
            user_id: "e2e-user",
            area_id: AREA_ID,
            proposal_id: null,
            task_id: SCHEDULED_TASK_ID,
            google_event_id: null,
            // Started five minutes ago, ends in 55: unambiguously the "now"
            // block for `deriveFirstMove`, with no boundary race.
            start_at: new Date(nowMs - 5 * 60 * 1000).toISOString(),
            end_at: new Date(nowMs + 55 * 60 * 1000).toISOString(),
            status: "scheduled",
            created_at: nowIso,
            updated_at: nowIso,
          },
        ]
      : [],
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
 * Read the journal straight out of IndexedDB. Asking the app whether it saved
 * something is not evidence; asking the browser is. (Same helper contract as
 * `durable-wins-reviews.spec.ts`.)
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

async function sessionWrites(page: Page) {
  const journal = await readJournal(page);
  return journal.filter((record) => record.entity === "execution_session");
}

async function openHome(page: Page, options: SeedOptions) {
  // The blocks above are seeded relative to `Date.now()`, so WHICH block is
  // "now" is already clock-safe. WHICH MOMENT the home opens on was not:
  // `TodayMoments`' `heuristicMoment` reads the browser's local hour, and
  // every spec below starts from `first-move-start`, a Start-moment card.
  // On a UTC CI runner that card is absent from 11:00Z onward (>= 17:00Z ->
  // Close; 11:00-17:00Z -> Flow, because these specs seed a current block),
  // and all five specs die on a 60s `first-move-start` timeout — which is
  // exactly what happened on merged main. Pin Start; the moment memory the
  // last spec asserts still works, because the seed only fills an empty slot.
  await pinMomentPreference(page, "start");
  await page.addInitScript(
    ({ key, value }) => {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    },
    { key: STORAGE_KEY, value: buildSeedState(options) },
  );
  await page.goto("/");
  await expect(page.getByTestId("today-moments")).toBeVisible();
}

/** End the running session through the sheet with a deliberate outcome. */
async function endSessionAs(
  page: Page,
  outcome: "completed" | "partial" | "skipped",
  minutes: number,
  note: string,
) {
  await page.getByTestId("current-block-hero-done").click();
  await expect(page.getByTestId("end-session-sheet")).toBeVisible();
  // The outcome control is a toggle button (`aria-pressed`), not a radio —
  // `.check()` would reject it.
  await page.getByTestId(`end-session-outcome-${outcome}`).click();
  await page.getByTestId("end-session-minutes").fill(String(minutes));
  await page.getByTestId("end-session-note").fill(note);
  await page.getByTestId("end-session-save").click();
}

test.describe("#737 C1 card 1 — session truth", () => {
  test("switching moments leaves the session running, and writes no outcome", async ({
    page,
  }) => {
    await openHome(page, { scheduled: true, blockless: false });

    await page.getByTestId("first-move-start").click();
    await expect(page.getByTestId("current-block-hero")).toBeVisible();
    const startedClock = await page
      .getByTestId("current-block-hero-time")
      .innerText();

    // Nothing has been recorded yet: the user has not chosen anything.
    expect(await sessionWrites(page)).toHaveLength(0);

    // Leave for another moment via the masthead — the exact audit
    // reproduction ("click `Start` in the masthead").
    await page.getByTestId("moment-switcher-start").click();
    await expect(page.getByTestId("start-moment")).toBeVisible();

    // Card 6: leaving shows a persistent, calm way back.
    const returnAffordance = page.getByTestId("session-running-return");
    await expect(returnAffordance).toBeVisible();

    // Still no record, because navigation is not an outcome.
    expect(await sessionWrites(page)).toHaveLength(0);

    // And the way back actually works: the same session, still running.
    await page.getByTestId("session-running-return-action").click();
    await expect(page.getByTestId("current-block-hero")).toBeVisible();
    expect(await page.getByTestId("current-block-hero-time").innerText()).toBe(
      startedClock,
    );
    expect(await sessionWrites(page)).toHaveLength(0);
  });

  test("the end sheet's chosen outcome is the only outcome recorded", async ({
    page,
  }) => {
    await openHome(page, { scheduled: true, blockless: false });

    await page.getByTestId("first-move-start").click();
    await expect(page.getByTestId("current-block-hero")).toBeVisible();

    await endSessionAs(page, "partial", 18, "Got through the first section");

    await expect.poll(async () => (await sessionWrites(page)).length).toBe(1);
    const [write] = await sessionWrites(page);
    expect(write!.payload.outcome).toBe("partial");
    expect(write!.payload.actual_minutes).toBe(18);
    expect(write!.payload.notes).toBe("Got through the first section");

    // The loudest claim on screen must match what the browser actually holds.
    await expect(page.getByTestId("today-moments-toast")).toContainText(
      "saved on this device",
    );
  });

  test("a session started on an unscheduled task records a truthful result", async ({
    page,
  }) => {
    await openHome(page, { scheduled: false, blockless: true });

    await page.getByTestId("first-move-start").click();
    await expect(page.getByTestId("current-block-hero")).toBeVisible();

    await endSessionAs(
      page,
      "completed",
      35,
      "Left a voicemail, they called back",
    );

    await expect.poll(async () => (await sessionWrites(page)).length).toBe(1);
    const [write] = await sessionWrites(page);
    expect(write!.payload.outcome).toBe("completed");
    expect(write!.payload.actual_minutes).toBe(35);
    expect(write!.payload.workflow_task_id).toBe(BLOCKLESS_TASK_ID);

    // Card 1's "never nothing": the local record exists too, so Close cannot
    // read 0 completed for work that was completed.
    const stored = await page.evaluate(
      (key) => window.sessionStorage.getItem(key),
      STORAGE_KEY,
    );
    const state = JSON.parse(stored ?? "{}") as {
      executionSessions?: { outcome: string }[];
    };
    expect(state.executionSessions ?? []).toHaveLength(1);
    expect(state.executionSessions![0]!.outcome).toBe("completed");
  });

  test("a saved outcome survives the tab that made it, and replays exactly once", async ({
    page,
    context,
  }) => {
    await openHome(page, { scheduled: true, blockless: false });

    await page.getByTestId("first-move-start").click();
    await expect(page.getByTestId("current-block-hero")).toBeVisible();

    // Close the tab mid-session? No: the running session is device state and
    // carries no outcome, so there would be nothing to prove. The write worth
    // protecting is the one the user just chose — journal it, then leave.
    await endSessionAs(page, "skipped", 4, "Wrong time of day for this");
    await expect.poll(async () => (await sessionWrites(page)).length).toBe(1);
    const clientWriteId = (await sessionWrites(page))[0]!.client_write_id;

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("today-moments")).toBeVisible();
    expect(
      (await sessionWrites(page)).filter(
        (record) => record.client_write_id === clientWriteId,
      ),
    ).toHaveLength(1);

    // THE DISCRIMINATOR: a new tab has fresh sessionStorage and shared
    // IndexedDB. Anything held only in the per-tab mirror is gone here.
    const newTab = await context.newPage();
    await newTab.goto("/");
    await expect(newTab.getByTestId("today-moments")).toBeVisible();

    const fromNewTab = (await sessionWrites(newTab)).filter(
      (record) => record.client_write_id === clientWriteId,
    );
    expect(fromNewTab).toHaveLength(1);
    expect(fromNewTab[0]!.payload.outcome).toBe("skipped");

    // Replays with no account reachable leave it queued — never duplicated,
    // never silently dropped.
    await newTab.reload({ waitUntil: "domcontentloaded" });
    await expect(newTab.getByTestId("today-moments")).toBeVisible();
    expect(
      (await sessionWrites(newTab)).filter(
        (record) => record.client_write_id === clientWriteId,
      ),
    ).toHaveLength(1);

    await newTab.close();
  });

  test("a running session survives a reload and can still be returned to", async ({
    page,
  }) => {
    await openHome(page, { scheduled: true, blockless: false });

    await page.getByTestId("first-move-start").click();
    await expect(page.getByTestId("current-block-hero")).toBeVisible();

    const persisted = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      RUNNING_SESSION_KEY,
    );
    expect(persisted).toBeTruthy();

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("today-moments")).toBeVisible();

    // The reload lands back on Flow (the moment preference is remembered), so
    // the session itself is what proves it survived...
    await expect(page.getByTestId("current-block-hero")).toBeVisible();

    // ...and stepping away still offers the way back.
    await page.getByTestId("moment-switcher-start").click();
    await expect(page.getByTestId("start-moment")).toBeVisible();
    await expect(page.getByTestId("session-running-return")).toBeVisible();

    // And still nothing recorded — a reload is not an outcome either.
    expect(await sessionWrites(page)).toHaveLength(0);
  });
});

/**
 * #687 C2 gap-1 — the End session form across Back, Forward and reload.
 *
 * F1 found focus escaping from behind the open form when Back then Forward
 * remounted the Flow moment under it. F2 (the ratified URL-truth repair)
 * made the form itself URL-visible (`?end=1`), so the approved truth for
 * Back is now "close the form and stay on Flow" — not "switch the moment
 * under a still-open form", which is what F1's original walk exercised.
 * That walk is RE-ANCHORED below, not deleted: Back closes the form, Forward
 * reopens a fresh one, and focus, typing, Tab and Escape all stay in it.
 * The remount-behind-an-open-form mechanism itself stays pinned at the unit
 * tier (`MomentSheet.test.tsx`, "#687 C2 gap-1" block).
 *
 * Every case also holds Target Card 6: navigation never ends the session,
 * and only the form's own Save records an outcome — exactly one.
 */
async function focusIsInEndSheet(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      document.activeElement
        ?.closest('[role="dialog"]')
        ?.getAttribute("aria-label") === "End session",
  );
}

function searchParam(page: Page, key: string): string | null {
  return new URL(page.url()).searchParams.get(key);
}

async function historyLength(page: Page): Promise<number> {
  return page.evaluate(() => window.history.length);
}

async function runningSessionRecord(page: Page): Promise<string | null> {
  return page.evaluate(
    (key) => window.localStorage.getItem(key),
    RUNNING_SESSION_KEY,
  );
}

/** Start -> Flow (session running) -> Done (form open over Flow). */
async function startSessionAndOpenEndForm(page: Page) {
  await openHome(page, { scheduled: true, blockless: false });
  await page.getByTestId("first-move-start").click();
  await expect(page.getByTestId("current-block-hero")).toBeVisible();
  await page.getByTestId("current-block-hero-done").click();
  await expect(page.getByTestId("end-session-sheet")).toBeVisible();
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
]) {
  test.describe(`#687 C2 gap-1 — End session form history truth at ${viewport.width}px`, () => {
    test.use({ viewport });

    test("1. Done puts ?end=1 in the URL over Flow with exactly one history step", async ({
      page,
    }) => {
      await openHome(page, { scheduled: true, blockless: false });
      await page.getByTestId("first-move-start").click();
      await expect(page.getByTestId("current-block-hero")).toBeVisible();
      const before = await historyLength(page);

      await page.getByTestId("current-block-hero-done").click();

      await expect(page.getByTestId("end-session-sheet")).toBeVisible();
      await expect.poll(() => searchParam(page, "end")).toBe("1");
      expect(searchParam(page, "moment")).toBe("flow");
      expect(await historyLength(page)).toBe(before + 1);
      expect(await sessionWrites(page)).toHaveLength(0);
    });

    test("2. Back closes the form, stays on Flow, keeps the session running and records nothing", async ({
      page,
    }) => {
      await startSessionAndOpenEndForm(page);
      await page.getByTestId("end-session-outcome-partial").click();
      await page.getByTestId("end-session-note").fill("unsaved draft");

      await page.goBack();

      await expect(page.getByTestId("end-session-sheet")).toBeHidden();
      await expect.poll(() => searchParam(page, "end")).toBeNull();
      expect(searchParam(page, "moment")).toBe("flow");
      await expect(page.getByTestId("current-block-hero")).toBeVisible();
      expect(await runningSessionRecord(page)).toBeTruthy();
      expect(await sessionWrites(page)).toHaveLength(0);
    });

    test("3. Forward reopens a fresh form and still records nothing", async ({
      page,
    }) => {
      await startSessionAndOpenEndForm(page);
      await page.getByTestId("end-session-note").fill("unsaved draft");
      await page.goBack();
      await expect(page.getByTestId("end-session-sheet")).toBeHidden();

      await page.goForward();

      await expect(page.getByTestId("end-session-sheet")).toBeVisible();
      await expect.poll(() => searchParam(page, "end")).toBe("1");
      await expect(page.getByTestId("end-session-note")).toHaveValue("");
      expect(await runningSessionRecord(page)).toBeTruthy();
      expect(await sessionWrites(page)).toHaveLength(0);
    });

    test("4. Reload on ?end=1 with a running session reopens the form after the page loads", async ({
      page,
    }) => {
      await startSessionAndOpenEndForm(page);
      await page.getByTestId("end-session-note").fill("unsaved draft");

      await page.reload({ waitUntil: "domcontentloaded" });

      await expect(page.getByTestId("today-moments")).toBeVisible();
      await expect(page.getByTestId("end-session-sheet")).toBeVisible();
      expect(searchParam(page, "end")).toBe("1");
      // Documented: the typed, unsaved note is not kept (no draft storage).
      await expect(page.getByTestId("end-session-note")).toHaveValue("");
      expect(await runningSessionRecord(page)).toBeTruthy();
      expect(await sessionWrites(page)).toHaveLength(0);
    });

    test("5. A fresh browser opening ?moment=flow&end=1 with no session gets a clean URL and no form", async ({
      browser,
    }) => {
      const context = await browser.newContext({ viewport });
      const fresh = await context.newPage();
      await pinMomentPreference(fresh, "flow");
      await fresh.goto("/?moment=flow&end=1");
      await expect(fresh.getByTestId("today-moments")).toBeVisible();

      await expect.poll(() => searchParam(fresh, "end")).toBeNull();
      const settledLength = await historyLength(fresh);
      await expect(fresh.getByTestId("end-session-sheet")).toBeHidden();
      expect(searchParam(fresh, "moment")).toBe("flow");
      // Stripped in place: no history entry was added to do it.
      expect(await historyLength(fresh)).toBe(settledLength);
      expect(await sessionWrites(fresh)).toHaveLength(0);
      await context.close();
    });

    test("6. Cancel consumes the form's own history entry, so one Back reaches a different screen", async ({
      page,
    }) => {
      await startSessionAndOpenEndForm(page);

      await page
        .getByTestId("end-session-sheet")
        .getByRole("button", { name: "Cancel" })
        .click();

      await expect(page.getByTestId("end-session-sheet")).toBeHidden();
      await expect.poll(() => searchParam(page, "end")).toBeNull();
      expect(searchParam(page, "moment")).toBe("flow");

      await page.goBack();

      // Not a dead press onto a duplicate Flow entry: the Start entry the
      // session was started from.
      await expect(page.getByTestId("start-moment")).toBeVisible();
      await expect.poll(() => searchParam(page, "moment")).toBe("start");
      expect(await runningSessionRecord(page)).toBeTruthy();
      expect(await sessionWrites(page)).toHaveLength(0);
    });

    test("7. Save records exactly the chosen outcome and clears ?end; Forward afterwards cannot reopen or record", async ({
      page,
    }) => {
      await startSessionAndOpenEndForm(page);

      await page.getByTestId("end-session-outcome-partial").click();
      await page.getByTestId("end-session-minutes").fill("12");
      await page.getByTestId("end-session-note").fill("First section done");
      await page.getByTestId("end-session-save").click();

      await expect.poll(async () => (await sessionWrites(page)).length).toBe(1);
      const [write] = await sessionWrites(page);
      expect(write!.payload.outcome).toBe("partial");
      expect(write!.payload.actual_minutes).toBe(12);
      expect(write!.payload.notes).toBe("First section done");
      await expect(page.getByTestId("end-session-sheet")).toBeHidden();
      await expect.poll(() => searchParam(page, "end")).toBeNull();
      expect(await runningSessionRecord(page)).toBeNull();

      await page.goForward();

      await expect.poll(() => searchParam(page, "end")).toBeNull();
      await expect(page.getByTestId("end-session-sheet")).toBeHidden();
      expect(await sessionWrites(page)).toHaveLength(1);
      expect(await runningSessionRecord(page)).toBeNull();
    });

    test("F1 re-anchored: Back closes the form, Forward reopens it with focus, typing, Tab and Escape held inside, and nothing recorded", async ({
      page,
    }) => {
      await startSessionAndOpenEndForm(page);
      await page.getByTestId("end-session-outcome-partial").click();
      await page.getByTestId("end-session-note").fill("unsaved draft");

      // Approved truth (F2): Back closes the form and stays on Flow.
      await page.goBack();
      await expect(page.getByTestId("end-session-sheet")).toBeHidden();
      await expect(page.getByTestId("flow-moment")).toBeVisible();
      expect(await sessionWrites(page)).toHaveLength(0);

      await page.goForward();
      await expect(page.getByTestId("end-session-sheet")).toBeVisible();

      // Focus is in the form, never behind it: typing reaches nothing
      // behind the scrim, and the First-move box stays untouched.
      await expect.poll(() => focusIsInEndSheet(page)).toBe(true);
      await page.keyboard.type("zz");
      await expect(page.getByTestId("first-tiny-step-input")).toHaveValue("");

      await page.getByTestId("end-session-note").click();
      await page.keyboard.type("fresh note");
      await expect(page.getByTestId("end-session-note")).toHaveValue(
        "fresh note",
      );

      // Tab walks the form, never the page behind it.
      for (let step = 0; step < 4; step += 1) {
        await page.keyboard.press("Tab");
        expect(await focusIsInEndSheet(page)).toBe(true);
      }

      // Escape closes the form — and closing is not an outcome either.
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("end-session-sheet")).toBeHidden();
      await expect.poll(() => searchParam(page, "end")).toBeNull();
      await expect(page.getByTestId("current-block-hero")).toBeVisible();
      expect(await runningSessionRecord(page)).toBeTruthy();
      expect(await sessionWrites(page)).toHaveLength(0);

      // The user's own choice is still the one and only record.
      await endSessionAs(page, "skipped", 3, "Came back to it later");
      await expect.poll(async () => (await sessionWrites(page)).length).toBe(1);
      const [write] = await sessionWrites(page);
      expect(write!.payload.outcome).toBe("skipped");
      expect(write!.payload.notes).toBe("Came back to it later");
    });

    test("capture from the form opens IN FRONT, Back returns to the form with focus in it, and the palette stays out", async ({
      page,
    }) => {
      await startSessionAndOpenEndForm(page);
      await expect.poll(() => focusIsInEndSheet(page)).toBe(true);

      await page.keyboard.press("c");

      const capture = page.getByRole("dialog", { name: "Capture a thought" });
      await expect(capture).toBeVisible();
      await expect.poll(() => searchParam(page, "capture")).toBe("1");
      expect(searchParam(page, "end")).toBe("1");
      // Capture is the front dialog: what paints at its centre is capture,
      // focus is in it, and the form behind it is inert.
      const frontIsCapture = await capture.evaluate((dialog) => {
        const box = dialog.getBoundingClientRect();
        const hit = document.elementFromPoint(
          box.left + box.width / 2,
          box.top + box.height / 2,
        );
        return Boolean(hit && dialog.contains(hit));
      });
      expect(frontIsCapture).toBe(true);
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              document.activeElement
                ?.closest('[role="dialog"]')
                ?.getAttribute("aria-label") ?? null,
          ),
        )
        .toBe("Capture a thought");
      expect(
        await page
          .getByTestId("end-session-sheet")
          .evaluate((el) =>
            el.closest('[data-testid="moment-sheet"]')?.hasAttribute("inert"),
          ),
      ).toBe(true);

      // Back closes capture only; the form is back in front with focus.
      await page.goBack();
      await expect(capture).toBeHidden();
      await expect(page.getByTestId("end-session-sheet")).toBeVisible();
      await expect.poll(() => searchParam(page, "capture")).toBeNull();
      expect(searchParam(page, "end")).toBe("1");
      await expect.poll(() => focusIsInEndSheet(page)).toBe(true);

      // The palette never stacks on the form; it says why instead.
      await page.keyboard.press("Control+k");
      await expect(page.getByTestId("command-palette")).toBeHidden();
      expect(searchParam(page, "palette")).toBeNull();
      await expect(page.getByTestId("today-moments-toast")).toContainText(
        "Close the sheet to open the command palette",
      );

      expect(await runningSessionRecord(page)).toBeTruthy();
      expect(await sessionWrites(page)).toHaveLength(0);
    });

    async function activeDialogLabel(page: Page): Promise<string | null> {
      return page.evaluate(
        () =>
          document.activeElement
            ?.closest('[role="dialog"]')
            ?.getAttribute("aria-label") ?? null,
      );
    }

    async function activeModalCount(page: Page): Promise<number> {
      return page.evaluate(
        () =>
          document.querySelectorAll('[role="dialog"][aria-modal="true"]')
            .length,
      );
    }

    test("capture's Open triage from the form selects Triage (one modal, focus in it), and Back returns to the form", async ({
      page,
    }) => {
      await startSessionAndOpenEndForm(page);
      await expect.poll(() => focusIsInEndSheet(page)).toBe(true);

      await page.keyboard.press("c");
      const capture = page.getByRole("dialog", { name: "Capture a thought" });
      await expect(capture).toBeVisible();
      await page
        .getByTestId("capture-overlay-textarea")
        .fill("Call the plumber back");
      await page.getByTestId("capture-overlay-textarea").press("Enter");
      await expect(capture).toBeHidden();

      const openTriage = page.getByTestId("today-moments-toast-undo");
      await expect(openTriage).toHaveText("Open triage");
      await openTriage.click();

      // The selected sheet is the one active sheet: the form closes in
      // place, the session keeps running, nothing is recorded.
      const triage = page.getByRole("dialog", { name: "Triage" });
      await expect(triage).toBeVisible();
      await expect(page.getByTestId("end-session-sheet")).toBeHidden();
      await expect.poll(() => activeModalCount(page)).toBe(1);
      await expect.poll(() => activeDialogLabel(page)).toBe("Triage");
      await expect.poll(() => searchParam(page, "end")).toBeNull();
      expect(searchParam(page, "sheet")).toBe("triage");
      expect(searchParam(page, "capture")).toBeNull();
      expect(searchParam(page, "moment")).toBe("flow");
      expect(await runningSessionRecord(page)).toBeTruthy();
      expect(await sessionWrites(page)).toHaveLength(0);

      // Back steps to the entry the user came from: the End session form,
      // fresh, with focus in it — still one modal, still nothing recorded.
      await page.goBack();
      await expect(triage).toBeHidden();
      await expect(page.getByTestId("end-session-sheet")).toBeVisible();
      await expect.poll(() => searchParam(page, "end")).toBe("1");
      expect(searchParam(page, "sheet")).toBeNull();
      await expect.poll(() => focusIsInEndSheet(page)).toBe(true);
      await expect.poll(() => activeModalCount(page)).toBe(1);
      expect(await runningSessionRecord(page)).toBeTruthy();
      expect(await sessionWrites(page)).toHaveLength(0);
    });

    test("a canonical composed ?sheet=triage&end=1 opens Triage only, drops end in place, and a reload agrees", async ({
      page,
    }) => {
      await openHome(page, { scheduled: true, blockless: false });
      await page.getByTestId("first-move-start").click();
      await expect(page.getByTestId("current-block-hero")).toBeVisible();

      await page.goto("/?moment=flow&sheet=triage&end=1");
      await expect(page.getByTestId("today-moments")).toBeVisible();

      const triage = page.getByRole("dialog", { name: "Triage" });
      await expect(triage).toBeVisible();
      await expect.poll(() => searchParam(page, "end")).toBeNull();
      await expect(page.getByTestId("end-session-sheet")).toBeHidden();
      expect(searchParam(page, "sheet")).toBe("triage");
      expect(searchParam(page, "moment")).toBe("flow");
      expect(await activeModalCount(page)).toBe(1);
      expect(await runningSessionRecord(page)).toBeTruthy();
      expect(await sessionWrites(page)).toHaveLength(0);

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(triage).toBeVisible();
      await expect(page.getByTestId("end-session-sheet")).toBeHidden();
      expect(searchParam(page, "end")).toBeNull();
      expect(searchParam(page, "sheet")).toBe("triage");
      expect(await activeModalCount(page)).toBe(1);
      expect(await runningSessionRecord(page)).toBeTruthy();
      expect(await sessionWrites(page)).toHaveLength(0);
    });
  });
}
