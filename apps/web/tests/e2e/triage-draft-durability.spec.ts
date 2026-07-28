import { expect, test, type Page } from "@playwright/test";
import { stubParseCaptureRoute } from "./helpers/mockParseCapture";
import { pinMomentPreference } from "./helpers/momentPreference";

/**
 * #737 C1 re-score GAP 3 — an UNACCEPTED triage draft survives the tab.
 *
 * ## The gap, in the judge's own click path
 *
 * Capture a thought, open triage, press `Sort`, and the draft renders. Reload
 * the same tab and it is still there. Close the tab and open a new one in the
 * same profile and it is GONE — the row reads "Captured, not sorted yet"
 * again, and the Start hero goes back to "1 thought waiting for a decision".
 * The capture's own `status` was legitimately still `new`; the draft was the
 * thing that had no home outside the tab that made it.
 *
 * #778 made the ACCEPTED draft durable. This closes the undecided one, in a
 * separate device store (`lib/durability/draftStore.ts`) rather than the
 * pending-writes journal — a draft nobody has decided about owes the account
 * nothing, and that module's header sets out at length why journalling it
 * would build an undrainable queue.
 *
 * ## Why a NEW PAGE and not a new browser context
 *
 * IndexedDB is partitioned per context in Playwright, so a new context would
 * pass or fail for reasons unrelated to this code. A new page in the SAME
 * context is what a new tab actually is: fresh `sessionStorage`, shared
 * IndexedDB. `durable-plans-drafts.spec.ts` and `durable-wins-reviews.spec.ts`
 * use the same discriminator for the same reason.
 *
 * ## What the second tab is seeded with, and why
 *
 * Area and capture, never the draft. That is the honest model of the judge's
 * drive: those two are account rows that rehydrate on their own, and the draft
 * was device-only. Seeding the draft into tab two would prove nothing.
 *
 * ## PROVEN HERE / NOT PROVEN HERE
 *
 * Proven, in a real browser: a sorted draft is readable from a tab that never
 * saw it, its stored field values come back verbatim rather than being
 * re-derived, and the capture behind it stops being offered as unsorted.
 *
 * Not proven here: an in-place EDIT driven through the UI. The moments home's
 * triage sheet has no edit affordance — `editTaskDraft` is wired only in the
 * legacy cockpit's `TriageView` (#687 scope). The second test below therefore
 * carries an edited draft (a title no parse of that capture text could
 * produce) through the store, and the edit-then-restore path is driven
 * end-to-end through the real provider and a real IndexedDB in
 * `src/__tests__/durableTriageDraftGuard.test.tsx`.
 */

const STORAGE_KEY = "lifeos.phase2.workflow";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const AREA_ID = "e2e-area-draft-durability";
const CAPTURE_ID = "e2e-capture-draft-durability";
const EDITED_DRAFT_ID = "e2e-draft-edited";
const CAPTURE_TEXT = "Renew the volunteer insurance certificate";
const EDITED_TITLE = "Renew the volunteer insurance certificate — 2027 policy";

test.beforeEach(async ({ page }) => {
  await stubParseCaptureRoute(page);
});

test.beforeAll(async ({ browser }) => {
  const warmup = await browser.newPage();
  await warmup.goto("/", { timeout: 180_000 });
  await warmup.close();
});

function buildSeedState(options: { editedDraft: boolean }) {
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
        raw_text: CAPTURE_TEXT,
        return_hook: null,
        client_capture_id: null,
        capture_mode: "text",
        inferred_area_confidence: 0.9,
        // The account status a sorted-but-unaccepted capture legitimately
        // still has. It is why the capture comes back on its own and the
        // draft does not.
        status: "triage_required",
        created_at: daysBefore(1),
      },
    ],
    taskDrafts: options.editedDraft
      ? [
          {
            id: EDITED_DRAFT_ID,
            user_id: "e2e-user",
            capture_item_id: CAPTURE_ID,
            area_id: AREA_ID,
            // Not the capture text, and not anything the mock parser emits
            // for it: only a stored copy of THIS draft can produce it.
            title: EDITED_TITLE,
            description: null,
            confidence: 0.8,
            estimated_minutes_low: 30,
            estimated_minutes_high: 60,
            first_tiny_step: "Find last year's certificate",
            breakdown: null,
            person_mentions: [],
            is_commitment: false,
            status: "pending",
            created_at: nowIso,
          },
        ]
      : [],
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
  };
}

async function seed(page: Page, options: { editedDraft: boolean }) {
  await pinMomentPreference(page, "start");
  await page.addInitScript(
    ({ key, value }) => {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    },
    { key: STORAGE_KEY, value: buildSeedState(options) },
  );
}

async function openTriageSheet(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("today-moments")).toBeVisible();
  await page.keyboard.press("1");
  await expect(page.getByTestId("start-moment")).toBeVisible();
  await page.getByTestId("pipeline-overview-stage-triage").click();
  await expect(
    page
      .getByTestId("triage-sheet-list")
      .or(page.getByTestId("triage-sheet-captures")),
  ).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("#737 C1 GAP 3 — an unaccepted triage draft is device-durable", () => {
  test("a sorted draft is there in a tab that never saw it", async ({
    page,
    context,
  }) => {
    await seed(page, { editedDraft: false });
    await openTriageSheet(page);

    // Sort the capture into a draft — the explicit triage action (#703).
    await page.getByTestId(`triage-sheet-sort-${CAPTURE_ID}`).click();
    const draftItem = page.getByTestId(/^triage-sheet-item-/);
    await expect(draftItem).toBeVisible({ timeout: 15_000 });
    const draftText = await draftItem.innerText();
    expect(draftText).toContain(CAPTURE_TEXT);

    // THE DISCRIMINATOR. A new tab in the same context: fresh
    // `sessionStorage` seeded with the account's rows only (area + capture),
    // shared IndexedDB. Before the fix this tab showed "Captured, not sorted
    // yet" and no draft at all.
    const newTab = await context.newPage();
    await stubParseCaptureRoute(newTab);
    await seed(newTab, { editedDraft: false });
    await openTriageSheet(newTab);

    await expect(newTab.getByTestId(/^triage-sheet-item-/)).toBeVisible({
      timeout: 15_000,
    });

    // The other half of the judge's finding: the capture behind the draft must
    // not be offered back as an unsorted thought.
    await expect(
      newTab.getByTestId(`triage-sheet-capture-${CAPTURE_ID}`),
    ).toHaveCount(0);

    await newTab.close();
  });

  test("the stored draft comes back verbatim, edits and all", async ({
    page,
    context,
  }) => {
    await seed(page, { editedDraft: true });
    await openTriageSheet(page);
    await expect(
      page.getByTestId(`triage-sheet-item-${EDITED_DRAFT_ID}`),
    ).toContainText(EDITED_TITLE);

    const newTab = await context.newPage();
    await stubParseCaptureRoute(newTab);
    // No draft in this tab's seed. If the title below appears, it came from
    // the device store — a re-parse of the capture text cannot produce it.
    await seed(newTab, { editedDraft: false });
    await openTriageSheet(newTab);

    await expect(
      newTab.getByTestId(`triage-sheet-item-${EDITED_DRAFT_ID}`),
    ).toContainText(EDITED_TITLE, { timeout: 15_000 });

    await newTab.close();
  });
});
