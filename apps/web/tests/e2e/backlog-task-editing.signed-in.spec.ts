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
 * Issue #984 — the accepted-backlog task editor, at the signed-in tier.
 *
 * Follows plan-port-truth.spec.ts's own shape: sign in a seeded user, purge
 * their rows, drive the real UI, and read the result back out of Postgres
 * with the browser's own JWT. Two things only this tier can prove that the
 * device-tier spec (`backlog-task-editing.spec.ts`) and the vitest tiers
 * cannot:
 *
 *  - the guarded `.update()` in `lib/data/workflow/taskEditing.ts` actually
 *    reaches the account row under the real `tasks_update_own` RLS policy
 *    and grants — no schema/RLS/RPC change was made, and this is the proof
 *    the existing grant really does cover title/description/area_id;
 *  - the SAME policy rejects a second user's direct attempt at the same row
 *    (synthetic two-user write isolation), which is the acceptance
 *    criterion's own wording, not a stand-in for it.
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

// Same reasoning as plan-port-truth.spec.ts's identical helper: the watcher
// is armed AFTER sign-in, since the pre-session-hydration window issues a
// handful of expected 401s that are the grant working, not a broken one.
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

async function seedBacklogTask(page: Page, text: string): Promise<void> {
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
}

async function openPlanSheet(page: Page): Promise<void> {
  await page.getByTestId("pipeline-overview-stage-plan").click();
  await expect(page.getByTestId("plan-sheet")).toBeVisible({ timeout: 20_000 });
}

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  area_id: string;
  status: string;
  updated_at: string;
}
interface AreaRow {
  id: string;
  name: string;
}

test.describe("#984 — the accepted-backlog task editor, signed in", () => {
  test(`${SIGNED_IN_TAG} saves title/description/area to the account row under real RLS`, async ({
    page,
  }) => {
    const account = await openSignedInToday(page, SEEDED_USERS.a);
    await seedBacklogTask(page, "Ported edit: reorganize the shelving");

    const [before] = await account.rows<TaskRow>(
      "tasks?select=id,title,description,area_id,status,updated_at",
    );
    expect(before.status).toBe("backlog");
    const areas = await account.rows<AreaRow>("areas?select=id,name");
    const personal = areas.find((area) => area.name === "Personal");
    expect(personal).toBeTruthy();

    await openPlanSheet(page);
    await page.getByTestId(`plan-sheet-edit-${before.id}`).click();
    await page
      .getByTestId(`plan-sheet-edit-title-input-${before.id}`)
      .fill("Sketch next quarter's volunteer rota");
    await page
      .getByTestId(`plan-sheet-edit-description-input-${before.id}`)
      .fill("Include the weekend shifts.");
    await page
      .getByTestId(`plan-sheet-edit-area-input-${before.id}`)
      .selectOption({ label: "Personal" });
    await page.getByTestId(`plan-sheet-edit-save-${before.id}`).click();

    await expect(
      page.getByTestId(`plan-sheet-edit-form-${before.id}`),
    ).toHaveCount(0, { timeout: 20_000 });

    await expect
      .poll(
        async () => {
          const [after] = await account.rows<TaskRow>(
            `tasks?id=eq.${before.id}&select=id,title,description,area_id,status,updated_at`,
          );
          return after;
        },
        { timeout: 30_000 },
      )
      .toMatchObject({
        title: "Sketch next quarter's volunteer rota",
        description: "Include the weekend shifts.",
        area_id: personal!.id,
        status: "backlog",
      });

    const [after] = await account.rows<TaskRow>(
      `tasks?id=eq.${before.id}&select=id,updated_at`,
    );
    expect(after.updated_at).not.toBe(before.updated_at);

    // Reload: the saved fields must survive hydration from the account, not
    // from anything this tab remembered locally.
    await reloadWithAccountSync(page);
    await expect(page.getByTestId("today-moments")).toBeVisible({
      timeout: 30_000,
    });
    await openPlanSheet(page);
    await expect(page.getByTestId("plan-sheet-backlog")).toContainText(
      "Sketch next quarter's volunteer rota",
      { timeout: 20_000 },
    );

    // A second edit, immediately after reload, must succeed. If the version
    // this tab reflected after the first save were a locally-fabricated
    // timestamp rather than the account row's own `updated_at`, this save
    // would be rejected as a false conflict by the account's own
    // `.eq("updated_at", …)` guard.
    await page.getByTestId(`plan-sheet-edit-${before.id}`).click();
    await page
      .getByTestId(`plan-sheet-edit-title-input-${before.id}`)
      .fill("Sketch next quarter's volunteer rota, finalized");
    await page.getByTestId(`plan-sheet-edit-save-${before.id}`).click();

    await expect(
      page.getByTestId(`plan-sheet-edit-form-${before.id}`),
    ).toHaveCount(0, { timeout: 20_000 });
    await expect
      .poll(
        async () => {
          const [row] = await account.rows<TaskRow>(
            `tasks?id=eq.${before.id}&select=title`,
          );
          return row.title;
        },
        { timeout: 30_000 },
      )
      .toBe("Sketch next quarter's volunteer rota, finalized");
  });

  test(`${SIGNED_IN_TAG} a second user's direct PATCH against the same row changes nothing (RLS write isolation)`, async ({
    browser,
  }) => {
    // Both contexts stay open for the whole test: `AccountClient.rows`/
    // `.patch` replay requests through the `Page` they were bound to, which
    // stops working the instant its context closes — so the final readback
    // through `accountA` needs `first` to still be alive.
    const first = await browser.newContext();
    const firstPage = await first.newPage();
    const second = await browser.newContext();
    const secondPage = await second.newPage();

    try {
      const accountA = await openSignedInToday(firstPage, SEEDED_USERS.a);
      await seedBacklogTask(firstPage, "Isolation proof: user A's own task");
      const [row] = await accountA.rows<TaskRow>("tasks?select=id,title");
      const { id: taskId, title: originalTitle } = row;

      const accountB = await openSignedInToday(secondPage, SEEDED_USERS.b);

      // User B's own JWT, aimed directly at user A's row — no UI involved,
      // the same shape a hostile client could attempt against the exact
      // `.update()` this issue adds. `patch()` only throws on a non-2xx
      // response; PostgREST answers 200 with zero rows affected when RLS
      // filters the target out of the WHERE clause, so a non-throw here is
      // NOT yet proof of isolation — the readback below is.
      await expect(
        accountB.patch(`tasks?id=eq.${taskId}`, {
          title: "hijacked by user B",
        }),
      ).resolves.not.toThrow();

      const [after] = await accountA.rows<TaskRow>(
        `tasks?id=eq.${taskId}&select=id,title`,
      );
      expect(after.title).toBe(originalTitle);
    } finally {
      await first.close();
      await second.close();
    }
  });
});
