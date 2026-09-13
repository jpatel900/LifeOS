import { expect, test, type Page } from "@playwright/test";
import {
  ACCOUNT_NEEDS_APP_UPDATE,
  ACCOUNT_SAVE_FAILED,
} from "../../src/lib/statusVocabulary";
import { pinMomentPreference } from "./helpers/momentPreference";
import {
  SEEDED_USERS,
  SIGNED_IN_TAG,
  accountClient,
  expectOnlyKnownAccountFailures,
  gotoWithAccountSync,
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
 * Final UX Loop C2-S4 (#687) — the ported Health surface, at the signed-in tier.
 *
 * The C2-S1 capability inventory drove `/health` signed in and verified its one
 * write (`health_checks` grew when "Check again" was pressed). This file proves
 * the same claim about the ported surface on the moments home, read back out of
 * Postgres with the browser's own JWT — so "ported" means the capability
 * survived, not that a button with a similar name exists.
 *
 * Also pinned here, and never true of the legacy screen:
 *
 *  - **C2 Target Card 2** — Health is URL-visible, and refresh, Back and
 *    Forward agree with each other and with the screen.
 *  - the check is **asked-only**: visiting the home runs no probe and writes no
 *    row; opening the sheet is what asks.
 *
 * ## The four 400s, and why the tolerance is scoped to THIS FILE
 *
 * `lib/data/health.ts`'s `transitionRpcProbes` calls four transition RPCs with
 * a dummy id and EXPECTS each to answer 400 "not found" — that round trip is
 * how the check proves the RPC exists and is reachable under the caller's own
 * RLS. They are intentional product behaviour, verified as such in the S1
 * inventory, so this spec neither silences them nor calls them a defect.
 *
 * S1 predicted the port lane would have to widen
 * `expectOnlyKnownAccountFailures`. It does not, and widening it would be
 * strictly worse. Three of those four RPCs are live write paths that sibling
 * specs depend on catching:
 *
 *   `unplan_calendar_block`         -> PlanSheet's unplan   (plan-port-truth)
 *   `apply_task_review_transition`  -> ReviewSheet's three  (review-port-truth)
 *   `accept_time_block_proposal`    -> the accept path #844 made deterministic
 *
 * A global allowlist on those names would leave those specs unable to notice a
 * genuinely broken unplan or review transition. Since every call site of
 * `expectOnlyKnownAccountFailures` is its own spec's `afterEach` (there is no
 * shared fixture), the tolerance can live HERE, in the one file that
 * deliberately fires the probes, and nowhere else. The shared helper is
 * untouched.
 *
 * The match is exact — status 400, method POST, and the full
 * `/rest/v1/rpc/<name>` suffix. A probe answering 403, 404 or 500 is NOT
 * tolerated and fails this spec, which is the whole point: what is allowed is
 * the one specific response that means the probe worked.
 */

let env: SupabaseEnv;

test.beforeAll(() => {
  env = requireSupabaseEnv();
});

/** The four liveness probes, by RPC name (`lib/data/health.ts`). */
const HEALTH_PROBE_RPCS = [
  "accept_time_block_proposal",
  "start_execution_session",
  "unplan_calendar_block",
  "apply_task_review_transition",
] as const;

/**
 * `watchAccountFailures` records `"<status> <method> <path>"`, path already
 * stripped of its query. Parsed strictly rather than substring-matched: a bare
 * `includes(name)` would also swallow a real 500 from the same RPC.
 */
function matchedProbe(entry: string): string | null {
  const match = /^(\d{3}) ([A-Z]+) (\S+)$/.exec(entry);
  if (!match) return null;
  const [, status, method, path] = match;
  if (status !== "400" || method !== "POST") return null;
  return (
    HEALTH_PROBE_RPCS.find((name) => path.endsWith(`/rest/v1/rpc/${name}`)) ??
    null
  );
}

const watches: AccountFailureWatch[] = [];
const expectedSyntheticAccountFailures: string[] = [];

function watchPage(page: Page): void {
  watches.push(watchAccountFailures(page));
}

/**
 * Probe names observed SO FAR, read live.
 *
 * `watchAccountFailures` mutates its `unexpected` array from the page's own
 * response listener, so this is current at the instant it is called — which is
 * what lets a test assert "no probe has fired YET". Deriving it in `afterEach`
 * instead would make every in-test check vacuously empty.
 */
function observedProbes(): string[] {
  return watches
    .flatMap((watch) => watch.unexpected)
    .map(matchedProbe)
    .filter((name): name is string => name !== null);
}

test.afterEach(() => {
  const seen = [...watches];
  watches.length = 0;
  const expectedSynthetic = [...expectedSyntheticAccountFailures];
  expectedSyntheticAccountFailures.length = 0;

  const tolerated: string[] = [];
  const toleratedSynthetic: string[] = [];
  const filtered = seen.map((watch) => ({
    unexpected: watch.unexpected.filter((entry) => {
      const probe = matchedProbe(entry);
      if (probe) {
        tolerated.push(probe);
        return false;
      }
      const syntheticIndex = expectedSynthetic.indexOf(entry);
      if (syntheticIndex !== -1) {
        expectedSynthetic.splice(syntheticIndex, 1);
        toleratedSynthetic.push(entry);
        return false;
      }
      return true;
    }),
  }));

  // Printed, never merely swallowed — the same discipline the shared helper
  // applies to its own tolerated case.
  if (tolerated.length) {
    console.log(
      `[health-port] tolerated ${tolerated.length} deliberate liveness probe 400(s): ${[
        ...new Set(tolerated),
      ]
        .sort()
        .join(", ")}`,
    );
  }
  if (toleratedSynthetic.length) {
    console.log(
      `[health-port] observed ${toleratedSynthetic.length} test-produced win write failure(s)`,
    );
  }

  expect(
    expectedSynthetic,
    "Every test-produced win write failure must be observed by the account-failure watcher exactly once.",
  ).toEqual([]);
  expectOnlyKnownAccountFailures(filtered);
});

/** The watcher is armed AFTER sign-in, for the reason plan-port-truth documents. */
async function openSignedInToday(
  page: Page,
  user: SeededUser,
): Promise<AccountClient> {
  await pinMomentPreference(page, "start");
  await signIn(page, user);
  watchPage(page);

  const account = await accountClient(page, user, env);

  await gotoWithAccountSync(page, "/");
  await expect(page.getByTestId("today-moments")).toBeVisible({
    timeout: 30_000,
  });
  return account;
}

interface HealthCheckRow {
  id: string;
  subsystem: string;
  checked_at: string;
}

const HEALTH_SELECT = "health_checks?select=id,subsystem,checked_at";
const JOURNAL_DB = "lifeos-pending-writes";
const JOURNAL_STORE = "pending";
const JOURNAL_CLIENT_ID_INDEX = "by_client_write_id";

interface PendingWriteRow {
  seq: number;
  client_write_id: string;
  entity: string;
  payload: Record<string, unknown>;
  created_at: string;
  last_attempt_failed?: true;
  last_attempt_failed_at?: string;
  last_attempt_failure_kind?: "server-capability-missing" | "unknown";
}

interface PendingWinPayload {
  workflow_task_id: string;
  persisted_task_id: string | null;
  persisted_area_id: string | null;
  title: string;
  detail: string | null;
}

/**
 * Put an ordinary, UNSTAMPED write into the browser journal. The non-UUID task
 * id is absent from both account rows and the local alias map, so the real win
 * handler rejects it before `syncWin` can issue an account write. The replay
 * kernel, not this fixture, must add the two failed-attempt fields.
 */
async function seedUnmappableWin(
  page: Page,
  clientWriteId: string,
): Promise<void> {
  await seedPendingWin(page, clientWriteId, {
    workflow_task_id: `${clientWriteId}-missing-task`,
    persisted_task_id: null,
    persisted_area_id: null,
    title: "Health failed-save browser proof",
    detail: null,
  });
}

/** Add one pending win without pre-stamping any replay result or failure kind. */
async function seedPendingWin(
  page: Page,
  clientWriteId: string,
  payload: PendingWinPayload,
): Promise<void> {
  await page.evaluate(
    ({ clientWriteId, dbName, storeName, payload }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open(dbName);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains(storeName)) {
            db.close();
            reject(
              new Error("The app did not create the pending-write store."),
            );
            return;
          }

          const transaction = db.transaction(storeName, "readwrite");
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
          transaction.objectStore(storeName).add({
            client_write_id: clientWriteId,
            entity: "win",
            payload: {
              ...payload,
              occurred_at: new Date().toISOString().slice(0, 10),
            },
            created_at: new Date().toISOString(),
          });
        };
      }),
    {
      clientWriteId,
      dbName: JOURNAL_DB,
      storeName: JOURNAL_STORE,
      payload,
    },
  );
}

async function readPendingWrite(
  page: Page,
  clientWriteId: string,
): Promise<PendingWriteRow | null> {
  return page.evaluate(
    ({ clientWriteId, dbName, storeName, indexName }) =>
      new Promise<PendingWriteRow | null>((resolve, reject) => {
        const open = indexedDB.open(dbName);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const transaction = db.transaction(storeName, "readonly");
          const read = transaction
            .objectStore(storeName)
            .index(indexName)
            .get(clientWriteId);
          read.onerror = () => {
            db.close();
            reject(read.error);
          };
          read.onsuccess = () => {
            db.close();
            resolve((read.result as PendingWriteRow | undefined) ?? null);
          };
        };
      }),
    {
      clientWriteId,
      dbName: JOURNAL_DB,
      storeName: JOURNAL_STORE,
      indexName: JOURNAL_CLIENT_ID_INDEX,
    },
  );
}

interface HealthSummarySnapshot {
  headline: string;
  needsYou: string;
  work: string;
  developerMetrics: string;
  developerCheckCount: number;
}

async function healthSummarySnapshot(
  page: Page,
): Promise<HealthSummarySnapshot> {
  return page.getByTestId("health-sheet").evaluate((root) => ({
    headline:
      root
        .querySelector('[data-testid="health-sheet-headline"]')
        ?.textContent?.trim() ?? "",
    needsYou:
      root
        .querySelector('[data-testid="health-sheet-needs-you"]')
        ?.textContent?.trim() ?? "",
    work:
      root
        .querySelector('[data-testid="health-sheet-group-work"]')
        ?.textContent?.replace(/\s+/g, " ")
        .trim() ?? "",
    developerMetrics:
      Array.from(
        root.querySelectorAll(
          '[data-testid="health-sheet-developer-details"] > p',
        ),
      )
        .find((node) => node.textContent?.includes("overall score"))
        ?.textContent?.replace(/\s+/g, " ")
        .trim() ?? "",
    developerCheckCount: root.querySelectorAll(
      '[data-testid="health-sheet-developer-details"] > div > div',
    ).length,
  }));
}

/**
 * `health_checks` is deliberately NOT in the helper's `PURGE_ORDER` — it is an
 * append-only record of every check the user has ever run, and a spec that
 * deleted it would be destroying the very audit trail C1 criterion 5 exists to
 * protect. So nothing here asserts an absolute count. Identity is used instead:
 * the ids held before an action, and which ids are new after it.
 */
async function healthCheckIds(account: AccountClient): Promise<Set<string>> {
  const rows = await account.rows<HealthCheckRow>(HEALTH_SELECT);
  return new Set(rows.map((row) => row.id));
}

async function newHealthCheckIds(
  account: AccountClient,
  before: Set<string>,
): Promise<string[]> {
  const rows = await account.rows<HealthCheckRow>(HEALTH_SELECT);
  return rows.map((row) => row.id).filter((id) => !before.has(id));
}

/**
 * Open Health, and do not return until all four probes have ANSWERED.
 *
 * The wait is not politeness, it is what keeps this file's own allowlist
 * honest. Measured on this branch (run of 2026-08-06, five tests): without it,
 * the URL-criteria test finished with only 2 of the 4 probe responses received
 * and the verdict test with 0 — so those tests tolerated a set they had never
 * actually been handed, and a probe that silently stopped firing would not have
 * shown up as a failure anywhere but in the one test that polled for it.
 *
 * Waiting on the exact four also means the classification is strictly a
 * pass/fail on the RESPONSE: a probe answering 403, 404 or 500 never matches
 * `matchedProbe`, lands in `unexpected`, and fails the test.
 */
async function openHealthSheet(page: Page): Promise<void> {
  await page.getByTestId("side-rail-open-health").click();
  await expect(page.getByTestId("health-sheet")).toBeVisible({
    timeout: 20_000,
  });
  await expect
    .poll(() => [...new Set(observedProbes())].sort(), { timeout: 30_000 })
    .toEqual([...HEALTH_PROBE_RPCS].sort());
}

test.describe("C2-S4 — the ported Health surface, signed in", () => {
  test(`${SIGNED_IN_TAG} the check is asked-only: the home runs no probe and writes no record until Health is opened`, async ({
    page,
  }) => {
    const account = await openSignedInToday(page, SEEDED_USERS.a);

    // The home has been loaded and its rows synced. NOTHING health-shaped may
    // have happened yet. This is the assertion the legacy mount-effect shape
    // would fail: every sheet is mounted by TodayMoments on every render.
    const before = await healthCheckIds(account);
    expect(
      observedProbes(),
      "loading the home must not fire the health liveness probes",
    ).toEqual([]);

    // Give an ungated effect a fair chance to fire before concluding it did not.
    await page.waitForTimeout(3_000);
    expect(await newHealthCheckIds(account, before)).toEqual([]);
    expect(observedProbes()).toEqual([]);

    // THE ASK. `openHealthSheet` does not return until all four probes have
    // answered — asserting they were SEEN is what stops this file's own
    // allowlist from hiding their absence: a spec that tolerated four 400s and
    // never received them would be green and empty.
    await openHealthSheet(page);

    // And the check reached the account as new rows attributable to this open.
    await expect
      .poll(async () => (await newHealthCheckIds(account, before)).length > 0, {
        timeout: 30_000,
      })
      .toBe(true);
  });

  test(`${SIGNED_IN_TAG} "Check again" writes a NEW record, and the surface only claims the save that happened`, async ({
    page,
  }) => {
    const account = await openSignedInToday(page, SEEDED_USERS.a);
    await openHealthSheet(page);

    // Let the open's own check settle, so what follows is about the button.
    await expect(page.getByTestId("health-sheet-message")).toHaveText(
      "Checked. A record of this check was saved to your account.",
      { timeout: 30_000 },
    );
    await expect
      .poll(async () => (await healthCheckIds(account)).size > 0, {
        timeout: 30_000,
      })
      .toBe(true);

    // Positive control: the ids the account holds BEFORE the press.
    const before = await healthCheckIds(account);

    // THE PRESS.
    await page.getByTestId("health-sheet-check-again").click();

    // New rows, named by ids the account did not hold a moment ago — never a
    // bare count, which would pass on a fresh database and drift on a re-run.
    await expect
      .poll(async () => (await newHealthCheckIds(account, before)).length > 0, {
        timeout: 30_000,
      })
      .toBe(true);

    const added = await newHealthCheckIds(account, before);
    for (const id of added) {
      expect(before.has(id)).toBe(false);
    }

    // The sentence on screen is the one the write earns.
    await expect(page.getByTestId("health-sheet-message")).toHaveText(
      "Checked. A record of this check was saved to your account.",
      { timeout: 30_000 },
    );
  });

  test(`${SIGNED_IN_TAG} the verdict never claims all-clear while its own checks are unhappy`, async ({
    page,
  }) => {
    await openSignedInToday(page, SEEDED_USERS.a);
    await openHealthSheet(page);

    // #967: `openHealthSheet` only waits for the four probes to have
    // ANSWERED, not for `getHealthDashboard()` to resolve and React to apply
    // `setChecks` (`HealthSheet.tsx`) — reading the headline and subline as
    // two separate Playwright calls afterward can straddle that render, each
    // call observing a different one. Waiting for the check's own completed
    // message first is a real, existing settled-state signal (used the same
    // way by the "Check again" test above), not a fixed sleep.
    await expect(page.getByTestId("health-sheet-message")).toHaveText(
      "Checked. A record of this check was saved to your account.",
      { timeout: 30_000 },
    );

    // Both strings read from their common root in ONE browser evaluation —
    // a single DOM snapshot, so the pair can never be torn across two
    // separate round-trips the way two Playwright `textContent()` calls can.
    const { headlineText, needsYouText } = await page
      .getByTestId("health-sheet")
      .evaluate((root) => ({
        headlineText:
          root
            .querySelector('[data-testid="health-sheet-headline"]')
            ?.textContent?.trim() ?? "",
        needsYouText:
          root
            .querySelector('[data-testid="health-sheet-needs-you"]')
            ?.textContent?.trim() ?? "",
      }));
    expect(headlineText).not.toBe("");

    // C1 criterion 5 (#758), re-pinned on the ported surface: the two lines
    // must agree with each other. "Everything is working" may only appear
    // beside "Nothing needs you right now."
    if (headlineText === "Everything is working") {
      expect(needsYouText).toBe("Nothing needs you right now.");
    } else {
      expect(headlineText).toMatch(/things? needs? a look/);
      expect(needsYouText).toMatch(/^Needs a look: .+\.$/);
    }

    // Every legacy capability is on the ported surface, not merely named in a
    // commit message.
    await expect(page.getByTestId("health-sheet-group-work")).toBeVisible();
    await expect(page.getByTestId("health-sheet-aging-signals")).toContainText(
      "People & commitments",
    );
    await expect(
      page.getByTestId("health-sheet-developer-details"),
    ).toBeVisible();
    await expect(page.getByTestId("health-sheet")).toContainText(
      /Observation only/i,
    );
  });

  test(`${SIGNED_IN_TAG} a retained failed-save attempt prevents every Health all-clear claim without changing raw checks`, async ({
    page,
  }, testInfo) => {
    const account = await openSignedInToday(page, SEEDED_USERS.a);

    // This fixture must be otherwise healthy or the later attention could
    // come from a server probe instead of the one local failed attempt.
    await openHealthSheet(page);
    await expect(page.getByTestId("health-sheet-message")).toHaveText(
      "Checked. A record of this check was saved to your account.",
      { timeout: 30_000 },
    );
    const before = await healthSummarySnapshot(page);
    expect(before.headline).toBe("Everything is working");
    expect(before.needsYou).toBe("Nothing needs you right now.");
    expect(before.work).toContain("All good");
    expect(before.developerMetrics).toMatch(
      /^overall score 100\/100 · \d+ healthy · 0 watch · 0 critical$/,
    );
    expect(before.developerCheckCount).toBeGreaterThan(0);
    await page.getByTestId("moment-sheet-close").click();
    await expect(page.getByTestId("health-sheet")).toHaveCount(0);

    const clientWriteId = `health-proof-${Date.now()}`;
    const accountRowsForMarker = () =>
      account.rows<{ client_write_id: string }>(
        `win_records?select=client_write_id&client_write_id=eq.${encodeURIComponent(clientWriteId)}`,
      );
    expect(await accountRowsForMarker()).toEqual([]);

    await seedUnmappableWin(page, clientWriteId);
    const unstamped = await readPendingWrite(page, clientWriteId);
    expect(unstamped).toMatchObject({
      client_write_id: clientWriteId,
      entity: "win",
      payload: {
        workflow_task_id: `${clientWriteId}-missing-task`,
        persisted_task_id: null,
        persisted_area_id: null,
        title: "Health failed-save browser proof",
        detail: null,
      },
    });
    expect(unstamped?.seq).toEqual(expect.any(Number));
    expect(unstamped?.created_at).toEqual(expect.any(String));
    expect(unstamped).not.toHaveProperty("last_attempt_failed");
    expect(unstamped).not.toHaveProperty("last_attempt_failed_at");

    // Reload runs the real account sync and replay. The missing non-UUID task
    // cannot resolve, so winHandler throws before syncWin and the kernel stamps
    // the retained row.
    await reloadWithAccountSync(page);
    await expect
      .poll(() => readPendingWrite(page, clientWriteId), { timeout: 30_000 })
      .toMatchObject({
        client_write_id: clientWriteId,
        last_attempt_failed: true,
        last_attempt_failed_at: expect.any(String),
      });
    const firstFailedAttempt = await readPendingWrite(page, clientWriteId);
    const firstFailedAt = firstFailedAttempt?.last_attempt_failed_at;
    expect(firstFailedAt).toEqual(expect.any(String));
    expect(Number.isNaN(Date.parse(firstFailedAt ?? ""))).toBe(false);

    // Existing shipping UI proves the provider derived pendingSaveFailed.
    await expect(page.getByTestId("masthead-save-state-message")).toHaveText(
      ACCOUNT_SAVE_FAILED,
      { timeout: 30_000 },
    );
    expect(await accountRowsForMarker()).toEqual([]);

    await openHealthSheet(page);
    await expect(page.getByTestId("health-sheet-message")).toHaveText(
      "Checked. A record of this check was saved to your account.",
      { timeout: 30_000 },
    );
    const after = await healthSummarySnapshot(page);
    expect(after.headline).toBe("1 thing needs a look");
    expect(after.needsYou).toBe("Needs a look: Saving your work.");
    expect(after.work).toContain("Saving your work");
    expect(after.work).toContain(ACCOUNT_SAVE_FAILED);
    expect(after.work).not.toContain("All good");
    expect(after.developerMetrics).toBe(before.developerMetrics);
    expect(after.developerCheckCount).toBe(before.developerCheckCount);

    const workGroup = page.getByTestId("health-sheet-group-work");
    await workGroup.locator("summary").click();
    await expect(workGroup).toHaveAttribute("open", "");
    const genericConcern = workGroup
      .getByText("Saving your work", { exact: true })
      .locator("..");
    await expect(genericConcern).toContainText(ACCOUNT_SAVE_FAILED);
    await testInfo.attach("health-retained-failed-save-copy", {
      // Crop to the one generic concern row. No account identity, user work,
      // probe details, sidebar, or other Health content enters the artifact.
      body: await genericConcern.screenshot(),
      contentType: "image/png",
    });

    // The manual action must cause a NEW real attempt. Visibility alone is not
    // proof: the automatic reload above already stamped this same retained
    // entry once. The journal kernel updates its factual attempt timestamp only
    // after the handler throws, so a strictly newer stamp proves the click
    // reached the existing replay path and failed again.
    const retry = genericConcern.getByRole("button", {
      name: "Try saving again",
      exact: true,
    });
    await expect(retry).toBeVisible();
    await retry.click();
    await expect
      .poll(
        async () =>
          (await readPendingWrite(page, clientWriteId))
            ?.last_attempt_failed_at ?? null,
        { timeout: 30_000 },
      )
      .not.toBe(firstFailedAt);

    const retried = await readPendingWrite(page, clientWriteId);
    expect(retried).toMatchObject({
      client_write_id: clientWriteId,
      entity: "win",
      payload: unstamped?.payload,
      last_attempt_failed: true,
      last_attempt_failed_at: expect.any(String),
    });
    expect(Date.parse(retried?.last_attempt_failed_at ?? "")).toBeGreaterThan(
      Date.parse(firstFailedAt ?? ""),
    );
    expect(await accountRowsForMarker()).toEqual([]);

    // Failure remains factual and actionable; retry settlement alone is never
    // rendered as account delivery. Health's raw probes and score are still the
    // same otherwise-healthy baseline because retry is not a health re-check.
    await expect(genericConcern).toContainText(ACCOUNT_SAVE_FAILED);
    await expect(retry).toBeVisible();
    await expect(retry).toBeEnabled();
    const afterRetry = await healthSummarySnapshot(page);
    expect(afterRetry.headline).toBe("1 thing needs a look");
    expect(afterRetry.needsYou).toBe("Needs a look: Saving your work.");
    expect(afterRetry.work).toContain("Saving your work");
    expect(afterRetry.work).toContain(ACCOUNT_SAVE_FAILED);
    expect(afterRetry.work).not.toContain("All good");
    expect(afterRetry.developerMetrics).toBe(before.developerMetrics);
    expect(afterRetry.developerCheckCount).toBe(before.developerCheckCount);

    await testInfo.attach("health-manual-retry-retained-failure-copy", {
      // Same privacy boundary as the pre-retry artifact: one generic concern
      // row only, after the second factual failure is known durable.
      body: await genericConcern.screenshot(),
      contentType: "image/png",
    });
  });

  test(`${SIGNED_IN_TAG} typed replay failures distinguish an app-update-only queue from a mixed unknown queue`, async ({
    page,
  }) => {
    // This test deliberately creates and fails account writes. Refuse to run it
    // unless the signed-in fixture points at an isolated loopback Supabase.
    expect(["127.0.0.1", "localhost", "[::1]"]).toContain(
      new URL(env.url).hostname,
    );

    const account = await openSignedInToday(page, SEEDED_USERS.a);
    const [area] = await account.rows<{ id: string }>(
      "areas?select=id&limit=1",
    );
    expect(area?.id).toEqual(expect.any(String));
    const [task] = await account.insert<{ id: string; area_id: string }>(
      "tasks",
      [
        {
          user_id: SEEDED_USERS.a.id,
          area_id: area!.id,
          title: "Synthetic Health failure-kind source task",
          status: "active",
        },
      ],
    );
    expect(task).toMatchObject({ id: expect.any(String), area_id: area!.id });

    // Establish that the fixture is otherwise healthy before either failed
    // write exists. These raw values must remain unchanged through both queue
    // classifications; only the factual save concern may alter the summaries.
    await openHealthSheet(page);
    await expect(page.getByTestId("health-sheet-message")).toHaveText(
      "Checked. A record of this check was saved to your account.",
      { timeout: 30_000 },
    );
    const before = await healthSummarySnapshot(page);
    expect(before.headline).toBe("Everything is working");
    expect(before.needsYou).toBe("Nothing needs you right now.");
    expect(before.work).toContain("All good");
    expect(before.developerMetrics).toMatch(
      /^overall score 100\/100 · \d+ healthy · 0 watch · 0 critical$/,
    );
    expect(before.developerCheckCount).toBeGreaterThan(0);
    await page.getByTestId("moment-sheet-close").click();
    await expect(page.getByTestId("health-sheet")).toHaveCount(0);

    const knownClientWriteId = `health-known-kind-${Date.now()}`;
    const unknownClientWriteId = `health-mixed-unknown-${Date.now()}`;
    const accountRowsForMarker = (clientWriteId: string) =>
      account.rows<{ client_write_id: string }>(
        `win_records?select=client_write_id&client_write_id=eq.${encodeURIComponent(clientWriteId)}`,
      );

    let knownWriteAttempts = 0;
    await page.route("**/rest/v1/win_records**", async (route) => {
      const request = route.request();
      if (request.method() !== "POST") {
        await route.continue();
        return;
      }

      const submitted = request.postDataJSON() as unknown;
      const submittedRows = Array.isArray(submitted) ? submitted : [submitted];
      const targetsKnownFixture = submittedRows.some(
        (row) =>
          typeof row === "object" &&
          row !== null &&
          "client_write_id" in row &&
          row.client_write_id === knownClientWriteId,
      );
      if (!targetsKnownFixture) {
        await route.continue();
        return;
      }

      knownWriteAttempts += 1;
      const path = request.url().split("?")[0]!;
      expectedSyntheticAccountFailures.push(`404 POST ${path}`);
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({
          code: "PGRST202",
          details: null,
          hint: null,
          message: "Synthetic fixture response.",
        }),
      });
    });

    await seedPendingWin(page, knownClientWriteId, {
      workflow_task_id: task!.id,
      persisted_task_id: task!.id,
      persisted_area_id: task!.area_id,
      title: "Synthetic known failure win",
      detail: null,
    });
    const unstampedKnown = await readPendingWrite(page, knownClientWriteId);
    expect(unstampedKnown).toMatchObject({
      client_write_id: knownClientWriteId,
      entity: "win",
      payload: {
        persisted_task_id: task!.id,
        persisted_area_id: task!.area_id,
      },
    });
    expect(unstampedKnown).not.toHaveProperty("last_attempt_failed");
    expect(unstampedKnown).not.toHaveProperty("last_attempt_failed_at");
    expect(unstampedKnown).not.toHaveProperty("last_attempt_failure_kind");

    // The real replay reaches syncJournaledWin; only its synthetic typed
    // PostgREST response supplies the safe category. The fixture never stamps
    // final failure metadata into IndexedDB itself.
    await reloadWithAccountSync(page);
    await expect
      .poll(() => readPendingWrite(page, knownClientWriteId), {
        timeout: 30_000,
      })
      .toMatchObject({
        client_write_id: knownClientWriteId,
        last_attempt_failed: true,
        last_attempt_failed_at: expect.any(String),
        last_attempt_failure_kind: "server-capability-missing",
      });
    expect(knownWriteAttempts).toBeGreaterThan(0);
    expect(await accountRowsForMarker(knownClientWriteId)).toEqual([]);
    await expect(page.getByTestId("masthead-save-state-message")).toHaveText(
      ACCOUNT_NEEDS_APP_UPDATE,
      { timeout: 30_000 },
    );

    await openHealthSheet(page);
    await expect(page.getByTestId("health-sheet-message")).toHaveText(
      "Checked. A record of this check was saved to your account.",
      { timeout: 30_000 },
    );
    const knownOnly = await healthSummarySnapshot(page);
    expect(knownOnly.headline).toBe("1 thing needs a look");
    expect(knownOnly.needsYou).toBe("Needs a look: Saving your work.");
    expect(knownOnly.work).toContain("Saving your work");
    expect(knownOnly.work).toContain(ACCOUNT_NEEDS_APP_UPDATE);
    expect(knownOnly.work).not.toContain(ACCOUNT_SAVE_FAILED);
    expect(knownOnly.work).not.toContain("All good");
    expect(knownOnly.developerMetrics).toBe(before.developerMetrics);
    expect(knownOnly.developerCheckCount).toBe(before.developerCheckCount);
    const knownWorkGroup = page.getByTestId("health-sheet-group-work");
    await knownWorkGroup.locator("summary").click();
    const knownConcern = knownWorkGroup
      .getByText("Saving your work", { exact: true })
      .locator("..");
    await expect(knownConcern).toContainText(ACCOUNT_NEEDS_APP_UPDATE);
    await expect(
      knownConcern.getByRole("button", {
        name: "Try saving again",
        exact: true,
      }),
    ).toHaveCount(0);
    expect(await readPendingWrite(page, knownClientWriteId)).not.toBeNull();
    await page.getByTestId("moment-sheet-close").click();

    // Add a genuinely unmappable legacy-shaped row. Its real handler throws
    // before any account request, so the kernel must classify it as unknown.
    // A mixed queue must keep the generic retry path; the known row cannot hide
    // this second unresolved cause behind app-update guidance.
    await seedUnmappableWin(page, unknownClientWriteId);
    const unstampedUnknown = await readPendingWrite(page, unknownClientWriteId);
    expect(unstampedUnknown).not.toHaveProperty("last_attempt_failure_kind");
    const attemptsBeforeMixedReplay = knownWriteAttempts;

    await reloadWithAccountSync(page);
    await expect
      .poll(() => readPendingWrite(page, unknownClientWriteId), {
        timeout: 30_000,
      })
      .toMatchObject({
        client_write_id: unknownClientWriteId,
        last_attempt_failed: true,
        last_attempt_failed_at: expect.any(String),
        last_attempt_failure_kind: "unknown",
      });
    await expect
      .poll(() => knownWriteAttempts, { timeout: 30_000 })
      .toBeGreaterThan(attemptsBeforeMixedReplay);
    expect(await readPendingWrite(page, knownClientWriteId)).toMatchObject({
      last_attempt_failed: true,
      last_attempt_failure_kind: "server-capability-missing",
    });
    expect(await accountRowsForMarker(knownClientWriteId)).toEqual([]);
    expect(await accountRowsForMarker(unknownClientWriteId)).toEqual([]);
    await expect(page.getByTestId("masthead-save-state-message")).toHaveText(
      ACCOUNT_SAVE_FAILED,
      { timeout: 30_000 },
    );

    await openHealthSheet(page);
    await expect(page.getByTestId("health-sheet-message")).toHaveText(
      "Checked. A record of this check was saved to your account.",
      { timeout: 30_000 },
    );
    const mixed = await healthSummarySnapshot(page);
    expect(mixed.headline).toBe("1 thing needs a look");
    expect(mixed.needsYou).toBe("Needs a look: Saving your work.");
    expect(mixed.work).toContain("Saving your work");
    expect(mixed.work).toContain(ACCOUNT_SAVE_FAILED);
    expect(mixed.work).not.toContain(ACCOUNT_NEEDS_APP_UPDATE);
    expect(mixed.work).not.toContain("All good");
    expect(mixed.developerMetrics).toBe(before.developerMetrics);
    expect(mixed.developerCheckCount).toBe(before.developerCheckCount);
    const mixedWorkGroup = page.getByTestId("health-sheet-group-work");
    await mixedWorkGroup.locator("summary").click();
    const mixedConcern = mixedWorkGroup
      .getByText("Saving your work", { exact: true })
      .locator("..");
    await expect(mixedConcern).toContainText(ACCOUNT_SAVE_FAILED);
    await expect(
      mixedConcern.getByRole("button", {
        name: "Try saving again",
        exact: true,
      }),
    ).toBeVisible();
    expect(await readPendingWrite(page, knownClientWriteId)).not.toBeNull();
    expect(await readPendingWrite(page, unknownClientWriteId)).not.toBeNull();
  });

  test(`${SIGNED_IN_TAG} C2 Target Card 2: the Health surface is in the URL, and refresh, Back and Forward all agree`, async ({
    page,
  }) => {
    await openSignedInToday(page, SEEDED_USERS.a);

    // Opening from the rail must put the surface in the address bar. Before
    // this slice the same control left the moments shell entirely.
    await openHealthSheet(page);
    expect(new URL(page.url()).searchParams.get("sheet")).toBe("health");

    // Refresh lands on the same surface.
    await reloadWithAccountSync(page);
    await expect(page.getByTestId("health-sheet")).toBeVisible({
      timeout: 30_000,
    });

    // Back closes it and clears the param — it does NOT leave the home.
    await page.goBack();
    await expect(page.getByTestId("health-sheet")).toHaveCount(0, {
      timeout: 20_000,
    });
    expect(new URL(page.url()).searchParams.get("sheet")).toBeNull();
    await expect(page.getByTestId("today-moments")).toBeVisible();

    // Forward re-opens exactly the same surface.
    await page.goForward();
    await expect(page.getByTestId("health-sheet")).toBeVisible({
      timeout: 20_000,
    });
    expect(new URL(page.url()).searchParams.get("sheet")).toBe("health");

    // And the sheet's own Close returns the URL to the home.
    await page.getByTestId("moment-sheet-close").click();
    await expect(page.getByTestId("health-sheet")).toHaveCount(0, {
      timeout: 20_000,
    });
    await expect
      .poll(() => new URL(page.url()).searchParams.get("sheet"), {
        timeout: 10_000,
      })
      .toBeNull();
  });

  test(`${SIGNED_IN_TAG} a direct link to ?sheet=health opens Health, with no trip through the legacy shell`, async ({
    page,
  }) => {
    await openSignedInToday(page, SEEDED_USERS.a);

    await gotoWithAccountSync(page, "/?sheet=health");
    await expect(page.getByTestId("health-sheet")).toBeVisible({
      timeout: 30_000,
    });
    // The moments home is what rendered it — not a cockpit route.
    await expect(page.getByTestId("today-moments")).toBeVisible();
    await expect(page.getByTestId("lifeos-cockpit")).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe("/");

    // Reached by URL, the surface behaves identically: the same four probes
    // answer. Waited on for the same reason `openHealthSheet` waits — so the
    // tolerance is never applied to a set this test did not actually receive.
    await expect
      .poll(() => [...new Set(observedProbes())].sort(), { timeout: 30_000 })
      .toEqual([...HEALTH_PROBE_RPCS].sort());
  });
});
