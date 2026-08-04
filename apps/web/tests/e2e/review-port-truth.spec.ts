import { expect, test, type Page } from "@playwright/test";
import { stubParseCaptureRoute } from "./helpers/mockParseCapture";
import { pinMomentPreference } from "./helpers/momentPreference";
import {
  SEEDED_USERS,
  SIGNED_IN_TAG,
  accountClient,
  expectOnlyKnownAccountFailures,
  gotoWithAccountSync,
  localDay,
  purgeOwnRows,
  reloadWithAccountSync,
  requireSupabaseEnv,
  signIn,
  watchAccountFailures,
  type AccountClient,
  type AccountFailureWatch,
  type SeededUser,
  type SupabaseEnv,
} from "./helpers/signedInAccount";

/**
 * Final UX Loop C2-S3 (#687) — the ported Review surface, at the signed-in
 * tier.
 *
 * The C2-S1 capability inventory verified all four `/review` writes against
 * real PostgREST calls. This file proves the SAME claims about the ported
 * surface on the moments home, read back out of Postgres with the browser's
 * own JWT — so "ported" means the capability survived, not that a button with
 * a similar name exists.
 *
 * Three things are pinned here that the legacy screen could not offer:
 *
 *  - **FINDING 6 by construction** — every decision is taken WITHOUT leaving
 *    the surface, and the assertion after each one says so.
 *  - **C2 Target Card 2** — `?sheet=review` is URL-visible, and refresh, Back
 *    and Forward agree with each other and with the screen.
 *  - **the sections the inventory could not drive** — aging waiting-on, open
 *    commitments and policy proposals, with the data that makes each render.
 *
 * ## Where the seeding line is drawn
 *
 * Every WRITE this surface performs is driven through the UI and read back
 * from the account. The only rows written out of band are ones with **no UI
 * writer at all** — the S3 `waiting_on_*` / `is_commitment` columns, which
 * exist to be read by this surface and are set elsewhere. Policy proposals are
 * NOT seeded: they are earned by rejecting three drafts through the Plan
 * sheet, which is the app's own `override_records` path.
 *
 * Deliberately NOT touched: `/health`. Its liveness probe calls four RPCs with
 * a dummy id and EXPECTS 400s (`lib/data/health.ts`), which
 * `expectOnlyKnownAccountFailures` does not tolerate. Widening that tolerance
 * to reach a screen this slice does not port would weaken the guard for
 * everyone (C2-S1 FINDING 7).
 */

let env: SupabaseEnv;

test.beforeAll(() => {
  env = requireSupabaseEnv();
});

const watches: AccountFailureWatch[] = [];

function watchPage(page: Page): void {
  watches.push(watchAccountFailures(page));
}

test.afterEach(() => {
  const seen = [...watches];
  watches.length = 0;
  expectOnlyKnownAccountFailures(seen);
});

/**
 * The failure watcher is armed AFTER sign-in, deliberately — see
 * `plan-port-truth.spec.ts` for the full reasoning (a client-side
 * `router.push("/")` lands on the home before the provider has a session, and
 * a 401 for a caller with no session is the grant working).
 */
async function openSignedInToday(
  page: Page,
  user: SeededUser,
): Promise<AccountClient> {
  await stubParseCaptureRoute(page);
  await pinMomentPreference(page, "start");
  await signIn(page, user);
  watchPage(page);

  const account = await accountClient(page, user, env);
  await purgeOwnRows(account);
  // Not in the shared PURGE_ORDER (no other spec writes them); purged here so
  // a second local run against the same stack starts from no policy history.
  await account.purge("suggestion_records");
  await account.purge("override_records");

  await gotoWithAccountSync(page, "/");
  await expect(page.getByTestId("today-moments")).toBeVisible({
    timeout: 30_000,
  });
  return account;
}

/** Capture -> sort -> "Do today": the only route to a do-today task here. */
async function seedDoTodayTask(page: Page, text: string): Promise<void> {
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
  await page
    .getByTestId(/^triage-sheet-today-/)
    .first()
    .click();
  await expect(page.getByTestId("triage-sheet-empty")).toBeVisible({
    timeout: 30_000,
  });
  await page.getByTestId("moment-sheet-close").click();
  await expect(page.getByTestId("moment-sheet")).toHaveCount(0);
}

async function openReviewSheet(page: Page): Promise<void> {
  await page.getByTestId("pipeline-overview-stage-review").click();
  await expect(page.getByTestId("review-sheet")).toBeVisible({
    timeout: 20_000,
  });
}

interface TaskRow {
  id: string;
  title: string;
  status: string;
}

async function taskStatuses(
  account: AccountClient,
): Promise<Record<string, string>> {
  const rows = await account.rows<TaskRow>("tasks?select=id,title,status");
  return Object.fromEntries(rows.map((row) => [row.title, row.status]));
}

/** The number the headline prints, parsed out of it. */
async function headlineCount(page: Page): Promise<number | null> {
  const text = (await page.getByTestId("review-sheet-headline").textContent())!;
  const match = text.match(/\d+/);
  return match ? Number(match[0]) : null;
}

test.describe("C2-S3 — the ported Review surface, signed in", () => {
  test(`${SIGNED_IN_TAG} put off -> carry forward -> drop -> close the day, each one landing in the account and none of them ending the review`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const account = await openSignedInToday(page, SEEDED_USERS.a);
    const A = "Ported review: the one to put off";
    const B = "Ported review: the one to drop";
    await seedDoTodayTask(page, A);
    await seedDoTodayTask(page, B);

    // Every control below is addressed by its OWN task id, never by list
    // position: the list re-orders as decisions land (do-today items come
    // before put-off ones), so `.first()` would silently drift onto the wrong
    // card and the assertion after it would be about a task nobody clicked.
    const ids = Object.fromEntries(
      (await account.rows<TaskRow>("tasks?select=id,title")).map((row) => [
        row.title,
        row.id,
      ]),
    );

    await openReviewSheet(page);

    // FINDING 5: the number the headline prints IS the length of the list it
    // heads. Both are read off the live screen, not off a fixture.
    await expect(page.getByTestId(/^review-sheet-decision-/)).toHaveCount(2, {
      timeout: 20_000,
    });
    expect(await headlineCount(page)).toBe(2);
    await expect(page.getByTestId("review-sheet-headline")).not.toContainText(
      "carry over",
    );

    // PUT OFF (the legacy "Defer").
    await page.getByTestId(`review-sheet-defer-${ids[A]}`).click();
    await expect
      .poll(async () => (await taskStatuses(account))[A], { timeout: 30_000 })
      .toBe("backlog");

    // FINDING 6, asserted after every single decision: the review is still
    // here, the other item is still decidable, and the day can still be closed.
    await expect(page.getByTestId("review-sheet")).toBeVisible();
    await expect(page.getByTestId("review-sheet-close-day")).toBeVisible();
    await expect(page.getByTestId(/^review-sheet-decision-/)).toHaveCount(2);

    // CARRY FORWARD — the same task, now listed as put off, comes back.
    await page.getByTestId(`review-sheet-carry-forward-${ids[A]}`).click();
    await expect
      .poll(async () => (await taskStatuses(account))[A], { timeout: 30_000 })
      .toBe("active");
    await expect(page.getByTestId("review-sheet")).toBeVisible();
    await expect(page.getByTestId("review-sheet-close-day")).toBeVisible();

    // DROP.
    await page.getByTestId(`review-sheet-drop-${ids[B]}`).click();
    await expect
      .poll(async () => (await taskStatuses(account))[B], { timeout: 30_000 })
      .toBe("dropped");
    await expect(page.getByTestId("review-sheet")).toBeVisible();

    // The count follows its list down.
    await expect(page.getByTestId(/^review-sheet-decision-/)).toHaveCount(1, {
      timeout: 20_000,
    });
    expect(await headlineCount(page)).toBe(1);

    // CLOSE THE DAY — C1's single path, reached from this surface.
    const day = await localDay(page);
    expect(
      await account.rows("review_entries?select=id&review_type=eq.daily"),
    ).toEqual([]);

    await page.getByTestId("review-sheet-close-day").click();

    await expect
      .poll(
        async () =>
          (
            await account.rows<{ review_type: string; period_start: string }>(
              "review_entries?select=review_type,period_start",
            )
          ).map((row) => `${row.review_type}:${row.period_start}`),
        { timeout: 30_000 },
      )
      .toEqual([`daily:${day}`]);

    // C1 audit P0#4: the action is spent and replaced by the verdict, on this
    // surface too — not merely disabled.
    await expect(page.getByTestId("review-sheet-verdict")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId("review-sheet-close-day")).toHaveCount(0);
  });

  test(`${SIGNED_IN_TAG} C2 Target Card 2: the Review surface is in the URL, and refresh, Back and Forward all agree`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openSignedInToday(page, SEEDED_USERS.a);

    await openReviewSheet(page);
    expect(new URL(page.url()).searchParams.get("sheet")).toBe("review");

    await reloadWithAccountSync(page);
    await expect(page.getByTestId("review-sheet")).toBeVisible({
      timeout: 30_000,
    });

    await page.goBack();
    await expect(page.getByTestId("review-sheet")).toHaveCount(0, {
      timeout: 20_000,
    });
    expect(new URL(page.url()).searchParams.get("sheet")).toBeNull();

    await page.goForward();
    await expect(page.getByTestId("review-sheet")).toBeVisible({
      timeout: 20_000,
    });
    expect(new URL(page.url()).searchParams.get("sheet")).toBe("review");

    await page.getByTestId("moment-sheet-close").click();
    await expect(page.getByTestId("review-sheet")).toHaveCount(0, {
      timeout: 20_000,
    });
    await expect
      .poll(() => new URL(page.url()).searchParams.get("sheet"), {
        timeout: 10_000,
      })
      .toBeNull();
  });

  test(`${SIGNED_IN_TAG} the sections the inventory could not drive: waiting on, commitments, and a finished session`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const account = await openSignedInToday(page, SEEDED_USERS.a);
    const WAITING = "Ported review: waiting on the landlord";
    const OWED = "Ported review: the thing I promised";
    await seedDoTodayTask(page, WAITING);
    await seedDoTodayTask(page, OWED);

    const tasks = await account.rows<TaskRow>("tasks?select=id,title,status");
    const waiting = tasks.find((row) => row.title === WAITING)!;
    const owed = tasks.find((row) => row.title === OWED)!;

    // No UI writes these columns — they exist to be READ here. Seeded with the
    // browser's own JWT, so RLS is exercised exactly as the app exercises it.
    const [person] = await account.insert<{ id: string }>("people", [
      {
        user_id: SEEDED_USERS.a.id,
        display_name: "The landlord",
        normalized_name: "the landlord",
      },
    ]);
    const eightDaysAgo = new Date(
      Date.now() - 8 * 24 * 60 * 60 * 1000,
    ).toISOString();
    await account.patch(`tasks?id=eq.${waiting.id}`, {
      waiting_on_person_id: person.id,
      waiting_on_since: eightDaysAgo,
    });
    await account.patch(`tasks?id=eq.${owed.id}`, { is_commitment: true });

    // A finished focus session, so planned-vs-actual has something real to
    // compare — and a BLOCKLESS one, the audit P0#2 shape whose missing
    // `planned_minutes` the legacy bar drew as a perfect 100%.
    await account.insert("execution_sessions", [
      {
        user_id: SEEDED_USERS.a.id,
        area_id: (
          await account.rows<{ id: string }>("areas?select=id&limit=1")
        )[0].id,
        task_id: owed.id,
        calendar_block_id: null,
        planned_minutes: null,
        actual_minutes: 25,
        status: "completed",
        outcome: "completed",
        notes: "Finished without a planned length.",
      },
    ]);

    await reloadWithAccountSync(page);
    await openReviewSheet(page);

    await expect(
      page.getByTestId(`review-sheet-aging-${waiting.id}`),
    ).toContainText("Waiting 8 days", { timeout: 30_000 });
    await expect(
      page.getByTestId(`review-sheet-commitment-${owed.id}`),
    ).toContainText(OWED, { timeout: 20_000 });

    // The blockless session shows its own time and NO bar — the comparison
    // does not exist, so none is drawn.
    const sessions = page.getByTestId("review-sheet-sessions");
    await expect(sessions).toContainText("25 min", { timeout: 20_000 });
    await expect(sessions).not.toContainText("/0");
    await expect(page.getByTestId(/^review-sheet-session-noplan-/)).toHaveCount(
      1,
    );
  });

  test(`${SIGNED_IN_TAG} policy proposals: earned by three rejections, decided on the review surface`, async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const account = await openSignedInToday(page, SEEDED_USERS.a);
    await seedDoTodayTask(page, "Ported review: the policy pattern");

    // `scanOverridePatterns` proposes when 3 of the last 5 decisions on one
    // (policy, area) were overrides. Rejecting a drafted block writes
    // `override_type: "rejected"` on `planning.default_time_block` — the app's
    // own path, so nothing here is hand-written.
    await page.getByTestId("pipeline-overview-stage-plan").click();
    await expect(page.getByTestId("plan-sheet")).toBeVisible({
      timeout: 20_000,
    });
    for (let i = 0; i < 3; i += 1) {
      await page.getByTestId("plan-sheet-draft-block").click();
      await expect(
        page.getByTestId(/^plan-sheet-proposal-reject-/),
      ).toHaveCount(1, { timeout: 20_000 });
      await page
        .getByTestId(/^plan-sheet-proposal-reject-/)
        .first()
        .click();
      await expect(page.getByTestId("plan-sheet-proposals-empty")).toBeVisible({
        timeout: 20_000,
      });
    }

    await expect
      .poll(
        async () =>
          (
            await account.rows<{ override_type: string }>(
              "override_records?select=override_type&policy_identifier=eq.planning.default_time_block",
            )
          ).filter((row) => row.override_type === "rejected").length,
        { timeout: 30_000 },
      )
      .toBeGreaterThanOrEqual(3);

    // `override_records` load once at mount, so the proposal appears after a
    // fresh document load — the same way the legacy screen surfaced it.
    await reloadWithAccountSync(page);
    await openReviewSheet(page);

    const proposal = page.getByTestId(
      "review-sheet-policy-planning.default_time_block",
    );
    await expect(proposal).toBeVisible({ timeout: 30_000 });

    await page
      .getByTestId("review-sheet-policy-approve-planning.default_time_block")
      .click();

    // Approving RECORDS the decision. Nothing changes automatically, and the
    // proposal leaves the surface.
    await expect(proposal).toHaveCount(0, { timeout: 20_000 });
    await expect
      .poll(
        async () =>
          (
            await account.rows(
              "suggestion_records?select=id&policy_identifier=eq.planning.default_time_block",
            )
          ).length,
        { timeout: 30_000 },
      )
      .toBeGreaterThan(0);
  });
});
