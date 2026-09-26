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
 * FR-049 (#1025) — "bring a put-off task back on a chosen day", at the
 * signed-in tier.
 *
 * Follows `backlog-task-editing.signed-in.spec.ts`'s own shape (that spec
 * proved the SAME guarded `.update()` in `lib/data/workflow/taskEditing.ts`
 * reaches the account row for title/description/area_id under real RLS —
 * `due_at` rides that identical call with one more column in the same SET
 * clause, so a second RLS-isolation proof would not exercise anything new;
 * this spec only proves what FR-049 itself adds).
 *
 * NO FAKE CLOCK HERE, DELIBERATELY
 * --------------------------------
 * The device-tier spec (`back-today.spec.ts`) uses `page.clock.setFixedTime`
 * to simulate crossing into the return day. This tier runs against a real
 * signed-in Supabase session, whose JWT is checked against the SERVER's real
 * clock (`nbf`/`iat`/`exp` — see this file's own `measurePgrst303Skew`
 * doc comments on clock-skew sensitivity) — faking the BROWSER's clock out
 * from under a live session risks a token validation failure that has
 * nothing to do with FR-049. So this spec proves the exact same "arrived vs.
 * not arrived" boundary using two REAL calendar days instead: tomorrow (not
 * shown) and today (shown), read from the browser's own real clock via
 * `localDay`/`localDayPlus`, never simulated.
 *
 * UNVERIFIED LOCALLY: this worktree has no `NEXT_PUBLIC_SUPABASE_URL`/
 * `NEXT_PUBLIC_SUPABASE_ANON_KEY` set (`requireSupabaseEnv()` throws before
 * the browser opens), so this file could not be run here. CI runs the
 * signed-in project with real seeded-user credentials.
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

async function seedBacklogTask(page: Page, text: string): Promise<string> {
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
    .getByTestId(/^triage-sheet-accept-/)
    .first()
    .click();
  await expect(page.getByTestId("triage-sheet-empty")).toBeVisible({
    timeout: 30_000,
  });
  await page.getByTestId("moment-sheet-close").click();
  await expect(page.getByTestId("moment-sheet")).toHaveCount(0);
  return text;
}

async function openPlanSheet(page: Page): Promise<void> {
  await page.getByTestId("pipeline-overview-stage-plan").click();
  await expect(page.getByTestId("plan-sheet")).toBeVisible({ timeout: 20_000 });
}

interface TaskRow {
  id: string;
  title: string;
  status: string;
  due_at: string | null;
}

const TASK_SELECT = "id,title,status,due_at";

/** Same polling shape `backlog-task-editing.signed-in.spec.ts` uses. */
async function confirmedBacklogTask(
  account: AccountClient,
  expectedTitle: string,
): Promise<TaskRow> {
  let matching: TaskRow[] = [];
  await expect
    .poll(
      async () => {
        const rows = await account.rows<TaskRow>(`tasks?select=${TASK_SELECT}`);
        matching = rows.filter(
          (row) => row.title === expectedTitle && row.status === "backlog",
        );
        return matching.length;
      },
      {
        timeout: 30_000,
        message: `exactly one backlog task titled "${expectedTitle}" never appeared in the account`,
      },
    )
    .toBe(1);
  return matching[0]!;
}

/** The BROWSER's real local calendar day, `days` ahead (never behind — no
 * simulated clock; see this file's doc comment for why). */
async function localDayPlus(page: Page, days: number): Promise<string> {
  return page.evaluate((offset) => {
    const now = new Date();
    now.setDate(now.getDate() + offset);
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }, days);
}

async function setReturnDay(
  page: Page,
  taskId: string,
  dayValue: string,
): Promise<void> {
  await openPlanSheet(page);
  await expect(page.getByTestId(`plan-sheet-edit-${taskId}`)).toBeVisible({
    timeout: 30_000,
  });
  await page.getByTestId(`plan-sheet-edit-${taskId}`).click();
  await page
    .getByTestId(`plan-sheet-edit-due-at-input-${taskId}`)
    .fill(dayValue);
  await page.getByTestId(`plan-sheet-edit-save-${taskId}`).click();
  await expect(page.getByTestId(`plan-sheet-edit-form-${taskId}`)).toHaveCount(
    0,
    { timeout: 20_000 },
  );
  await page.getByTestId("moment-sheet-close").click();
  await expect(page.getByTestId("moment-sheet")).toHaveCount(0);
}

test.describe("#1025 — Back today, signed in", () => {
  test(`${SIGNED_IN_TAG} sets due_at on the account row, hides the task until the real return day, then shows it and Move to today flips it off backlog`, async ({
    page,
  }) => {
    const account = await openSignedInToday(page, SEEDED_USERS.a);
    const seededTitle = await seedBacklogTask(
      page,
      "FR-049: call the plumber about the quote",
    );
    const before = await confirmedBacklogTask(account, seededTitle);
    expect(before.due_at).toBeNull();

    // Set the return day to TOMORROW (a real calendar day, not simulated).
    const tomorrow = await localDayPlus(page, 1);
    await setReturnDay(page, before.id, tomorrow);

    await expect
      .poll(
        async () => {
          const [row] = await account.rows<TaskRow>(
            `tasks?id=eq.${before.id}&select=due_at`,
          );
          return row.due_at;
        },
        { timeout: 30_000 },
      )
      .not.toBeNull();

    // Not shown yet: the return day hasn't arrived.
    await reloadWithAccountSync(page);
    await expect(page.getByTestId("today-moments")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("start-back-today")).toHaveCount(0);

    // Change the return day to TODAY (still a real day, not simulated) —
    // now it has arrived.
    const today = await localDay(page);
    await setReturnDay(page, before.id, today);

    await expect
      .poll(
        async () => {
          const [row] = await account.rows<TaskRow>(
            `tasks?id=eq.${before.id}&select=due_at`,
          );
          return row.due_at ? row.due_at.slice(0, 10) : null;
        },
        { timeout: 30_000 },
      )
      .toBe(today);

    await reloadWithAccountSync(page);
    await expect(page.getByTestId("today-moments")).toBeVisible({
      timeout: 30_000,
    });
    const backToday = page.getByTestId("start-back-today");
    await expect(backToday).toBeVisible({ timeout: 20_000 });
    await expect(backToday).toContainText(seededTitle);

    // Move to today: the existing action, over the account-synced task —
    // removes it from the group, and the account row itself flips off
    // "backlog" (the same persisted transition PlanSheet's own "Move to
    // today" already drives; FR-049 adds no new persistence path here).
    await page.getByTestId(`start-back-today-move-${before.id}`).click();
    await expect(page.getByTestId("start-back-today")).toHaveCount(0, {
      timeout: 20_000,
    });

    await expect
      .poll(
        async () => {
          const [row] = await account.rows<TaskRow>(
            `tasks?id=eq.${before.id}&select=status`,
          );
          return row.status;
        },
        { timeout: 30_000 },
      )
      .not.toBe("backlog");
  });
});
