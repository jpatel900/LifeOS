import { expect, test, type Page } from "@playwright/test";
import { stubParseCaptureRoute } from "./helpers/mockParseCapture";
import { pinMomentPreference } from "./helpers/momentPreference";
import {
  SEEDED_USERS,
  SIGNED_IN_TAG,
  accountClient,
  expectOnlyKnownAccountFailures,
  gotoWithAccountSync,
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
 * Final UX Loop C2-S2 (#687) — the ported Plan surface, at the signed-in tier.
 *
 * The C2-S1 capability inventory verified `/calendar`'s placement, unplan and
 * proposal controls against real PostgREST writes. This file proves the SAME
 * claims about the ported surface on the moments home, read back out of
 * Postgres with the browser's own JWT — so "ported" means the capability
 * survived, not that a button with a similar name exists.
 *
 * Two things are pinned here that the legacy screen never had:
 *
 *  - **C2 Target Card 2** — the surface is URL-visible, and refresh, Back and
 *    Forward agree with each other and with the screen.
 *  - the placement path itself, end to end, from the home rather than from
 *    `/calendar`.
 *
 * ## Where FINDING 1 is pinned, and why not here
 *
 * FINDING 1 (the rail invited a placement it would refuse) needs a do-today
 * task with NO first move. Every task this tier can reach comes through
 * `/api/parse-capture`, whose stub always supplies one
 * (`helpers/mockParseCapture.ts:45`), so the state is unreachable from a
 * signed-in drive without writing a row out of band — which would prove the
 * spec's own PATCH, not the app. It is pinned instead at the unit tier through
 * the real reducer and the real provider (`PlanSheet.test.tsx`: the honest
 * label, the refused placement, and the recovery focus) plus the pure rule
 * (`planRail.test.ts`).
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
 * The failure watcher is armed AFTER sign-in, deliberately.
 *
 * `signIn` finishes with `/login`'s own `router.push("/")` — a CLIENT-side
 * navigation that lands on the home before `WorkflowProvider`'s one-shot sync
 * has a session (that is exactly why `signIn` then does a full reload; see its
 * doc comment). In that window the app issues `GET /areas`,
 * `GET /rollup_summaries` and `POST /brief_views` unauthenticated, and Postgres
 * correctly answers 401. Measured on this branch: those four 401s appear only
 * when the run is cold (they showed up on the first test of a full-tier run and
 * not when this file ran alone), which is what makes them a timing artefact of
 * signing in rather than evidence about the drive.
 *
 * A 401 for a caller with no session is the grant working, not a broken one —
 * so watching it would report the opposite of what the guard exists to say. The
 * guard itself is untouched and still covers every call this spec's drive makes.
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

  await gotoWithAccountSync(page, "/");
  await expect(page.getByTestId("today-moments")).toBeVisible({
    timeout: 30_000,
  });
  return account;
}

/**
 * Capture -> sort -> "Do today": the only route to a do-today task here. The
 * parse stub supplies a first move, so the task arrives ready to place.
 */
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

async function openPlanSheet(page: Page): Promise<void> {
  await page.getByTestId("pipeline-overview-stage-plan").click();
  await expect(page.getByTestId("plan-sheet")).toBeVisible({ timeout: 20_000 });
}

interface BlockRow {
  id: string;
  status: string;
  task_id: string | null;
  proposal_id?: string | null;
}
interface TaskRow {
  id: string;
  status: string;
  first_tiny_step: string | null;
}
interface ProposalRow {
  id: string;
  status: string;
  rationale_json: { note?: string } | null;
}

const PROPOSAL_SELECT = "time_block_proposals?select=id,status,rationale_json";

/** Account-held proposal statuses, sorted so the assertion is order-free. */
async function proposalStatuses(account: AccountClient): Promise<string[]> {
  return (await account.rows<ProposalRow>(PROPOSAL_SELECT))
    .map((row) => row.status)
    .sort();
}

test.describe("C2-S2 — the ported Plan surface, signed in", () => {
  test(`${SIGNED_IN_TAG} place -> the rail shows it -> take it off -> the account agrees at every step`, async ({
    page,
  }) => {
    const account = await openSignedInToday(page, SEEDED_USERS.a);
    await seedDoTodayTask(page, "Ported plan: place a block from the home");
    await openPlanSheet(page);

    // Positive control: the account holds no block before the tap, so the
    // assertion after it is about this placement and nothing else.
    expect(await account.rows<BlockRow>("calendar_blocks?select=id")).toEqual(
      [],
    );
    await expect(page.getByTestId("plan-sheet-hour-10")).toContainText(
      "Tap to put it here",
      { timeout: 20_000 },
    );

    // THE PLACEMENT.
    await page.getByTestId("plan-sheet-hour-10").click();
    await expect(page.getByTestId("plan-sheet-hour-10")).toContainText(
      "Tap to take it off",
      { timeout: 20_000 },
    );

    await expect
      .poll(
        async () =>
          (
            await account.rows<BlockRow>(
              "calendar_blocks?select=id,status,task_id",
            )
          ).map((row) => row.status),
        { timeout: 30_000 },
      )
      .toEqual(["scheduled"]);
    await expect
      .poll(
        async () =>
          (await account.rows<TaskRow>("tasks?select=id,status")).map(
            (row) => row.status,
          ),
        { timeout: 30_000 },
      )
      .toEqual(["scheduled"]);

    // It survives a reload — the rail is reading the account, not a screen
    // it just drew.
    // The URL already carries `?sheet=plan` (opening from the rail put it
    // there), so a plain reload is enough to land back on this surface.
    await reloadWithAccountSync(page);
    await expect(page.getByTestId("plan-sheet-hour-10")).toContainText(
      "Tap to take it off",
      { timeout: 30_000 },
    );

    // THE UNPLAN.
    await page.getByTestId("plan-sheet-hour-10").click();
    await expect(page.getByTestId("plan-sheet-hour-10")).not.toContainText(
      "Tap to take it off",
      { timeout: 20_000 },
    );

    await expect
      .poll(
        async () =>
          (
            await account.rows<BlockRow>("calendar_blocks?select=id,status")
          ).map((row) => row.status),
        { timeout: 30_000 },
      )
      .toEqual(["cancelled"]);
    await expect
      .poll(
        async () =>
          (await account.rows<TaskRow>("tasks?select=id,status")).map(
            (row) => row.status,
          ),
        { timeout: 30_000 },
      )
      .toEqual(["active"]);
  });

  test(`${SIGNED_IN_TAG} draft a block, then put it on the rail — the DRAFTED proposal is accepted, the block points at it, nothing is left pending`, async ({
    page,
  }) => {
    const account = await openSignedInToday(page, SEEDED_USERS.a);
    await seedDoTodayTask(page, "Ported plan: draft then accept");

    // POSITIVE CONTROL, in the shape the placement test above uses on
    // `calendar_blocks`. Sorting a capture to "Do today" ALREADY leaves one
    // pending proposal for the task: the triage draft-accept mints a first
    // focus block ("Create one local focus block for the first useful move",
    // `lib/data/workflow/draftAccept.ts`). Naming that row HERE is what makes
    // every assertion below about the draft and nothing else.
    //
    // The first cut of this spec (#804) skipped this control and assumed the
    // account held no proposal, so it asserted a row COUNT that only held when
    // the drafted row lost a race to persist. That accident is why it passed on
    // its branch and red-flagged main twice (reverted by #806). What follows
    // asserts identity, not counts.
    await expect
      .poll(async () => proposalStatuses(account), { timeout: 30_000 })
      .toEqual(["proposed"]);
    const [triageProposal] = await account.rows<ProposalRow>(PROPOSAL_SELECT);

    await openPlanSheet(page);
    await expect(page.getByTestId("plan-sheet-draft-block")).toBeEnabled({
      timeout: 20_000,
    });
    // Triage's proposal must already be ON SCREEN before the draft, so the
    // count assertion after it is about the drafted card and nothing else.
    await expect(page.getByTestId(/^plan-sheet-proposal-accept-/)).toHaveCount(
      1,
      { timeout: 30_000 },
    );

    // THE DRAFT — it reaches the ACCOUNT as its own row, beside triage's.
    await page.getByTestId("plan-sheet-draft-block").click();
    // #853 determinism split: assert the DEVICE truth before the account
    // truth. The drafted card must render (under its device-local id until
    // the sync swaps it) BEFORE the account is asked for a second row. If
    // this assertion fails, the draft never became device state at all —
    // an interaction or reducer problem, and the account poll below would
    // be diagnosing the wrong layer. If it passes and the account poll
    // still times out at one row, the loss is in the persistence path
    // (`persistCreatedLocalProposal`'s silent device-only branch).
    // (the list container's own `li` cards are counted, not the
    // `plan-sheet-proposal-accept-*` buttons inside them).
    await expect(
      page.getByTestId("plan-sheet-proposals").locator("li"),
    ).toHaveCount(2, { timeout: 15_000 });
    await expect
      .poll(async () => proposalStatuses(account), { timeout: 30_000 })
      .toEqual(["proposed", "proposed"]);
    await expect(page.getByTestId(/^plan-sheet-proposal-accept-/)).toHaveCount(
      2,
      { timeout: 30_000 },
    );
    const draftedProposal = (
      await account.rows<ProposalRow>(PROPOSAL_SELECT)
    ).find((row) => row.id !== triageProposal.id);
    expect(draftedProposal?.rationale_json?.note).toContain("Drafted a block");

    // THE ACCEPT — of the DRAFTED card specifically, named by the id the
    // ACCOUNT gave it rather than by diffing the ids on screen.
    //
    // The diff this replaces assumed a card's test id never changes. It does:
    // a proposal renders under a DEVICE-LOCAL id (`proposal-3`) until the
    // account sync swaps in the account row, and that swap lands at an
    // unpredictable moment. Main run 31039290572 failed all three attempts on
    // it — twice the diff named triage's freshly re-keyed control and accepted
    // the WRONG proposal, once the click hit the local-id node in the instant
    // it was replaced ("element was detached from the DOM"). Both shapes
    // reproduced locally: 3 failures in 18 runs.
    //
    // Waiting for the drafted proposal's OWN control is strictly stronger than
    // the diff: it asserts the screen is showing the ACCOUNT's row, under the
    // account's identity, before the tap — and the account uuid never changes
    // again, so the node cannot be swapped out from under the click.
    const draftedAccept = page.getByTestId(
      `plan-sheet-proposal-accept-${draftedProposal?.id}`,
    );
    await expect(
      draftedAccept,
      "the drafted proposal renders its own accept control",
    ).toBeVisible({ timeout: 30_000 });
    await draftedAccept.click();

    // #580 "placement wins": the accepted proposal is the DRAFTED one, and the
    // proposal triage left is superseded — retained as history, never pending.
    await expect
      .poll(async () => proposalStatuses(account), { timeout: 30_000 })
      .toEqual(["accepted", "superseded"]);
    const settled = await account.rows<ProposalRow>(PROPOSAL_SELECT);
    const accepted = settled.filter((row) => row.status === "accepted");
    expect(accepted.map((row) => row.id)).toEqual([draftedProposal?.id]);
    expect(
      settled.filter((row) => row.status === "superseded").map((row) => row.id),
    ).toEqual([triageProposal.id]);
    // Nothing for this task is left awaiting a decision.
    expect(
      settled.filter((row) => ["proposed", "edited"].includes(row.status)),
    ).toEqual([]);

    // Exactly one block, and it points AT the proposal that was accepted —
    // the link the old assertion never checked.
    await expect
      .poll(
        async () =>
          (
            await account.rows<BlockRow>(
              "calendar_blocks?select=id,status,task_id,proposal_id",
            )
          ).map((row) => row.status),
        { timeout: 30_000 },
      )
      .toEqual(["scheduled"]);
    const blocks = await account.rows<BlockRow>(
      "calendar_blocks?select=id,status,task_id,proposal_id",
    );
    expect(blocks.map((row) => row.proposal_id)).toEqual([accepted[0].id]);

    await expect
      .poll(
        async () =>
          (await account.rows<TaskRow>("tasks?select=id,status")).map(
            (row) => row.status,
          ),
        { timeout: 30_000 },
      )
      .toEqual(["scheduled"]);
  });

  test(`${SIGNED_IN_TAG} C2 Target Card 2: the Plan surface is in the URL, and refresh, Back and Forward all agree`, async ({
    page,
  }) => {
    await openSignedInToday(page, SEEDED_USERS.a);

    // Opening from the rail must put the surface in the address bar.
    await openPlanSheet(page);
    expect(new URL(page.url()).searchParams.get("sheet")).toBe("plan");

    // Refresh lands on the same surface.
    await reloadWithAccountSync(page);
    await expect(page.getByTestId("plan-sheet")).toBeVisible({
      timeout: 30_000,
    });

    // Back closes it and clears the param.
    await page.goBack();
    await expect(page.getByTestId("plan-sheet")).toHaveCount(0, {
      timeout: 20_000,
    });
    expect(new URL(page.url()).searchParams.get("sheet")).toBeNull();

    // Forward re-opens exactly the same surface.
    await page.goForward();
    await expect(page.getByTestId("plan-sheet")).toBeVisible({
      timeout: 20_000,
    });
    expect(new URL(page.url()).searchParams.get("sheet")).toBe("plan");

    // And the sheet's own Close returns the URL to the home.
    await page.getByTestId("moment-sheet-close").click();
    await expect(page.getByTestId("plan-sheet")).toHaveCount(0, {
      timeout: 20_000,
    });
    await expect
      .poll(() => new URL(page.url()).searchParams.get("sheet"), {
        timeout: 10_000,
      })
      .toBeNull();
  });
});
