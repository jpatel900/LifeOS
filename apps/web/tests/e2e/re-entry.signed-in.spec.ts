import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  SEEDED_USERS,
  SIGNED_IN_TAG,
  accountClient,
  expectOnlyKnownAccountFailures,
  purgeOwnRows,
  reloadWithAccountSync,
  requireSupabaseEnv,
  signIn,
  watchAccountFailures,
  type AccountClient,
  type AccountFailureWatch,
  type SupabaseEnv,
} from "./helpers/signedInAccount";

// Synthetic local seeded users only. CI owns execution; no local browser or DB.
let env: SupabaseEnv;
test.beforeAll(() => {
  env = requireSupabaseEnv();
  if (
    !["127.0.0.1", "localhost", "[::1]"].includes(new URL(env.url).hostname)
  ) {
    throw new Error("The return journey only permits local Supabase.");
  }
});
const watches: AccountFailureWatch[] = [];
test.afterEach(() => {
  expectOnlyKnownAccountFailures(watches.splice(0));
});
interface TaskRow {
  id: string;
  title: string;
  status: string;
  area_id: string;
}
interface EventRow {
  user_id: string;
  suggestion_type: string;
  status: string;
  subject_id: string | null;
  area_id: string | null;
  suggestion_json: Record<string, unknown>;
}
async function prepareReturn(page: Page, full = false) {
  await signIn(page, SEEDED_USERS.a);
  watches.push(watchAccountFailures(page));
  const account = await accountClient(page, SEEDED_USERS.a, env);
  await purgeOwnRows(account);
  const [area] = await account.rows<{ id: string }>(
    "areas?select=id&is_active=eq.true&limit=1",
  );
  expect(area).toBeTruthy();
  // Pin this journey's actual date/time without changing the live auth clock.
  // The existing server trigger owns learning record timestamps.
  const now = new Date();
  const old = new Date(now.getTime() - 5 * 86400_000).toISOString();
  const [task] = await account.insert<TaskRow>("tasks", [
    {
      user_id: SEEDED_USERS.a.id,
      area_id: area.id,
      title: "Prepare a synthetic return draft",
      status: "backlog",
      first_tiny_step: "Open the draft",
    },
  ]);
  if (full) {
    await account.insert(
      "tasks",
      [1, 2, 3].map((index) => ({
        user_id: SEEDED_USERS.a.id,
        area_id: area.id,
        title: `Synthetic active work ${index}`,
        status: "active",
        first_tiny_step: "Read one line",
      })),
    );
  }
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("lifeos.moments.reentry"))
        localStorage.removeItem(key);
    }
    localStorage.setItem("lifeos.reentry.thresholdDays", "3");
    sessionStorage.clear();
  });
  // Authenticated inserts are server-stamped. This fixture is an unfinished
  // device return backed by real owned rows, rather than invented DB age.
  // Detection/first-open boundaries are proved by the separate unit tests.
  await page.evaluate(
    ({ userId, task, now, old, full }) => {
      localStorage.setItem(
        `lifeos.moments.reentry.${userId}.unfinished`,
        JSON.stringify({
          version: 1,
          scope: userId,
          instanceId: `synthetic-return-${task.id}`,
          openedAt: now,
          absence: { absent: true, absenceDays: 5, lastActivityAt: old },
          summary: {
            absenceDays: 5,
            lapsedBlocks: [],
            counts: {
              lapsedBlocks: 0,
              pendingTriage: 0,
              activeTasks: full ? 3 : 0,
            },
            stalest: {
              kind: "task",
              id: task.id,
              label: task.title,
              ageDays: 5,
            },
          },
          plan: { taskDeferrals: [], blockUnplans: [], requiresApproval: [] },
          attempted: false,
          demoMode: false,
          outcomes: [],
          selectedTaskId: task.id,
          edits: {},
        }),
      );
    },
    { userId: SEEDED_USERS.a.id, task, now: now.toISOString(), old, full },
  );
  await page.clock.setFixedTime(now);
  await reloadWithAccountSync(page);
  await expect(page.getByTestId("re-entry-ritual")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId("re-entry-ritual-recovery")).toHaveCount(1);
  await expect(page.getByTestId("re-entry-ritual-recovery")).toContainText(
    task.title,
  );
  return { account, task, now, instanceId: `synthetic-return-${task.id}` };
}
async function records(account: AccountClient, instanceId: string) {
  return (
    await account.rows<EventRow>(
      "suggestion_records?select=user_id,suggestion_type,status,subject_id,area_id,suggestion_json&policy_identifier=eq.re_entry.v1",
    )
  ).filter((row) => row.suggestion_json.instance_id === instanceId);
}
async function resolution(account: AccountClient, instanceId: string) {
  let rows: EventRow[] = [];
  await expect
    .poll(
      async () => {
        rows = (await records(account, instanceId)).filter(
          (row) => row.suggestion_type === "re_entry_recovery",
        );
        return rows.length;
      },
      { timeout: 20_000 },
    )
    .toBe(1);
  return rows[0];
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`${SIGNED_IN_TAG} resume a device return, edit, reload and accept at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const { account, task, instanceId } = await prepareReturn(page);
    const edit = page.getByRole("button", { name: "Edit first step" });
    await edit.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByLabel("First step")).toBeFocused();
    await page.getByLabel("First step").fill("Write one opening sentence");
    await page.getByRole("button", { name: "Save first step" }).click();
    await expect(edit).toBeFocused();
    await expect(page.getByTestId("re-entry-first-step")).toHaveText(
      "Write one opening sentence",
    );
    await expect
      .poll(
        async () =>
          (
            await account.rows<{
              override_type: string;
              area_id: string;
              subject_id: string;
              new_value_json: Record<string, unknown>;
            }>(
              "override_records?select=override_type,area_id,subject_id,new_value_json&policy_identifier=eq.re_entry.v1",
            )
          ).filter((row) => row.new_value_json.instance_id === instanceId)
            .length,
      )
      .toBe(1);
    const [override] = (
      await account.rows<{
        override_type: string;
        area_id: string;
        subject_id: string;
        new_value_json: Record<string, unknown>;
      }>(
        "override_records?select=override_type,area_id,subject_id,new_value_json&policy_identifier=eq.re_entry.v1",
      )
    ).filter((row) => row.new_value_json.instance_id === instanceId);
    expect(override).toMatchObject({
      override_type: "edited",
      area_id: task.area_id,
      subject_id: task.id,
      new_value_json: {
        first_step: "Write one opening sentence",
        scope: "device_proposal",
      },
    });
    await reloadWithAccountSync(page);
    await expect(page.getByTestId("re-entry-first-step")).toHaveText(
      "Write one opening sentence",
    );
    await expect(page.getByTestId("re-entry-ritual-recovery")).toHaveCount(1);
    await expect(
      page
        .getByTestId("re-entry-ritual")
        .locator('[style*="state-risk"], .text-destructive'),
    ).toHaveCount(0);
    const accessibility = await new AxeBuilder({ page })
      .include('[data-testid="re-entry-ritual"]')
      .analyze();
    expect(accessibility.violations).toEqual([]);
    for (const button of await page
      .getByTestId("re-entry-ritual")
      .getByRole("button")
      .all()) {
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await page.getByTestId("re-entry-ritual-recovery-accept").click();
    await expect(page.getByTestId("re-entry-ritual")).toHaveCount(0);
    expect(await resolution(account, instanceId)).toMatchObject({
      user_id: SEEDED_USERS.a.id,
      status: "accepted",
      subject_id: task.id,
      area_id: task.area_id,
      suggestion_json: {
        resolution: "accepted",
        first_step: "Write one opening sentence",
        edited: true,
        scope: "device_activation",
        account_save_confirmed: false,
      },
    });
    expect(
      (await records(account, instanceId)).filter(
        (row) => row.suggestion_type === "re_entry_return",
      ),
    ).toHaveLength(1);
    await expect
      .poll(
        async () =>
          (
            await account.rows<TaskRow>(
              `tasks?select=id,title,status,area_id&id=eq.${task.id}`,
            )
          )[0]?.status,
      )
      .toBe("active");
    // Account activation and telemetry are separate proofs, never one receipt.
    await reloadWithAccountSync(page);
    await expect(page.getByTestId("re-entry-ritual")).toHaveCount(0);
  });
}

test(`${SIGNED_IN_TAG} resume a device return and dismiss without activating it`, async ({
  page,
}) => {
  const { account, task, instanceId } = await prepareReturn(page);
  await page.getByTestId("re-entry-ritual-recovery-not-now").click();
  await expect(page.getByTestId("re-entry-ritual")).toHaveCount(0);
  expect(await resolution(account, instanceId)).toMatchObject({
    status: "ignored",
    suggestion_json: { resolution: "dismissed" },
  });
  expect(
    (
      await account.rows<TaskRow>(
        `tasks?select=id,title,status,area_id&id=eq.${task.id}`,
      )
    )[0].status,
  ).toBe("backlog");
});

test(`${SIGNED_IN_TAG} resume a device return, refuse at capacity, then retry successfully`, async ({
  page,
}) => {
  const { account, task, instanceId } = await prepareReturn(page, true);
  await page.getByTestId("re-entry-ritual-recovery-accept").click();
  await expect(page.getByTestId("re-entry-ritual")).toBeVisible();
  await expect(page.getByTestId("today-moments-toast")).toContainText(
    "Today is full",
  );
  await expect(page.getByTestId("today-moments-toast")).not.toContainText(
    "first move queued",
  );
  expect(
    (await records(account, instanceId)).filter(
      (row) => row.suggestion_type === "re_entry_recovery",
    ),
  ).toEqual([]);
  const [active] = await account.rows<TaskRow>(
    "tasks?select=id,title,status,area_id&status=eq.active&limit=1",
  );
  await account.patch(`tasks?id=eq.${active.id}`, { status: "backlog" });
  await reloadWithAccountSync(page);
  await expect(page.getByTestId("re-entry-ritual-recovery")).toContainText(
    task.title,
  );
  await page.getByTestId("re-entry-ritual-recovery-accept").click();
  await expect(page.getByTestId("re-entry-ritual")).toHaveCount(0);
  expect(await resolution(account, instanceId)).toMatchObject({
    status: "accepted",
    subject_id: task.id,
  });
  await expect
    .poll(
      async () =>
        (
          await account.rows<TaskRow>(
            `tasks?select=id,title,status,area_id&id=eq.${task.id}`,
          )
        )[0]?.status,
    )
    .toBe("active");
});
