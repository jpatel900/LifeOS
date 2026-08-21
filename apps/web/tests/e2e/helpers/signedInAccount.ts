import {
  expect,
  type APIResponse,
  type Page,
  type Response,
} from "@playwright/test";

/**
 * The signed-in browser tier — the seam #737's ROUND 3 judge left open.
 *
 * ## What was structurally invisible, and why
 *
 * Every Playwright spec in this suite runs against a dev server with NO
 * Supabase env, so `createSupabaseBrowserClient()` returns null and there is
 * no account to write to. The account tier is pinned separately, in vitest,
 * against a real Postgres (`src/__tests__/phase4aRls.local*.test.ts`, CI job
 * `migrations-rls`). Neither job ever drove a signed-in BROWSER, so anything
 * that only goes wrong when a real session, a real fetch and a real render
 * meet was invisible to CI by construction. ROUND 3's own words: "the other
 * criteria are still pinned at two tiers that never meet in a signed-in
 * browser. This drive is the only account-tier browser evidence for them, and
 * a drive is not a pin."
 *
 * This helper is the pin's foundation. Specs that use it run ONLY in the
 * `e2e-signed-in` CI job, which boots local Supabase, applies migrations +
 * seed, and starts the dev server WITH `NEXT_PUBLIC_SUPABASE_*` set. They are
 * excluded from the ordinary `e2e` job by tag (`--grep-invert @signed-in`),
 * because there they would be testing nothing.
 *
 * ## Non-vacuity is the whole risk, so it is designed against
 *
 * A signed-in job that silently ran signed-OUT would be green and worthless —
 * exactly the failure mode `phase4aRls.local.rollupOfferTruth.test.tsx`'s
 * header describes. Three defences, in order of strength:
 *
 *  1. `requireSupabaseEnv()` throws before the browser opens if the env is
 *     missing. No spec can quietly degrade to demo mode.
 *  2. `signIn()` asserts the masthead's signed-in affordance, and
 *     `accessToken()` fails loudly if the app's own cookie jar holds no
 *     session.
 *  3. Every spec reads its claim back out of PostgREST **with the signed-in
 *     user's own JWT**, taken from the app's `@supabase/ssr` cookie. An
 *     assertion that survives a signed-out run does not belong in this file.
 */

/** Tag carried in every signed-in test title. The CI grep key. */
export const SIGNED_IN_TAG = "@signed-in";

export interface SeededUser {
  id: string;
  email: string;
  password: string;
}

/**
 * `supabase/seed.sql`'s two local Auth users. Same pair the account-tier
 * vitest pins use, so both tiers talk about the same rows.
 */
export const SEEDED_USERS = {
  a: {
    id: "00000000-0000-4000-8000-000000000001",
    email: "user_a@example.test",
    password: "password123",
  },
  b: {
    id: "00000000-0000-4000-8000-000000000002",
    email: "user_b@example.test",
    password: "password123",
  },
} as const satisfies Record<string, SeededUser>;

export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

/**
 * Defence 1. Called from `test.beforeAll` so a misconfigured job dies at the
 * first spec with a sentence naming the fix, instead of producing a green run
 * that proved nothing.
 */
export function requireSupabaseEnv(): SupabaseEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      [
        "The @signed-in Playwright tier requires a real Supabase stack.",
        "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set",
        "for BOTH the dev server and this test process. Locally:",
        "  supabase start && supabase db reset && eval \"$(supabase status -o env | sed 's/^/export /')\"",
        '  NEXT_PUBLIC_SUPABASE_URL="$API_URL" NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" \\',
        '    pnpm --filter @lifeos/web test:e2e --grep "@signed-in"',
        "In CI this is the `e2e-signed-in` job (.github/workflows/ci.yml).",
      ].join("\n"),
    );
  }

  return { url, anonKey };
}

/**
 * Sign in as a seeded user and land on Today with the account actually loaded.
 *
 * ## The full document load is load-bearing — do not "simplify" it away
 *
 * `/login` finishes with `router.push("/")`, a CLIENT-side navigation.
 * `WorkflowProvider` wraps the whole app, so its one-shot areas/rows sync
 * effect has already run — on `/login`, before any session existed — and does
 * not re-run on a client-side route change. Probed on this branch: without the
 * reload the masthead reads "You're not signed in, so new work is saving on
 * this device only", no `GET /rest/v1/areas` is ever issued, and a capture
 * made afterwards leaves `capture_items` EMPTY. With the reload the same
 * journey writes the row. A spec that skipped the reload would be a
 * signed-OUT spec wearing a signed-in name.
 */
export async function signIn(page: Page, user: SeededUser): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL("**/");

  await gotoWithAccountSync(page, "/");
  await expect(page.getByTestId("today-moments")).toBeVisible({
    timeout: 30_000,
  });
  // Defence 2: the app itself says whose session this is.
  await expect(page.getByTestId("masthead-auth-signed-in")).toContainText(
    user.email.split("@")[0]!,
  );
}

/**
 * Navigate, and do not return until the app has actually READ this user's rows
 * out of the account.
 *
 * ## Why every signed-in navigation has to go through here
 *
 * `WorkflowProvider` loads areas, then `syncPersistedWorkflowRows` reads the
 * row tables. Until that finishes the provider is still in its local-only
 * posture, and a write made in that window is journalled for a later replay
 * instead of going to the account. Measured on this branch: a capture typed
 * immediately after `today-moments` became visible produced NO
 * `POST /rest/v1/capture_items` at all and left the account empty through 20 s
 * of polling, while the identical journey with the load settled produced the
 * row in under four seconds. `today-moments` being visible means React
 * mounted; it does not mean the account arrived.
 *
 * `capture_items` is the gate because it is inside `syncPersistedWorkflowRows`,
 * which only runs once `listAreas` has returned as a real Supabase provider —
 * so a 200 here is proof of account mode, not merely of a request going out.
 * The listener is armed BEFORE the navigation so the response cannot be missed.
 *
 * ## PGRST303 — this is the app's OWN first PostgREST call, so it is the most
 * likely place the #841 clock race hits first
 *
 * `signIn()` calls this immediately after the `/login` form submits, which
 * makes the requests below the very first PostgREST traffic the
 * freshly-minted session's JWT is used for — closest in wall-clock terms to
 * a `supabase db reset` that just ran. If a GET 401s with the exact
 * PGRST303 shape (see `isPgrst303` / the constants above `accountClient`),
 * it is retried by re-running the WHOLE navigation (bounded, with a settle
 * wait) rather than by masking it: nothing here decides the read succeeded
 * when it did not. Any other failure shape — or a timeout with no PGRST303
 * ever observed — rethrows the original `waitForResponse` timeout unchanged,
 * exactly as before this retry existed.
 *
 * ## #883 — the watch covers every `/rest/v1/` GET, not only `capture_items`
 *
 * `capture_items` is requested from INSIDE `syncPersistedAreas`
 * (`WorkflowContext.tsx`), strictly after `listAreas()` returns:
 * ```
 * const result = await listAreas(client);          // GET /rest/v1/areas
 * ...
 * await syncPersistedWorkflowRows(client, result.areas); // GET .../capture_items
 * ```
 * `listAreas` throws on any non-2xx (`if (error) throw new Error(...)`,
 * `lib/data/workflow/areas.ts`), and `syncPersistedAreas`'s `catch` routes
 * straight to `markPersistedLoadFailure` — `syncPersistedWorkflowRows`, and
 * so the `capture_items` GET, is never reached. A PGRST303 on `areas` is
 * the exact same self-resolving clock race as a PGRST303 on `capture_items`
 * (same session, same JWT, same `nbf` skew), but a watch scoped to
 * `capture_items` alone never observes it: two CI sightings (#883) showed
 * the wait dying at the bare 60s timeout with no `[signed-in] PGRST303 …`
 * line at all, because the request that actually 401'd was never watched.
 * So `sawPgrst303` below is set by a PGRST303 on ANY `/rest/v1/` GET this
 * function's window sees — still the identical narrow signature
 * (`isPgrst303`: 401 AND `code === "PGRST303"`, nothing looser) — while the
 * SUCCESS predicate (`rowsLoaded`) stays exactly as narrow as before,
 * scoped to `capture_items` only: widening what can trigger a retry does
 * not widen what counts as "the account arrived".
 *
 * ## #883, reopened — detection was instant; ACTING on it was not
 *
 * The widened detection above shipped and worked: PR #899's CI (job
 * 96699259913) logged the `[signed-in] PGRST303 … attempt 1/3 — settling
 * 1500ms` line, proving `areas` was the request that skewed and that it was
 * caught. It still died at "Test timeout of 60000ms exceeded" one line
 * later. The reopening comment reads that as "1500ms was too small a
 * guess" — true, but not the load-bearing bug. Tracing the OLD code: the
 * `page.on("response", …)` listener sets `sawPgrst303` within
 * milliseconds of the 401 landing, but the retry loop only ever CONSULTED
 * that flag inside the `catch` of `await rowsLoaded` — and `rowsLoaded` is
 * `page.waitForResponse(…, { timeout: 60_000 })` for a `capture_items` GET
 * that (per the diagnosis above) is never going to arrive once `areas`
 * 401s. So the flag was set almost instantly, but the code didn't ACT on
 * it until this attempt's own internal 60s timeout finally expired and
 * rejected — which by itself exceeds `apps/web/playwright.config.ts`'s
 * per-test `timeout: 60_000`. One "attempt 1/3" log line, then the bare
 * Playwright test timeout, is exactly that arithmetic: attempt 1 alone
 * burned the whole test's clock before the retry ever got a turn.
 * Replacing the fixed 1500ms with a bigger (or measured) guess, alone,
 * would NOT have fixed this — the wait would still never run inside the
 * remaining budget.
 *
 * The fix below has two parts, in order of importance:
 *
 *  1. **Race detection against the wait, instead of gating it behind the
 *     wait's own timeout.** `pgrst303Detected` resolves the instant
 *     `onResponse` confirms the PGRST303 shape, and `Promise.race([
 *     rowsLoaded, pgrst303Detected])` acts on whichever happens first. This
 *     is the change that actually removes the race: detection is now
 *     USEABLE the moment it happens.
 *  2. **Measure the wait instead of guessing it**, so the SIZE of the wait
 *     matches the actual skew (see `measurePgrst303Skew` below) — this
 *     makes a real, larger skew recoverable and makes an unrecoverable one
 *     fail fast with the measured number instead of a bare timeout.
 *
 * A stray PGRST303 on traffic THIS function does not gate — the app's own
 * background reads, e.g. the `rollup_summaries` 401 `watchAccountFailures`
 * documents below — must not turn a run that was always going to pass into
 * a false retry or a false fail-fast. So detection winning the race does
 * NOT immediately mean failure: `rowsLoadedOk` (set the moment the REAL
 * `capture_items` success lands, independent of the race) is checked
 * first and wins unconditionally, and only if it is still false after a
 * short, bounded `PGRST303_GRACE_MS` grace period does this function
 * treat the 401 as blocking and move to measure-and-retry.
 *
 * ## Budget arithmetic — why `MAX_RECOVERABLE_SKEW_WAIT_MS` is 20s
 *
 * The whole Playwright TEST (not just this function) has a 60_000ms
 * timeout (`apps/web/playwright.config.ts` `timeout: 60_000`). `signIn()`
 * spends time on the login form fill/click/`waitForURL` (a few seconds,
 * historically) BEFORE calling this function, and AFTER this function
 * returns it awaits `today-moments` becoming visible with its OWN 30_000ms
 * timeout. Worst case: 60_000 − ~5_000 (login steps) − 30_000 (post-return
 * visibility assertion) ≈ 25_000ms is what this function can safely spend
 * in total. `MAX_RECOVERABLE_SKEW_WAIT_MS` reserves 20_000ms of that for
 * actual settle-waiting (grace + measured waits, summed across attempts),
 * leaving ~5_000ms for the `page.goto()` calls and detection round trips
 * themselves. A skew that would need more than its share of that 25s is
 * not "wait a bit longer and hope" — it is named and failed immediately.
 */
export async function gotoWithAccountSync(
  page: Page,
  path = "/",
): Promise<void> {
  const isCaptureItemsGet = (response: Response) =>
    response.url().includes("/rest/v1/capture_items") &&
    response.request().method() === "GET";

  // #883: PGRST303 is retried for ANY `/rest/v1/` GET this window sees, not
  // only `capture_items` — see the doc comment above for why `capture_items`
  // itself may never be requested at all when an earlier read (`areas`) hits
  // the same clock race first.
  const isTrackedRestGet = (response: Response) =>
    response.url().includes("/rest/v1/") &&
    response.request().method() === "GET";

  // Summed across every attempt THIS call makes — see the "Budget
  // arithmetic" doc comment above for why 20s is the reserved share of the
  // whole test's 60s timeout, not a per-attempt allowance.
  let cumulativeWaitMs = 0;

  for (let attempt = 1; attempt <= PGRST303_MAX_ATTEMPTS; attempt++) {
    let sawPgrst303 = false;
    let pgrst303Path = "";
    let pgrst303Response: Response | undefined;
    // Resolved by `onResponse` the instant a PGRST303 is confirmed — see the
    // "detection was instant; ACTING on it was not" doc comment above for
    // why this is the load-bearing part of the fix.
    let signalPgrst303Detected!: () => void;
    const pgrst303Detected = new Promise<void>((resolve) => {
      signalPgrst303Detected = resolve;
    });

    const onResponse = (response: Response) => {
      if (sawPgrst303 || !isTrackedRestGet(response) || response.ok()) return;
      void response
        .text()
        .catch(() => "")
        .then((body) => {
          if (sawPgrst303 || !isPgrst303(response.status(), body)) return;
          sawPgrst303 = true;
          pgrst303Path = response.url().split("?")[0]!;
          pgrst303Response = response;
          signalPgrst303Detected();
        });
    };
    page.on("response", onResponse);

    const rowsLoaded = page.waitForResponse(
      (response) => isCaptureItemsGet(response) && response.ok(),
      { timeout: 60_000 },
    );
    // `rowsLoadedOk` flips the instant the REAL success signal lands,
    // independent of which promise wins the race below — this is what lets
    // "success always wins" hold even when a stray PGRST303 on unrelated
    // background traffic (e.g. `rollup_summaries`, see `watchAccountFailures`
    // below) also fires in the same window. The `.then` here also marks
    // `rowsLoaded` as handled, so abandoning it below (when detection wins
    // the race instead) never produces an unhandled rejection.
    let rowsLoadedOk = false;
    rowsLoaded.then(
      () => {
        rowsLoadedOk = true;
      },
      () => {
        // A genuine rejection is handled via the catch below when it wins
        // the race; if detection won instead, this rejection is expected
        // and intentionally ignored.
      },
    );

    try {
      await page.goto(path);
      // Race the real success signal against fast PGRST303 detection so a
      // clock-skew 401 is acted on the moment it is SEEN, not after this
      // attempt's entire internal 60s `waitForResponse` timeout has already
      // burned the whole per-test budget (`playwright.config.ts`
      // `timeout: 60_000`) — that silent-until-timeout gap, not the fixed
      // 1500ms guess, is what #883's reopening evidence actually showed.
      await Promise.race([rowsLoaded, pgrst303Detected]);
    } catch (err) {
      // `rowsLoaded` rejected (its own timeout, or any other failure) before
      // any PGRST303 was ever observed at all — a genuine failure, unrelated
      // to the clock race. Rethrow unchanged, exactly as before this retry
      // existed. If a PGRST303 WAS seen (even on the last attempt), fall
      // through to the shared grace/measure/exhausted-message handling below
      // instead — that is what replaces a bare timeout with a message naming
      // the measured skew (#883 point 5), so "last attempt" must not
      // short-circuit back to the raw `err` here.
      if (!sawPgrst303) {
        throw err;
      }
    } finally {
      page.off("response", onResponse);
    }

    if (rowsLoadedOk) {
      return;
    }

    if (!sawPgrst303) {
      // Structurally unreachable (the race above only resolves without
      // throwing when one of `rowsLoaded/pgrst303Detected` settles, and
      // `rowsLoadedOk` false + `sawPgrst303` false means neither did) — a
      // guard against a future edit silently regressing this, rather than
      // a real case this file has ever observed.
      throw new Error(
        `[signed-in] gotoWithAccountSync(${path}): internal invariant broken — the wait settled without rows loading and without a PGRST303 being observed. This is a bug in the helper, not the app.`,
      );
    }

    // A PGRST303 was seen and the real success signal has not (yet) landed.
    // Give the already in-flight `capture_items` read a short, bounded grace
    // window to land on its own before treating this as a blocking skew —
    // this is what keeps a stray 401 on UNRELATED background traffic (the
    // app's own `rollup_summaries` poll is a live-observed example, see
    // `watchAccountFailures` below) from turning a run that was always going
    // to pass into a false retry or a false fail-fast.
    await new Promise((resolve) => setTimeout(resolve, PGRST303_GRACE_MS));
    cumulativeWaitMs += PGRST303_GRACE_MS;
    if (rowsLoadedOk) {
      return;
    }

    const measurement = await measurePgrst303Skew(page, pgrst303Response!);
    // Measurement REFINES the wait upward when the skew demands it; it never
    // waits LESS than the previously-known settle wait, so an unmeasurable
    // or zero-looking reading can't silently regress below what used to
    // "work" (however insufficiently) before this fix.
    const waitMs = Math.max(
      PGRST303_SETTLE_WAIT_MS,
      (measurement.measured ? Math.max(0, measurement.skewMs) : 0) +
        SKEW_SETTLE_MARGIN_MS,
    );

    if (attempt === PGRST303_MAX_ATTEMPTS) {
      // #883 point 5: name the measured skew instead of letting Playwright
      // report a bare 60s timeout.
      throw new Error(
        `[signed-in] gotoWithAccountSync(${path}) gave up after ${PGRST303_MAX_ATTEMPTS} attempts: ` +
          `PGRST303 (JWT not yet valid) on ${pgrst303Path}. ${describeSkewMeasurement(measurement)}. ` +
          `Cumulative settle-wait spent this call: ${cumulativeWaitMs}ms. This is the #841/#883 ` +
          `clock-skew race; it did not clear within the attempt/time budget this helper allows.`,
      );
    }

    if (
      measurement.measured &&
      cumulativeWaitMs + waitMs > MAX_RECOVERABLE_SKEW_WAIT_MS
    ) {
      // The skew IS measured, and it is too large to recover inside this
      // call's reserved share of the test budget — fail fast and loudly with
      // the measured number, per #883 point 3, instead of retrying into a
      // bare Playwright timeout that names nothing.
      throw new Error(
        `[signed-in] gotoWithAccountSync(${path}): PGRST303 (JWT not yet valid) on ${pgrst303Path}. ` +
          `${describeSkewMeasurement(measurement)}, which needs a ${waitMs}ms settle-wait — pushing ` +
          `this call's cumulative wait to ${cumulativeWaitMs + waitMs}ms, over the ` +
          `${MAX_RECOVERABLE_SKEW_WAIT_MS}ms budget this function reserves from the whole test's ` +
          `60_000ms timeout (apps/web/playwright.config.ts \`timeout\`). Failing fast with the ` +
          `measured number instead of waiting into a bare timeout.`,
      );
    }

    cumulativeWaitMs += waitMs;
    console.log(
      `[signed-in] PGRST303 (JWT not yet valid) on ${pgrst303Path} during gotoWithAccountSync(${path}), ` +
        `attempt ${attempt}/${PGRST303_MAX_ATTEMPTS} — ${describeSkewMeasurement(measurement)}, waiting ` +
        `${waitMs}ms (cumulative ${cumulativeWaitMs}ms) and retrying the navigation.`,
    );
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

/** `page.reload()` with the same account-sync gate. */
export async function reloadWithAccountSync(page: Page): Promise<void> {
  await gotoWithAccountSync(page, page.url());
}

/**
 * The signed-in user's own access token, read out of the app's own
 * `@supabase/ssr` cookie jar (`sb-<host>-auth-token`, base64-encoded JSON,
 * chunked across `.0`/`.1` cookies when long).
 *
 * Taking it from the jar rather than minting one is the point: every readback
 * below then runs as the same principal the browser is running as, through the
 * same RLS the user is subject to. A service-role key would prove nothing
 * about what THIS user can see.
 */
export async function accessToken(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  const raw = cookies
    .filter((cookie) => cookie.name.includes("auth-token"))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((cookie) => cookie.value)
    .join("");

  if (!raw) {
    throw new Error(
      "No Supabase auth cookie in the browser context — the spec is NOT signed in.",
    );
  }

  const encoded = decodeURIComponent(raw).replace(/^base64-/, "");
  const session = JSON.parse(
    Buffer.from(encoded, "base64").toString("utf8"),
  ) as { access_token?: string };

  if (!session.access_token) {
    throw new Error(
      "Supabase auth cookie carries no access_token — the spec is NOT signed in.",
    );
  }

  return session.access_token;
}

/** A PostgREST reader/writer bound to one signed-in user's own JWT. */
export interface AccountClient {
  /** `select` against `path` (e.g. `tasks?select=id,title`). Fails on non-2xx. */
  rows: <T = Record<string, unknown>>(path: string) => Promise<T[]>;
  /** `delete` from `table` for this user only. Fails on non-2xx. */
  purge: (table: string) => Promise<void>;
  /**
   * `insert` rows into `table` with this user's own JWT, returning them.
   *
   * C2-S3 added this for the columns that have **no UI writer at all**: the
   * S3 people/commitment columns (`waiting_on_person_id`, `waiting_on_since`,
   * `is_commitment`) exist to be READ by the review surface and are set by
   * paths outside it. Seeding them here proves the render against real account
   * rows under real RLS, which is the claim; it is never used to stand in for
   * a write the app itself performs (those are always driven through the UI).
   */
  insert: <T = Record<string, unknown>>(
    table: string,
    rows: Record<string, unknown>[],
  ) => Promise<T[]>;
  /** `patch` rows matching `path` (e.g. `tasks?id=eq.x`). Fails on non-2xx. */
  patch: (path: string, body: Record<string, unknown>) => Promise<void>;
}

/**
 * PGRST303 ("JWT not yet valid") — bounded, signature-specific settle/retry.
 *
 * #841's closing comment (id 5197883937) named this the KNOWN post-`db
 * reset` clock race: this revert PR's OWN signed-in tier failed on run
 * 31040629745 / job 92423880451, `signed-in-account-truth.spec.ts:205`, with
 * PGRST303, on a tree containing none of that day's commits — the tier
 * itself is unstable right after a fresh reset, independent of app code.
 *
 * The exact wire shape was confirmed directly against the running local
 * Supabase stack (read-only probe: an HS256 JWT signed with the dev
 * JWT_SECRET, `nbf`/`iat` pushed into the future, sent to `GET
 * /rest/v1/capture_items`, no reset, no writes):
 *
 *   skew ≤ 5s  -> 200 (PostgREST's own leeway absorbs it)
 *   skew ≥ 120s -> 401 {"code":"PGRST303","message":"JWT not yet valid"}
 *
 * That is exactly the shape a freshly `supabase db reset` Postgres
 * container racing a freshly minted GoTrue token can produce for a few
 * seconds right after boot, and it is genuinely self-resolving: unlike every
 * other account failure this file tolerates or asserts on, PGRST303 clears
 * itself the moment real wall-clock time catches up past the token's `nbf`
 * — nothing is being masked, the SAME request is re-sent unmodified against
 * the SAME token after a short wait.
 *
 * The match stays narrow ON PURPOSE, the same way `TOLERATED_ACCOUNT_FAILURE`
 * above does: HTTP 401 AND a parsed JSON body with `code === "PGRST303"`,
 * nothing looser. A 403 from a broken RLS policy, a 400 from a bad column, a
 * 500, or any other 401 shape all rethrow on the FIRST attempt, immediately,
 * exactly as before this helper existed — a signed-in job must not stay
 * green through a broken grant, policy or column, and a retry that could
 * swallow one of those would be exactly that.
 */
const PGRST303_MAX_ATTEMPTS = 3;
// Used by `sendWithPgrst303Retry` below as its fixed settle wait (unchanged),
// AND by `gotoWithAccountSync` as the FLOOR under its measured wait (#883,
// reopened) — see that function's doc comment for why a measured-but-zero or
// unmeasurable reading must never wait LESS than this previously-known value.
const PGRST303_SETTLE_WAIT_MS = 1_500;

function isPgrst303(status: number, body: string): boolean {
  if (status !== 401) return false;
  try {
    const parsed = JSON.parse(body) as { code?: unknown };
    return parsed.code === "PGRST303";
  } catch {
    return false;
  }
}

/**
 * #883 (reopened) — `gotoWithAccountSync`'s own constants for the
 * measure-instead-of-guess retry. Kept separate from `PGRST303_MAX_ATTEMPTS`/
 * `PGRST303_SETTLE_WAIT_MS` above (which `sendWithPgrst303Retry` still uses
 * unchanged) because this function's failure mode — a whole Playwright TEST
 * timing out, not just one PostgREST call — is materially different and
 * needed its own budget reasoning (see the doc comment on
 * `gotoWithAccountSync` for the arithmetic).
 */
// Bounded time given to the already in-flight `capture_items` read to land
// on its own after a PGRST303 is seen, before treating it as blocking. Long
// enough that a real network response has time to arrive; short enough that
// it does not itself threaten the budget below.
export const PGRST303_GRACE_MS = 2_000;
// Added on top of the measured skew before flooring against
// `PGRST303_SETTLE_WAIT_MS`. The failing response's `Date` header (RFC 7231)
// has only whole-SECOND resolution, so up to 999ms of the "measured" skew is
// rounding noise this margin absorbs, plus a little slack for the retry's own
// `page.goto()` overhead.
export const SKEW_SETTLE_MARGIN_MS = 1_000;
// Cumulative cap, across every attempt ONE `gotoWithAccountSync` call makes,
// on how much settle-waiting (grace + measured waits) it may spend. See the
// "Budget arithmetic" doc comment on `gotoWithAccountSync` for the full
// 60_000ms-test-timeout accounting behind this number.
export const MAX_RECOVERABLE_SKEW_WAIT_MS = 20_000;

/**
 * Decode a JWT's payload WITHOUT verifying its signature.
 *
 * Safe here specifically because this only ever reads back a token this same
 * test process already holds via its own signed-in browser session (`GoTrue`
 * minted it, not this file — see `measurePgrst303Skew`'s doc comment for why
 * that rules out backdating the claims as a fix) purely to read `nbf`/`iat`
 * for a DIAGNOSTIC wait calculation. No authorization or trust decision is
 * ever made from the result — that would require verification.
 */
export function decodeJwtPayloadUnsafe(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error(
      `Expected a 3-part JWT (header.payload.signature), got ${parts.length} part(s).`,
    );
  }
  const json = Buffer.from(parts[1]!, "base64url").toString("utf8");
  return JSON.parse(json) as Record<string, unknown>;
}

export interface SkewMeasurement {
  /**
   * `false` when the skew could not be measured at all (no usable `Date`
   * header on the failing response, or the session JWT could not be read or
   * decoded) — this is DELIBERATELY not the same as "measured, skew is 0":
   * an unmeasurable reading must fall back to the `PGRST303_SETTLE_WAIT_MS`
   * floor, not be treated as "no skew" or "too large to recover".
   */
  measured: boolean;
  /** Milliseconds the `nbf`/`iat` claim is ahead of the server's own clock. 0 when `measured` is false, or when neither claim is in the future. */
  skewMs: number;
  /** Human-readable explanation, always present, for the CI log line. */
  detail: string;
}

/**
 * Measure the PGRST303 clock skew from the token's own claims and the
 * failing response's own clock — not the test runner's clock, which may be
 * skewed against BOTH the token issuer (GoTrue) and the validator
 * (PostgREST) in a different direction or amount.
 *
 * ## Why this measures rather than backdates
 *
 * `signIn()` gets its session through the app's real `/login` form, which
 * calls `supabase.auth.signInWithPassword()` — a real Supabase GoTrue auth
 * service call (`apps/web/src/app/login/page.tsx:74`), not a token minted by
 * this test harness. This file cannot choose the token's `nbf`/`iat`, so
 * backdating them (the structurally simplest fix, per #883's own guidance,
 * when a harness mints its own tokens) is not available here — measuring the
 * ACTUAL skew and waiting exactly that long is the honest alternative.
 *
 * ## Why the response's `Date` header, not `Date.now()`
 *
 * The token was minted by GoTrue's clock and is rejected by PostgREST's
 * clock; the TEST RUNNER's clock is a third party to that disagreement and
 * proves nothing about either. The failing response's own `Date` header is
 * generated by whichever service actually composed that HTTP response, at
 * the moment it was doing so — the closest available proxy for "the clock
 * PostgREST just validated `nbf`/`iat` against".
 */
export async function measurePgrst303Skew(
  page: Page,
  response: Response,
): Promise<SkewMeasurement> {
  let headers: Record<string, string>;
  try {
    headers = await response.headers();
  } catch (err) {
    return {
      measured: false,
      skewMs: 0,
      detail: `could not read the failing response's headers: ${(err as Error).message}`,
    };
  }
  const dateHeader = headers["date"];
  const serverNowMs = dateHeader ? Date.parse(dateHeader) : NaN;
  if (!Number.isFinite(serverNowMs)) {
    return {
      measured: false,
      skewMs: 0,
      detail: `the PGRST303 response carried no usable Date header (got ${JSON.stringify(dateHeader ?? null)})`,
    };
  }

  let token: string;
  try {
    token = await accessToken(page);
  } catch (err) {
    return {
      measured: false,
      skewMs: 0,
      detail: `could not read the session JWT to measure the skew: ${(err as Error).message}`,
    };
  }

  let payload: Record<string, unknown>;
  try {
    payload = decodeJwtPayloadUnsafe(token);
  } catch (err) {
    return {
      measured: false,
      skewMs: 0,
      detail: `could not decode the session JWT payload: ${(err as Error).message}`,
    };
  }

  let skewMs = 0;
  let detail =
    "no nbf/iat claim in the session JWT is ahead of the server's Date header";
  for (const claim of ["nbf", "iat"] as const) {
    const value = payload[claim];
    if (typeof value !== "number") continue;
    const claimMs = value * 1_000;
    const claimSkewMs = claimMs - serverNowMs;
    if (claimSkewMs > skewMs) {
      skewMs = claimSkewMs;
      detail = `${claim}=${new Date(claimMs).toISOString()} is ahead of the server's Date header (${new Date(serverNowMs).toISOString()})`;
    }
  }

  return { measured: true, skewMs, detail };
}

/** One-line summary of a `SkewMeasurement`, for CI log lines and thrown errors. */
export function describeSkewMeasurement(measurement: SkewMeasurement): string {
  return measurement.measured
    ? `measured skew ${measurement.skewMs}ms (${measurement.detail})`
    : `skew could not be measured (${measurement.detail}) — falling back to the ${PGRST303_SETTLE_WAIT_MS}ms floor`;
}

/**
 * Sends `send()` up to `PGRST303_MAX_ATTEMPTS` times. Retries ONLY on the
 * exact PGRST303 signature above, waiting `PGRST303_SETTLE_WAIT_MS` between
 * attempts; every other response (ok or not) returns on the first attempt.
 */
async function sendWithPgrst303Retry(
  send: () => Promise<APIResponse>,
  describe: string,
): Promise<{ response: APIResponse; body: string }> {
  for (let attempt = 1; attempt <= PGRST303_MAX_ATTEMPTS; attempt++) {
    const response = await send();
    const body = await response.text();
    if (response.ok() || !isPgrst303(response.status(), body)) {
      return { response, body };
    }
    if (attempt === PGRST303_MAX_ATTEMPTS) {
      return { response, body };
    }
    console.log(
      `[signed-in] PGRST303 (JWT not yet valid) on ${describe}, attempt ${attempt}/${PGRST303_MAX_ATTEMPTS} — settling ${PGRST303_SETTLE_WAIT_MS}ms and retrying the same request.`,
    );
    await new Promise((resolve) =>
      setTimeout(resolve, PGRST303_SETTLE_WAIT_MS),
    );
  }
  // Unreachable — the loop always returns by its last iteration.
  throw new Error(`sendWithPgrst303Retry exhausted attempts for ${describe}`);
}

export async function accountClient(
  page: Page,
  user: SeededUser,
  env: SupabaseEnv,
): Promise<AccountClient> {
  const token = await accessToken(page);
  const headers = {
    apikey: env.anonKey,
    Authorization: `Bearer ${token}`,
  };

  return {
    async rows<T = Record<string, unknown>>(path: string): Promise<T[]> {
      const { response, body } = await sendWithPgrst303Retry(
        () => page.request.get(`${env.url}/rest/v1/${path}`, { headers }),
        `GET ${path}`,
      );
      if (!response.ok()) {
        throw new Error(
          `PostgREST GET ${path} failed ${response.status()}: ${body}`,
        );
      }
      return JSON.parse(body) as T[];
    },
    async insert<T = Record<string, unknown>>(
      table: string,
      rows: Record<string, unknown>[],
    ): Promise<T[]> {
      const { response, body } = await sendWithPgrst303Retry(
        () =>
          page.request.post(`${env.url}/rest/v1/${table}`, {
            headers: {
              ...headers,
              "Content-Type": "application/json",
              Prefer: "return=representation",
            },
            data: rows,
          }),
        `POST ${table}`,
      );
      if (!response.ok()) {
        throw new Error(
          `PostgREST POST ${table} failed ${response.status()}: ${body}`,
        );
      }
      return JSON.parse(body) as T[];
    },
    async patch(path: string, body: Record<string, unknown>): Promise<void> {
      const { response, body: responseBody } = await sendWithPgrst303Retry(
        () =>
          page.request.patch(`${env.url}/rest/v1/${path}`, {
            headers: {
              ...headers,
              "Content-Type": "application/json",
              Prefer: "return=minimal",
            },
            data: body,
          }),
        `PATCH ${path}`,
      );
      if (!response.ok()) {
        throw new Error(
          `PostgREST PATCH ${path} failed ${response.status()}: ${responseBody}`,
        );
      }
    },
    async purge(table: string): Promise<void> {
      const { response, body } = await sendWithPgrst303Retry(
        () =>
          page.request.delete(
            `${env.url}/rest/v1/${table}?user_id=eq.${user.id}`,
            { headers: { ...headers, Prefer: "return=minimal" } },
          ),
        `DELETE ${table}`,
      );
      if (!response.ok()) {
        throw new Error(
          `PostgREST DELETE ${table} failed ${response.status()}: ${body}`,
        );
      }
    },
  };
}

/**
 * Rows this tier writes, in foreign-key-safe deletion order.
 *
 * ## Why the specs clean up after themselves
 *
 * CI runs them once against a freshly `supabase db reset` database, where
 * every purge is a no-op. The purge exists for the OTHER run: `review_entries`
 * carries a unique `(user, date)` index, so a second local run against the
 * same stack would find today already closed and a close-the-day spec would
 * fail for a reason that has nothing to do with the code. Resetting the whole
 * database between local runs would hide exactly the cross-spec collisions CI
 * is exposed to, so the specs are made re-runnable instead.
 */
const PURGE_ORDER = [
  "win_records",
  "review_entries",
  "execution_sessions",
  "calendar_blocks",
  "time_block_proposals",
  "rollup_summaries",
  "tasks",
  "capture_items",
] as const;

export async function purgeOwnRows(account: AccountClient): Promise<void> {
  for (const table of PURGE_ORDER) {
    await account.purge(table);
  }
}

/**
 * ONE known account failure is tolerated. Everything else is a test failure.
 *
 * The first thing this tier saw when it was pointed at a signed-in browser was
 * a silent `400` from the app's own fire-and-forget meta-learning write on the
 * triage-accept path:
 *
 *   POST /rest/v1/suggestion_records ->
 *   {"code":"23514","message":"new row for relation \"suggestion_records\"
 *    violates check constraint \"suggestion_records_resolved_after_created_check\""}
 *
 * It reproduces on GitHub's runners, so it is a product defect, not local clock
 * skew. It belongs to C1 criterion 5 ("triage audit-trail writes succeed
 * signed-in") and fixing it means touching app source, which this lane does not
 * own. Asserting it here would leave the new job permanently red on day one and
 * the seam would stay closed to everything else — so it is tolerated, and
 * PRINTED with its body into the CI log of every signed-in run. See the PR
 * body's AGENT-TODO.
 *
 * The tolerance is NARROW on purpose. An unconditional "log every 4xx" would
 * also swallow the next one — a broken grant answering `403` on `capture_items`
 * would print a single line into a green job and change nothing. So the known
 * case is named by table and status, and every other failed account call is
 * collected for the caller to assert on (`expectOnlyKnownAccountFailures`).
 */
const TOLERATED_ACCOUNT_FAILURE = {
  table: "suggestion_records",
  status: 400,
} as const;

export interface AccountFailureWatch {
  /** Failed account calls that are NOT the known criterion-5 defect. */
  unexpected: string[];
}

/**
 * PGRST303, for app-initiated background traffic this file cannot retry.
 *
 * `accountClient`'s own reads/writes and `gotoWithAccountSync`'s
 * `capture_items` gate (above) retry a PGRST303 by re-sending the SAME
 * request — that only works for traffic THIS file issues or explicitly
 * gates. Confirmed live during a 15x local repetition of this spec (proof
 * run for this lane, no `supabase db reset`, no seeded-data change): the
 * app's OWN background read of `rollup_summaries` hit the exact same clock
 * race —
 *   `[signed-in] account call FAILED 401 GET .../rollup_summaries ::
 *    {"code":"PGRST303","details":null,"hint":null,"message":"JWT issued at
 *    future"}`
 * — a request this file never issues and cannot re-send. Left unhandled,
 * that single transient response would permanently fail
 * `expectOnlyKnownAccountFailures`'s `afterEach` for the rest of that test,
 * which is exactly the false-red #841 exists to end.
 *
 * The fix is classification, not a retry: PostgREST's Kong gateway names its
 * OWN error code in a response HEADER the instant headers land — before the
 * body is downloaded — so it is safe to read from the SAME synchronous-risk
 * standpoint `TOLERATED_ACCOUNT_FAILURE` below already relies on (headers
 * arrive with `Network.responseReceived`; only the BODY needs a further
 * network wait, which is why this file's other classification stays off
 * `response.text()`). Confirmed live, read-only, against the shared local
 * stack, that the header names the SPECIFIC PostgREST error rather than
 * "some auth failure" — nothing looser is tolerated:
 *   RLS/grant denial (42501)      -> proxy-status: PostgREST; error=42501
 *   malformed/wrong-sig JWT (301) -> proxy-status: PostgREST; error=PGRST301
 *   clock-skew JWT (303)          -> proxy-status: PostgREST; error=PGRST303
 *
 * `isPgrst303Response`'s header read is still one microtask hop of latency,
 * so `watchAccountFailures` below pushes every qualifying failure into
 * `unexpected` FIRST — the same conservative default as always — and only
 * retracts the specific entry once the header check proves it PGRST303. If
 * that check is ever slower than the rest of the test (it resolves off
 * already-buffered header data, not a network wait, so in practice it is
 * not), the entry simply stays classified as unexpected: this can only ever
 * make the guard STRICTER than intended, never quieter than intended — a
 * signed-in job still cannot stay green through a broken grant, policy or
 * column by racing this check.
 */
function isPgrst303ProxyStatus(proxyStatus: string | undefined): boolean {
  return /(?:^|,)\s*PostgREST;\s*error=PGRST303\b/i.test(proxyStatus ?? "");
}

async function isPgrst303Response(response: Response): Promise<boolean> {
  if (response.status() !== 401) return false;
  try {
    const headers = await response.headers();
    return isPgrst303ProxyStatus(headers["proxy-status"]);
  } catch {
    return false;
  }
}

/**
 * Watch this page's PostgREST traffic.
 *
 * Set `SIGNED_IN_VERBOSE=1` to also print every `/rest/v1/` status/method/path
 * as it happens — the fastest way to tell "the app never issued the write" from
 * "the write was rejected" when a signed-in spec fails in CI.
 */
export function watchAccountFailures(page: Page): AccountFailureWatch {
  const verbose = process.env.SIGNED_IN_VERBOSE === "1";
  const watch: AccountFailureWatch = { unexpected: [] };

  page.on("response", (response) => {
    const url = response.url();
    if (!url.includes("/rest/v1/")) return;

    const method = response.request().method();
    const path = url.split("?")[0]!;
    const status = response.status();

    if (verbose) {
      console.log(`[signed-in] ${status} ${method} ${path}`);
    }
    if (status < 400) return;

    // Classified synchronously, from status + table alone: the body arrives on
    // a promise that may resolve after the test ends, and a check that can miss
    // its own input is not a check.
    const knownTolerated =
      status === TOLERATED_ACCOUNT_FAILURE.status &&
      path.endsWith(`/${TOLERATED_ACCOUNT_FAILURE.table}`);

    const entry = `${status} ${method} ${path}`;
    // Conservative default: push it. The PGRST303 check below may retract
    // THIS entry once it resolves — see isPgrst303Response's comment for why
    // that retraction cannot arrive too late in practice, and why "too late"
    // still fails safe (stricter, not quieter) even if it did.
    if (!knownTolerated) {
      watch.unexpected.push(entry);
    }

    void (async () => {
      const pgrst303 = !knownTolerated && (await isPgrst303Response(response));
      if (pgrst303) {
        const index = watch.unexpected.indexOf(entry);
        if (index !== -1) watch.unexpected.splice(index, 1);
      }
      const tolerated = knownTolerated || pgrst303;
      const body = await response.text().catch(() => "");
      console.log(
        `[signed-in] account call FAILED${tolerated ? ` (known, tolerated${pgrst303 ? " — PGRST303 clock-skew" : ""})` : ""} ${status} ${method} ${path} :: ${body.slice(0, 400)}`,
      );
    })();
  });

  return watch;
}

/**
 * Fail the test if any account call failed other than the one known defect.
 * Called from `afterEach` so it covers every page a spec opened.
 */
export function expectOnlyKnownAccountFailures(
  watches: readonly AccountFailureWatch[],
): void {
  const unexpected = watches.flatMap((watch) => watch.unexpected);
  expect(
    unexpected,
    `An account read or write failed that is NOT the known #737 criterion-5 defect (${TOLERATED_ACCOUNT_FAILURE.status} on ${TOLERATED_ACCOUNT_FAILURE.table}) and NOT a PGRST303 clock-skew read (#841). A signed-in job must not stay green through a broken grant, policy or column.`,
  ).toEqual([]);
}

/** Today's date as the BROWSER's local calendar day (`YYYY-MM-DD`). */
export async function localDay(page: Page): Promise<string> {
  return page.evaluate(() => {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  });
}
