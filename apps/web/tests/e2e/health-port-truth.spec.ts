import { expect, test, type Page } from "@playwright/test";
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

  const tolerated: string[] = [];
  const filtered = seen.map((watch) => ({
    unexpected: watch.unexpected.filter((entry) => {
      const probe = matchedProbe(entry);
      if (probe) {
        tolerated.push(probe);
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

async function openHealthSheet(page: Page): Promise<void> {
  await page.getByTestId("side-rail-open-health").click();
  await expect(page.getByTestId("health-sheet")).toBeVisible({
    timeout: 20_000,
  });
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

    // THE ASK.
    await openHealthSheet(page);

    // Now the probes run — all four of them. Asserting they were SEEN is what
    // stops this file's own allowlist from hiding their absence: a spec that
    // tolerated four 400s and never received them would be green and empty.
    await expect
      .poll(() => [...new Set(observedProbes())].sort(), { timeout: 30_000 })
      .toEqual([...HEALTH_PROBE_RPCS].sort());

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

    const headline = page.getByTestId("health-sheet-headline");
    const needsYou = page.getByTestId("health-sheet-needs-you");
    await expect(headline).not.toHaveText("", { timeout: 30_000 });

    // C1 criterion 5 (#758), re-pinned on the ported surface: the two lines
    // must agree with each other. "Everything is working" may only appear
    // beside "Nothing needs you right now."
    const headlineText = (await headline.textContent())?.trim() ?? "";
    const needsYouText = (await needsYou.textContent())?.trim() ?? "";
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
  });
});
