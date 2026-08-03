import { expect, test, type Page } from "@playwright/test";
import { stubParseCaptureRoute } from "./helpers/mockParseCapture";
import { pinMomentPreference } from "./helpers/momentPreference";
import {
  SEEDED_USERS,
  SIGNED_IN_TAG,
  accountClient,
  localDay,
  logFailedAccountWrites,
  gotoWithAccountSync,
  purgeOwnRows,
  reloadWithAccountSync,
  requireSupabaseEnv,
  signIn,
  type AccountClient,
  type SeededUser,
  type SupabaseEnv,
} from "./helpers/signedInAccount";

/**
 * #737 C1 — the SIGNED-IN browser tier. The residual ROUND 3 recorded.
 *
 * ## The seam, in the judge's own words
 *
 * > The CI `e2e` job still sets **no** Supabase env, so every Playwright pin
 * > outside `migrations-rls` runs device-tier only. […] the other criteria are
 * > still pinned at two tiers that never meet in a signed-in browser. This
 * > drive is the only account-tier browser evidence for them, and a drive is
 * > not a pin.
 *
 * Two tiers existed and neither could see a signed-in browser:
 *
 *  - DEVICE tier — every other spec in `tests/e2e/`. Real browser, real
 *    IndexedDB, NO account. Proves the journal half.
 *  - ACCOUNT tier — `src/__tests__/phase4aRls.local*.test.ts` in the
 *    `migrations-rls` job. Real Postgres, real JWT, NO browser: jsdom renders
 *    a hook, not the app.
 *
 * This file is the intersection: a real browser, signed in as a real seeded
 * user, driving the real UI, with every claim read back out of Postgres using
 * **that user's own JWT**. Nothing here replaces a device-tier assertion — the
 * device specs are untouched and still run in the `e2e` job.
 *
 * ## Scope, stated so the gaps are not mistaken for coverage
 *
 * One test per C1 criterion family the residual named:
 *
 *  - criterion 3 (accepted work never resurrects)      → test 1
 *  - criterion 2 (one truthful session record)         → test 2
 *  - criterion 4 (one verdict per day, idempotent)     → test 3
 *  - criterion 6 (durability readback)                 → test 4, the REVIEWS
 *    noun, across a brand-new browser profile.
 *
 * NOT covered here, deliberately and with the reason:
 *  - criterion 6's WINS noun. A win is only ever offered for a
 *    `calendar_blocks` row with `status = "completed"`
 *    (`momentsViewModel/close.ts`), and the moments home's plan sheet has no
 *    approve affordance — approving a proposal still lives on the legacy
 *    `/calendar` shell, which is campaign C2's remit. Probed on this branch:
 *    a blockless session ends with `execution_sessions` written and NO win
 *    candidate. Its account tier stays pinned in `phase4aRls.local.test.ts`.
 *  - criterion 6's ROLLUPS noun. Already has its own account-tier pin
 *    (`phase4aRls.local.rollupOfferTruth.test.tsx`), and a rollup offer needs
 *    prior-week area activity the seed does not carry.
 *  - criterion 6's DRAFTS noun. Device-local by design
 *    (`lib/durability/draftStore.ts`) — there is no account tier to close.
 *  - criterion 1's phrase guards and criterion 5's Health honesty: both are
 *    pinned in the always-on `unit` job, which no env gates.
 *
 * ## The parse route is still stubbed here
 *
 * `/api/parse-capture` requires a verified bearer token (HIGH-1 / #670), which
 * a signed-in run finally HAS — so this tier could exercise the real route for
 * the first time. It deliberately does not: the mock keeps the drafts these
 * specs assert on deterministic and keeps the run off any network. Proving the
 * authenticated route posture end-to-end is separable work (AGENT-TODO).
 */

let env: SupabaseEnv;

test.beforeAll(() => {
  // Defence 1: no signed-in spec may quietly degrade into a demo-mode spec.
  env = requireSupabaseEnv();
});

interface SignedInFixture {
  account: AccountClient;
}

/**
 * Sign in, wipe this user's own rows, and land on a clean Today.
 *
 * The purge runs BEFORE the drive and is followed by a fresh document load so
 * the app's in-memory state is rebuilt from the emptied account rather than
 * from rows it read a moment earlier. In CI (fresh `supabase db reset`) every
 * delete is a no-op; locally it is what makes a second run mean the same thing
 * as the first.
 */
async function openSignedInToday(
  page: Page,
  user: SeededUser,
): Promise<SignedInFixture> {
  logFailedAccountWrites(page);
  await stubParseCaptureRoute(page);
  await pinMomentPreference(page, "start");
  await signIn(page, user);

  const account = await accountClient(page, user, env);
  await purgeOwnRows(account);

  await gotoWithAccountSync(page, "/");
  await expect(page.getByTestId("today-moments")).toBeVisible({
    timeout: 30_000,
  });

  return { account };
}

/** Capture a thought and sort it, leaving the triage sheet open on the draft. */
async function captureAndSort(page: Page, text: string): Promise<void> {
  await page.getByTestId("capture-affordance").click();
  await page.getByTestId("capture-overlay-textarea").fill(text);
  await page.getByTestId("capture-overlay-save").click();
  await expect(page.getByTestId("capture-overlay")).toHaveCount(0, {
    timeout: 20_000,
  });

  await page.getByTestId("pipeline-overview-stage-triage").click();
  await expect(page.getByTestId("triage-sheet-captures")).toContainText(text, {
    timeout: 20_000,
  });
  await page
    .getByTestId(/^triage-sheet-sort-/)
    .first()
    .click();
  await expect(page.getByTestId("triage-sheet-list")).toBeVisible({
    timeout: 30_000,
  });
}

/**
 * Close the moment sheet by its own affordance.
 *
 * `Escape` leaves the scrim in place here (probed: the sheet's scrim then
 * intercepts every click on the Start moment behind it, and a spec that only
 * asserted `start-moment` visibility would pass while the sheet was still up).
 */
async function closeMomentSheet(page: Page): Promise<void> {
  await page.getByTestId("moment-sheet-close").click();
  await expect(page.getByTestId("moment-sheet")).toHaveCount(0);
}

/**
 * Poll until the account holds exactly `count` rows for `path`, then return
 * them. Keeps the "how many" and the "which values" assertions in one place
 * without racing the app's write.
 */
async function rowsEventually<T>(
  account: AccountClient,
  path: string,
  count: number,
): Promise<T[]> {
  await expect
    .poll(async () => (await account.rows<T>(path)).length, { timeout: 30_000 })
    .toBe(count);
  return account.rows<T>(path);
}

/** A second tab in the SAME profile: fresh `sessionStorage`, shared IndexedDB. */
async function openSecondTab(
  context: { newPage: () => Promise<Page> },
  path = "/",
): Promise<Page> {
  const tab = await context.newPage();
  await stubParseCaptureRoute(tab);
  await gotoWithAccountSync(tab, path);
  await expect(tab.getByTestId("today-moments")).toBeVisible({
    timeout: 30_000,
  });
  return tab;
}

test.describe("#737 C1 — the signed-in browser tier", () => {
  test(`${SIGNED_IN_TAG} criterion 3: an accepted capture is resolved in the ACCOUNT, and never offered back as unsorted`, async ({
    page,
    context,
  }) => {
    const user = SEEDED_USERS.a;
    const { account } = await openSignedInToday(page, user);
    const text = "Signed-in seam: an accepted thought stays accepted";

    await captureAndSort(page, text);

    // The user owns exactly one capture in this run (the purge saw to that),
    // so the row is identified by ownership rather than by a PostgREST text
    // filter — the filter is a second thing that can be wrong, and it was.
    const ownCaptures = () =>
      account.rows<{ id: string; status: string; raw_text: string }>(
        "capture_items?select=id,status,raw_text",
      );

    // Positive control, in the same run: before the accept the account holds
    // the thought as genuinely unsorted. Without this, the `resolved`
    // assertion below could pass on a build that resolved everything.
    await expect
      .poll(async () => (await ownCaptures()).map((row) => row.status), {
        timeout: 20_000,
      })
      .toEqual(["new"]);

    await page
      .getByTestId(/^triage-sheet-accept-/)
      .first()
      .click();
    await expect(page.getByTestId("triage-sheet-empty")).toBeVisible({
      timeout: 30_000,
    });

    // THE ACCOUNT-TIER CLAIM. `resolved` here is a row PostgREST returned for
    // this user under RLS, not a screen reading.
    await expect
      .poll(async () => (await ownCaptures()).map((row) => row.status), {
        timeout: 30_000,
      })
      .toEqual(["resolved"]);
    const captures = await ownCaptures();
    expect(captures[0]!.raw_text).toBe(text);

    // And the task the account created points back at it — the backlink that
    // makes "one item, one truth" checkable rather than asserted.
    const tasks = await rowsEventually<{
      title: string;
      source_capture_item_id: string | null;
    }>(account, "tasks?select=id,title,source_capture_item_id", 1);
    expect(tasks[0]!.title).toBe(text);
    expect(tasks[0]!.source_capture_item_id).toBe(captures[0]!.id);

    // THE REPRODUCTION: a tab that never saw the decision must not offer the
    // thought back. Signed in, this reads the account, not the journal.
    await closeMomentSheet(page);
    const secondTab = await openSecondTab(context);
    await secondTab.getByTestId("pipeline-overview-stage-triage").click();
    await expect(secondTab.getByTestId("triage-sheet-empty")).toBeVisible({
      timeout: 30_000,
    });
    await expect(secondTab.getByTestId("triage-sheet-captures")).toHaveCount(0);
    await expect(secondTab.getByTestId(/^triage-sheet-sort-/)).toHaveCount(0);
    await secondTab.close();
  });

  test(`${SIGNED_IN_TAG} criterion 2: a focus session writes exactly one ACCOUNT row, carrying the outcome the user picked`, async ({
    page,
  }) => {
    const user = SEEDED_USERS.a;
    const { account } = await openSignedInToday(page, user);
    const text = "Signed-in seam: one session, one row";

    await captureAndSort(page, text);
    // `Do today` makes the task active and startable without a calendar block —
    // the audit's P0#2 shape, and the only start the moments home offers.
    await page
      .getByTestId(/^triage-sheet-today-/)
      .first()
      .click();
    await expect(page.getByTestId("triage-sheet-empty")).toBeVisible({
      timeout: 30_000,
    });
    await closeMomentSheet(page);

    await page.getByTestId("first-move-start").click();
    await expect(page.getByTestId("current-block-hero")).toBeVisible({
      timeout: 20_000,
    });

    // Starting is not a choice, so it must record nothing. This is the audit
    // P0#1 half — the `partial` row nobody ever picked.
    expect(await account.rows("execution_sessions?select=id")).toHaveLength(0);

    await page.getByTestId("current-block-hero-done").click();
    await expect(page.getByTestId("end-session-sheet")).toBeVisible({
      timeout: 20_000,
    });
    await page.getByTestId("end-session-outcome-partial").click();
    await page.getByTestId("end-session-minutes").fill("18");
    await page.getByTestId("end-session-note").fill("Got through section one");
    await page.getByTestId("end-session-save").click();

    const sessions = await rowsEventually<{
      outcome: string;
      actual_minutes: number | null;
      notes: string | null;
      client_write_id: string | null;
    }>(
      account,
      "execution_sessions?select=outcome,actual_minutes,notes,client_write_id",
      1,
    );
    // The chosen outcome, not a silent default — `partial` is what the user
    // picked here, so `partial` must be what the account holds.
    expect(sessions[0]!.outcome).toBe("partial");
    expect(sessions[0]!.actual_minutes).toBe(18);
    expect(sessions[0]!.notes).toBe("Got through section one");
    expect(sessions[0]!.client_write_id).toBeTruthy();

    // A reload re-arms the journal's mount replay. The `client_write_id` must
    // make that replay a no-op against the real unique index, not a second row.
    await reloadWithAccountSync(page);
    await expect(page.getByTestId("today-moments")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(3_000);
    expect(await account.rows("execution_sessions?select=id")).toHaveLength(1);
  });

  test(`${SIGNED_IN_TAG} criterion 4: closing the day writes exactly one ACCOUNT review, and the day stays closed`, async ({
    page,
  }) => {
    const user = SEEDED_USERS.a;
    const { account } = await openSignedInToday(page, user);
    const today = await localDay(page);

    await gotoWithAccountSync(page, "/?moment=close");
    await expect(page.getByTestId("close-moment")).toBeVisible({
      timeout: 30_000,
    });

    // Positive control: the day is genuinely open, and the account says so.
    await expect(page.getByTestId("close-moment-close-day")).toBeVisible();
    expect(await account.rows("review_entries?select=id")).toHaveLength(0);

    await page.getByTestId("close-moment-close-day").click();
    await expect(page.getByTestId("close-moment-verdict-payoff")).toBeVisible({
      timeout: 20_000,
    });
    const verdict = (
      await page.getByTestId("close-moment-verdict-payoff").textContent()
    )?.trim();

    // A second close is not offered, because a second close is not a thing.
    await expect(page.getByTestId("close-moment-close-day")).toHaveCount(0);

    // ## The close is JOURNALLED first and DELIVERED on the next mount
    //
    // Measured on this branch, not assumed: 30 s of polling after the click
    // finds `review_entries` still empty, and the app says so itself —
    // `close-moment-verdict-destination` renders the "saved on this device and
    // sending" form, not "saved to your account". `replayDurableWrites` drains
    // the journal from `WorkflowProvider`'s mount effect, so the reload below
    // is what arms delivery. Asserting the row without it would be asserting
    // a behaviour the app does not claim.
    await reloadWithAccountSync(page);
    await expect(page.getByTestId("close-moment")).toBeVisible({
      timeout: 30_000,
    });

    // ONE row, keyed on the BROWSER's local calendar day — the property the
    // unique index `review_entries_user_daily_close_key` protects and the one
    // that was wrong when the write keyed on the UTC date.
    const reviews = await rowsEventually<{ period_start: string }>(
      account,
      "review_entries?select=period_start,review_type",
      1,
    );
    expect(reviews[0]!.period_start).toBe(today);

    // The screen's own claim now matches the row. This phrase is the one that
    // must never be shown over an undelivered write.
    await expect(
      page.getByTestId("close-moment-verdict-destination"),
    ).toHaveText("Today's close is saved to your account.");
    await expect(page.getByTestId("close-moment-verdict-payoff")).toHaveText(
      verdict!,
    );
    await expect(page.getByTestId("close-moment-close-day")).toHaveCount(0);

    // A SECOND mount re-arms the replay. The journal's idempotency key and the
    // unique index must between them leave the row count alone — a second row
    // here is the "closed the day five times" defect the audit found.
    await reloadWithAccountSync(page);
    await expect(page.getByTestId("close-moment")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(3_000);
    expect(await account.rows("review_entries?select=id")).toHaveLength(1);
  });

  test(`${SIGNED_IN_TAG} criterion 6: a closed day survives a BRAND-NEW browser profile — the device forgets, the account does not`, async ({
    browser,
  }) => {
    const user = SEEDED_USERS.b;

    // --- profile one: close the day.
    const first = await browser.newContext();
    const firstPage = await first.newPage();
    let verdict: string;
    try {
      const { account } = await openSignedInToday(firstPage, user);
      await gotoWithAccountSync(firstPage, "/?moment=close");
      await expect(firstPage.getByTestId("close-moment")).toBeVisible({
        timeout: 30_000,
      });
      await firstPage.getByTestId("close-moment-close-day").click();
      await expect(
        firstPage.getByTestId("close-moment-verdict-payoff"),
      ).toBeVisible({ timeout: 20_000 });
      verdict =
        (
          await firstPage
            .getByTestId("close-moment-verdict-payoff")
            .textContent()
        )?.trim() ?? "";

      // Same delivery mechanic as criterion 4: the close is journalled on
      // click and drained by the next mount's replay.
      await reloadWithAccountSync(firstPage);
      await expect(firstPage.getByTestId("close-moment")).toBeVisible({
        timeout: 30_000,
      });
      await expect
        .poll(
          async () => (await account.rows("review_entries?select=id")).length,
          {
            timeout: 30_000,
          },
        )
        .toBe(1);
    } finally {
      await first.close();
    }

    // --- profile two: a genuinely different device. New context = empty
    // IndexedDB, empty sessionStorage, no cookies. NOTHING device-local
    // carries over, so anything the screen knows here it learned from the
    // account. This is the discriminator a new TAB cannot be.
    const second = await browser.newContext();
    const secondPage = await second.newPage();
    try {
      logFailedAccountWrites(secondPage);
      await stubParseCaptureRoute(secondPage);
      await signIn(secondPage, user);
      const account = await accountClient(secondPage, user, env);

      await gotoWithAccountSync(secondPage, "/?moment=close");
      await expect(secondPage.getByTestId("close-moment")).toBeVisible({
        timeout: 30_000,
      });

      // The day reads closed, with the same verdict, on a device that has
      // never seen it — and no second close is offered.
      await expect(
        secondPage.getByTestId("close-moment-verdict-payoff"),
      ).toHaveText(verdict, { timeout: 30_000 });
      await expect(
        secondPage.getByTestId("close-moment-close-day"),
      ).toHaveCount(0);

      // Still exactly one row: reading it back did not mint another.
      expect(await account.rows("review_entries?select=id")).toHaveLength(1);
    } finally {
      await second.close();
    }
  });
});
