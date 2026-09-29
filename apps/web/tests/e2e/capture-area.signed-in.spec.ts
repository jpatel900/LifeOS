import { expect, test, type Page } from "@playwright/test";
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
  type AccountFailureWatch,
  type SupabaseEnv,
} from "./helpers/signedInAccount";

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

test(`${SIGNED_IN_TAG} an explicitly unassigned capture reaches the account and survives reload`, async ({
  page,
}) => {
  await pinMomentPreference(page, "start");
  const user = SEEDED_USERS.a;
  await signIn(page, user);
  watchPage(page);
  const account = await accountClient(page, user, env);
  await purgeOwnRows(account);
  await gotoWithAccountSync(page, "/?area=all&moment=start");
  await expect(page.getByTestId("today-moments")).toBeVisible();

  const text = "Synthetic volunteer sponsor follow-up";
  await page.getByTestId("capture-affordance").click();
  const dialog = page.getByRole("dialog", { name: "Capture a thought" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Capture thought")).toBeFocused();
  await dialog.getByLabel("Save to area (optional)").selectOption("");
  await expect(dialog.getByTestId("capture-save-destination")).toHaveText(
    "Will save without an area.",
  );
  await dialog.getByLabel("Capture thought").fill(text);
  await dialog.getByTestId("capture-overlay-save").click();
  await expect(dialog).toHaveCount(0, { timeout: 20_000 });

  type CaptureRow = { id: string; area_id: string | null; raw_text: string };
  const ownCaptures = () =>
    account.rows<CaptureRow>("capture_items?select=id,area_id,raw_text");
  await expect
    .poll(async () => await ownCaptures(), { timeout: 30_000 })
    .toEqual([expect.objectContaining({ area_id: null, raw_text: text })]);

  await reloadWithAccountSync(page);
  await expect(page.getByTestId("today-moments-area-switcher")).toContainText(
    "All areas",
  );
  await expect(page.getByTestId("pipeline-overview-count-capture")).toHaveText(
    "1",
  );
  await page.getByTestId("pipeline-overview-stage-capture").click();
  await expect(page.getByRole("dialog", { name: "Triage" })).toBeVisible();
  await expect(page.getByTestId("triage-sheet-captures")).toContainText(text);
  expect((await ownCaptures())[0]?.area_id).toBeNull();
});
