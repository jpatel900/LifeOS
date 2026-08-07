import { expect, test, type Page } from "@playwright/test";
import { pinMomentPreference } from "./helpers/momentPreference";
import { stubParseCaptureRoute } from "./helpers/mockParseCapture";
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
 * Final UX Loop C2-S5 (#687) — the ported All-areas surface, at the signed-in
 * tier.
 *
 * The C2-S1 capability inventory drove `/areas` signed in (Screen 4) and found
 * its per-area open counts arithmetically correct but its **To triage** column
 * structurally blind: with one unsorted capture in the account it rendered
 * *"Nothing is waiting for a decision."* (FINDING 2). This file proves the
 * ported surface against rows read back out of Postgres with the browser's own
 * JWT, so "ported" means the capability survived and the lie did not.
 *
 * What is pinned here, and none of it was true of the legacy screen:
 *
 *  - the surface shows the account's real work, INCLUDING the unsorted capture
 *    the legacy column could not see;
 *  - the number on an area's pill is made of the rows on the same screen;
 *  - **#691**: with "All areas" chosen, both areas are counted — the moments
 *    home's Pipeline rail used to fall back to `state.areas[0]` and describe
 *    area 1 under a picker reading "All areas";
 *  - **C2 Target Card 2**: the surface is URL-visible, and refresh, Back and
 *    Forward agree with each other and with the screen.
 *
 * Assertions are anchored on IDENTITY — the exact text a capture was given,
 * and which area's pill moved — never on a bare row count. That is the whole
 * lesson of the surface this replaces: its numbers were right about the wrong
 * nouns.
 *
 * No allowlist is added and `helpers/signedInAccount.ts` is untouched: this
 * drive fires no deliberate-failure probes (unlike Health's four liveness
 * 400s), so the shared guard covers every call it makes, unwidened.
 */

let env: SupabaseEnv;

test.beforeAll(() => {
  env = requireSupabaseEnv();
});

const watches: AccountFailureWatch[] = [];

test.afterEach(() => {
  const seen = [...watches];
  watches.length = 0;
  expectOnlyKnownAccountFailures(seen);
});

/** Seeded workflow-area ids (`lib/workflowAreaMapping.ts` maps slug -> id). */
const MAIN_JOB = "area-main-job";
const PERSONAL = "area-personal";

/**
 * The watcher is armed AFTER sign-in, for the reason `plan-port-truth`
 * documents: the pre-session window issues a handful of unauthenticated reads
 * that Postgres correctly answers 401, and watching those would report the
 * grant working as though it were broken.
 */
async function openSignedInToday(
  page: Page,
  user: SeededUser,
): Promise<AccountClient> {
  await stubParseCaptureRoute(page);
  await pinMomentPreference(page, "start");
  await signIn(page, user);
  watches.push(watchAccountFailures(page));

  const account = await accountClient(page, user, env);
  await purgeOwnRows(account);

  await gotoWithAccountSync(page, "/");
  await expect(page.getByTestId("today-moments")).toBeVisible({
    timeout: 30_000,
  });
  return account;
}

/** Puts the shared area selection on a named area (or All areas). */
async function selectArea(page: Page, areaId: string | null): Promise<void> {
  await page.getByTestId("today-moments-area-switcher").click();
  await expect(page.getByTestId("area-selector-listbox")).toBeVisible({
    timeout: 10_000,
  });
  await page.getByTestId(`area-selector-option-${areaId ?? "all"}`).click();
  await expect(page.getByTestId("area-selector-listbox")).toHaveCount(0, {
    timeout: 10_000,
  });
}

/** Captures a thought into whichever area is currently in scope. */
async function capture(page: Page, text: string): Promise<void> {
  await page.getByTestId("capture-affordance").click();
  await page.getByTestId("capture-overlay-textarea").fill(text);
  await page.getByTestId("capture-overlay-save").click();
  await expect(page.getByTestId("capture-overlay")).toHaveCount(0, {
    timeout: 20_000,
  });
}

async function openAreasSheet(page: Page): Promise<void> {
  await page.getByTestId("side-rail-open-areas").click();
  await expect(page.getByTestId("areas-sheet")).toBeVisible({
    timeout: 20_000,
  });
}

interface CaptureRow {
  id: string;
  raw_text: string;
  area_id: string;
}

test.describe("C2-S5 — the ported All-areas surface, signed in", () => {
  test(`${SIGNED_IN_TAG} shows work the account really holds, including the capture the legacy column could not see (FINDING 2)`, async ({
    page,
  }) => {
    const account = await openSignedInToday(page, SEEDED_USERS.a);
    await selectArea(page, MAIN_JOB);

    const text = `Book the dentist ${Date.now()}`;
    await capture(page, text);

    // The row really reached Postgres under this user's own RLS — the claim on
    // screen is checked against the account, not against the UI's own memory.
    await expect
      .poll(
        async () =>
          (
            await account.rows<CaptureRow>(
              "capture_items?select=id,raw_text,area_id",
            )
          ).some((row) => row.raw_text === text),
        { timeout: 30_000 },
      )
      .toBe(true);

    await openAreasSheet(page);

    // THE FINDING 2 REGRESSION. The legacy screen rendered "Nothing is waiting
    // for a decision." for exactly this state.
    const decide = page.getByTestId("areas-sheet-column-decide");
    await expect(decide).toContainText(text, { timeout: 20_000 });
    await expect(page.getByTestId("areas-sheet-empty-decide")).toHaveCount(0);

    // The number on the pill is made of the rows on screen: Main Job's pill
    // says 1 open, and the one row in the open columns is this capture.
    await expect(
      page.getByTestId(`areas-sheet-pill-${MAIN_JOB}`),
    ).toHaveAttribute("aria-label", /: 1 open\./);
    await expect(
      page.getByTestId(`areas-sheet-pill-${PERSONAL}`),
    ).toHaveAttribute("aria-label", /: 0 open\./);
  });

  test(`${SIGNED_IN_TAG} #691: with All areas chosen, BOTH areas are counted — not just the first`, async ({
    page,
  }) => {
    await openSignedInToday(page, SEEDED_USERS.a);

    const stamp = Date.now();
    const inMainJob = `Main job thought ${stamp}`;
    const inPersonal = `Personal thought ${stamp}`;

    await selectArea(page, MAIN_JOB);
    await capture(page, inMainJob);
    await selectArea(page, PERSONAL);
    await capture(page, inPersonal);

    // Nothing selected. Before this slice `buildPipelineCounts` fell back to
    // `state.areas[0]`, so this rail read 1 while the picker above it said
    // "All areas" — the residual #691's own fix left open.
    await selectArea(page, null);
    await expect(
      page.getByTestId("pipeline-overview-count-capture"),
    ).toHaveText("2", { timeout: 20_000 });

    // And the ported surface agrees, by identity: both thoughts are on it, each
    // attributed to its own area's pill.
    await openAreasSheet(page);
    const decide = page.getByTestId("areas-sheet-column-decide");
    await expect(decide).toContainText(inMainJob, { timeout: 20_000 });
    await expect(decide).toContainText(inPersonal);
    await expect(
      page.getByTestId(`areas-sheet-pill-${MAIN_JOB}`),
    ).toHaveAttribute("aria-label", /: 1 open\./);
    await expect(
      page.getByTestId(`areas-sheet-pill-${PERSONAL}`),
    ).toHaveAttribute("aria-label", /: 1 open\./);
    // The "All areas" pill states the same total the rail does.
    await expect(page.getByTestId("areas-sheet-pill-all")).toContainText("2");
  });

  test(`${SIGNED_IN_TAG} picking an area here scopes the whole app, then the surface gets out of the way`, async ({
    page,
  }) => {
    await openSignedInToday(page, SEEDED_USERS.a);
    await selectArea(page, null);
    await openAreasSheet(page);

    await page.getByTestId(`areas-sheet-pill-${PERSONAL}`).click();

    // The sheet closes, because this surface is global: staying open would
    // answer the click with no visible change at all.
    await expect(page.getByTestId("areas-sheet")).toHaveCount(0, {
      timeout: 20_000,
    });
    // And the ONE shared selection moved — read off the masthead picker every
    // other surface reads (#691's single source of truth).
    await expect(page.getByTestId("today-moments-area-switcher")).toContainText(
      "Personal",
      { timeout: 20_000 },
    );
    await expect(page.getByTestId("today-moments")).toBeVisible();
  });

  test(`${SIGNED_IN_TAG} C2 Target Card 2: the All-areas surface is in the URL, and refresh, Back and Forward all agree`, async ({
    page,
  }) => {
    await openSignedInToday(page, SEEDED_USERS.a);

    // Opening from the rail puts the surface in the address bar. Before this
    // slice there was no way in from the moments shell at all.
    await openAreasSheet(page);
    expect(new URL(page.url()).searchParams.get("sheet")).toBe("areas");

    // Refresh lands on the same surface.
    await reloadWithAccountSync(page);
    await expect(page.getByTestId("areas-sheet")).toBeVisible({
      timeout: 30_000,
    });

    // Back closes it and clears the param — it does NOT leave the home.
    await page.goBack();
    await expect(page.getByTestId("areas-sheet")).toHaveCount(0, {
      timeout: 20_000,
    });
    expect(new URL(page.url()).searchParams.get("sheet")).toBeNull();
    await expect(page.getByTestId("today-moments")).toBeVisible();

    // Forward re-opens exactly the same surface.
    await page.goForward();
    await expect(page.getByTestId("areas-sheet")).toBeVisible({
      timeout: 20_000,
    });
    expect(new URL(page.url()).searchParams.get("sheet")).toBe("areas");

    // And the sheet's own Close returns the URL to the home.
    await page.getByTestId("moment-sheet-close").click();
    await expect(page.getByTestId("areas-sheet")).toHaveCount(0, {
      timeout: 20_000,
    });
    await expect
      .poll(() => new URL(page.url()).searchParams.get("sheet"), {
        timeout: 10_000,
      })
      .toBeNull();
  });

  test(`${SIGNED_IN_TAG} a direct link to ?sheet=areas opens it, with no trip through the legacy shell`, async ({
    page,
  }) => {
    await openSignedInToday(page, SEEDED_USERS.a);

    await gotoWithAccountSync(page, "/?sheet=areas");
    await expect(page.getByTestId("areas-sheet")).toBeVisible({
      timeout: 30_000,
    });
    // The moments home is what rendered it — not a cockpit route.
    await expect(page.getByTestId("today-moments")).toBeVisible();
    await expect(page.getByTestId("lifeos-cockpit")).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe("/");

    // Every legacy column is present on the ported surface, not merely named
    // in a commit message.
    for (const id of ["decide", "plan", "scheduled", "done"]) {
      await expect(page.getByTestId(`areas-sheet-column-${id}`)).toBeVisible();
    }
  });
});
