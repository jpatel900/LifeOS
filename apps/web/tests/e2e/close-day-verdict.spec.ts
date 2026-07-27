import { expect, test, type Page } from "@playwright/test";
import { stubParseCaptureRoute } from "./helpers/mockParseCapture";
import { pinMomentPreference } from "./helpers/momentPreference";

/**
 * Final UX Loop C1, Target Cards 1+7 — audit P0#4: "Closing the day confirms
 * nothing, and can be done forever".
 *
 * ## What the audit saw, and what this spec pins
 *
 * Audit 2026-07-26 (finding #4) pressed `Close the day` on a real build and
 * observed: the screen before, one second after, eight seconds after, and
 * after a hard reload were IDENTICAL — the button still sitting there, the
 * future-tense orientation line still describing an action not yet taken —
 * while `review_entries` accumulated FIVE rows for the single date
 * `2026-07-26`.
 *
 * So this spec asserts the three things that were false:
 *
 *  1. closing renders a visible verdict, immediately;
 *  2. a second close on the same day writes NOTHING — the verdict is what the
 *     user gets instead, and the journal still holds exactly one review;
 *  3. the verdict survives a hard reload and a NEW TAB, so "today is closed"
 *     is a fact about the day and not about one render.
 *
 * The account tier — that the DATABASE refuses a second daily row — is not
 * provable here (this suite's dev server runs with no Supabase env at all, so
 * `createSupabaseBrowserClient()` returns null and every close resolves
 * `local-only`). That half is proven in `phase4aRls.local.test.ts`
 * ("refuses a second daily close for the same user and date").
 *
 * ## THE CLOCK IS PINNED, AND DELIBERATELY UTC-HOSTILE
 *
 * PR #773's lesson (see `helpers/momentPreference.ts`): a spec that reads the
 * wall clock renders a different surface on a UTC runner than on the author's
 * machine. This spec goes further than pinning the MOMENT, because the thing
 * under test is itself date-keyed: a close is filed under a calendar day and
 * read back by that same key.
 *
 * `timezoneId: "Pacific/Kiritimati"` is UTC+14 and `setFixedTime` pins the
 * instant to 2026-07-27T12:00:00Z. In that browser the LOCAL calendar day is
 * 2026-07-28 while the UTC day is 2026-07-27 — the two differ, always, on
 * every runner. Before this lane the write path keyed the review on the UTC
 * date (`new Date().toISOString().slice(0, 10)`) while the Close moment
 * derived its counts from the LOCAL day, so this configuration is exactly the
 * band in which a verdict written at 20:00 local would be filed under a day
 * the readback never looks at.
 *
 * Every seeded instant below is an absolute UTC string relative to that pinned
 * moment, never `Date.now()`, so the fixture does not move with the runner.
 */

const STORAGE_KEY = "lifeos.phase2.workflow";
const JOURNAL_DB = "lifeos-pending-writes";
const JOURNAL_STORE = "pending";

/** Pinned instant. Local (UTC+14) day is 2026-07-28; UTC day is 2026-07-27. */
const PINNED_NOW = "2026-07-27T12:00:00.000Z";
/** The LOCAL calendar day at `PINNED_NOW` — the day a close must be filed under. */
const PINNED_LOCAL_DAY = "2026-07-28";
/** The UTC calendar day at `PINNED_NOW` — the WRONG key, asserted against. */
const PINNED_UTC_DAY = "2026-07-27";

const AREA_ID = "e2e-area-close-verdict";
const TASK_ID = "e2e-task-close-verdict";
const BLOCK_ID = "e2e-block-close-verdict";

test.use({ timezoneId: "Pacific/Kiritimati" });

test.beforeEach(async ({ page }) => {
  await stubParseCaptureRoute(page);
});

/**
 * One completed block on the pinned LOCAL day, so `1 COMPLETED TODAY` is
 * genuinely recorded — the exact precondition the audit ran under.
 * 2026-07-27T12:30Z is 2026-07-28 02:30 in Kiritimati.
 */
function buildSeedState(fixClock = true) {
  const created = "2026-07-01T00:00:00.000Z";
  // Under the fixed clock the block is pinned to the pinned day. On the real
  // clock (the reload test) it is pinned to NOW, so `1 COMPLETED TODAY` is
  // true on whatever day the suite happens to run.
  const blockStart = fixClock
    ? "2026-07-27T12:30:00.000Z"
    : new Date().toISOString();

  return {
    areas: [
      {
        id: AREA_ID,
        user_id: "e2e-user",
        name: "Work",
        color: "#2563eb",
        created_at: created,
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
        title: "Shipped the closing verdict",
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
        created_at: created,
        updated_at: blockStart,
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
        start_at: blockStart,
        end_at: blockStart,
        status: "completed",
        created_at: created,
        updated_at: blockStart,
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
 * Read the journal straight out of IndexedDB (mirrors
 * `durable-wins-reviews.spec.ts`): asking the app whether it wrote once is not
 * evidence, asking the browser is.
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

async function reviewWrites(page: Page) {
  return (await readJournal(page)).filter(
    (record) => record.entity === "review",
  );
}

/**
 * Seed and land on Close.
 *
 * THE MOMENT IS PINNED BY THE URL, NOT ONLY BY STORAGE.
 * -----------------------------------------------------
 * `pinMomentPreference` is still applied (it is the house pin, and it covers
 * the first load), but the deep link is what makes a RELOAD deterministic: a
 * query parameter is part of the document address and survives `page.reload()`
 * unconditionally, whereas an `addInitScript` seed is a mechanism that can
 * silently no-op. It did: on one full-suite run this spec reloaded into the
 * Start moment on the real wall-clock date, meaning neither init script had
 * taken effect on that navigation. Belt (deep link) and braces (preference).
 *
 * `fixClock` is opt-out for the same reason. A FAKE clock is the right pin for
 * asserting WHICH DAY a close is filed under (test 1), but it is another
 * init-script-installed mechanism, and the reload test's claim — "the verdict
 * outlives the document" — does not need one: the write and the readback use
 * the same real clock on both sides of the reload, so they agree by
 * construction. The timezone pin (UTC+14) stays on for both, so the local day
 * still differs from the UTC day for most of the day on every runner.
 */
async function openCloseMoment(page: Page, { fixClock = true } = {}) {
  if (fixClock) {
    await page.clock.setFixedTime(new Date(PINNED_NOW));
  }
  await pinMomentPreference(page, "close");
  await page.addInitScript(
    ({ key, value }) => {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    },
    { key: STORAGE_KEY, value: buildSeedState(fixClock) },
  );
  await page.goto("/?moment=close");
  await expect(page.getByTestId("today-moments")).toBeVisible();
  await expect(page.getByTestId("close-moment")).toBeVisible();
}

test.describe("close the day renders a verdict, exactly once", () => {
  test("closing renders an immediate visible verdict, and a second close writes nothing", async ({
    page,
  }) => {
    await openCloseMoment(page);

    // Precondition: the audit's exact starting screen — a real count, an
    // unpressed action, and no verdict anywhere.
    await expect(page.getByTestId("close-moment-completed")).toHaveText("1");
    await expect(page.getByTestId("close-moment-close-day")).toBeVisible();
    await expect(page.getByTestId("close-moment-verdict")).toHaveCount(0);

    await page.getByTestId("close-moment-close-day").click();

    // 1. THE PAYOFF. Visible, in the flagship card, not only in a toast that
    // fades. The audit's complaint was that finishing something felt like
    // nothing happened.
    const verdict = page.getByTestId("close-moment-verdict");
    await expect(verdict).toBeVisible();
    await expect(verdict).toContainText("Today is closed");
    // The counts the close was taken over stay on screen beside the verdict.
    await expect(page.getByTestId("close-moment-completed")).toHaveText("1");

    // With no account reachable the copy must name where the review actually
    // is — the device — rather than claiming the account has it.
    await expect(verdict).toContainText("saved on this device");

    // 2. The write went to the journal exactly once, keyed on the LOCAL day.
    await expect.poll(async () => (await reviewWrites(page)).length).toBe(1);
    const [firstWrite] = await reviewWrites(page);
    expect(firstWrite!.payload.review_type).toBe("daily");
    expect(firstWrite!.payload.period_start).toBe(PINNED_LOCAL_DAY);
    expect(firstWrite!.payload.period_start).not.toBe(PINNED_UTC_DAY);

    // 3. THE AUDIT'S CORE FAILURE: the action must no longer be pressable.
    await expect(page.getByTestId("close-moment-close-day")).toHaveCount(0);

    // ...including via the keyboard primary (Enter), which routes to the same
    // handler and was the second way to write a duplicate row.
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);
    expect(await reviewWrites(page)).toHaveLength(1);
    expect((await reviewWrites(page))[0]!.client_write_id).toBe(
      firstWrite!.client_write_id,
    );
    await expect(verdict).toBeVisible();
  });

  test("the verdict survives a hard reload and a new tab", async ({
    page,
    context,
  }) => {
    // Real clock here — see `openCloseMoment`'s note. The claim under test is
    // persistence across a reload, and pinning a fake instant would put an
    // init-script-installed mechanism between the write and the readback.
    await openCloseMoment(page, { fixClock: false });
    await page.getByTestId("close-moment-close-day").click();
    await expect(page.getByTestId("close-moment-verdict")).toBeVisible();
    await expect.poll(async () => (await reviewWrites(page)).length).toBe(1);
    const clientWriteId = (await reviewWrites(page))[0]!.client_write_id;

    // A hard reload. The audit explicitly checked this and found the screen
    // identical to the pre-close one.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("close-moment")).toBeVisible();
    await expect(page.getByTestId("close-moment-verdict")).toBeVisible();
    await expect(page.getByTestId("close-moment-close-day")).toHaveCount(0);
    expect(await reviewWrites(page)).toHaveLength(1);

    // A NEW TAB: fresh `sessionStorage`, shared IndexedDB. This is what makes
    // the readback honest rather than a per-tab memory — the verdict has to
    // come from the journal, the tier that actually holds the write.
    const newTab = await context.newPage();
    await pinMomentPreference(newTab, "close");
    await newTab.goto("/?moment=close");
    await expect(newTab.getByTestId("close-moment")).toBeVisible();
    await expect(newTab.getByTestId("close-moment-verdict")).toBeVisible();
    await expect(newTab.getByTestId("close-moment-close-day")).toHaveCount(0);

    const fromNewTab = (await readJournal(newTab)).filter(
      (record) => record.client_write_id === clientWriteId,
    );
    expect(fromNewTab).toHaveLength(1);

    await newTab.close();
  });
});
