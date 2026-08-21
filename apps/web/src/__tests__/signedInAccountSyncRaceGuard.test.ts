import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Page, Response } from "@playwright/test";
import {
  gotoWithAccountSync,
  PGRST303_GRACE_MS,
  SKEW_SETTLE_MARGIN_MS,
  MAX_RECOVERABLE_SKEW_WAIT_MS,
} from "../../tests/e2e/helpers/signedInAccount";

/**
 * #883 — logic-tier proof for the signed-in wait's early-response race.
 *
 * No Docker in this sandbox means the `@signed-in` Playwright tier (real
 * Supabase, real browser) cannot run locally. This harness instead fakes
 * Playwright's `Page` down to exactly the surface `gotoWithAccountSync`
 * touches (`on`/`off`/`goto`/`waitForResponse`) and drives its retry logic
 * directly, so the race and its fix are provable without a browser.
 *
 * ## The race this reproduces
 *
 * `gotoWithAccountSync` waits for a `capture_items` GET to resolve `ok()`.
 * That request is only ever issued by the app's `syncPersistedAreas` effect
 * AFTER its own `listAreas()` GET (`/rest/v1/areas`) has already succeeded —
 * see `WorkflowContext.tsx`'s `syncPersistedAreas` and
 * `lib/data/workflow/areas.ts`'s `listAreas` (`if (error) throw ...`). If
 * `areas` 401s with PGRST303 (the exact post-`supabase db reset` clock-skew
 * shape #841 already named and fixed for `capture_items`), `listAreas`
 * throws, `syncPersistedAreas`'s `catch` routes to `markPersistedLoadFailure`,
 * and `capture_items` is NEVER requested — so a watch scoped to
 * `capture_items` alone sees nothing, and the wait dies at the bare 60s
 * timeout with no retry and no diagnostic line. That is the exact shape of
 * both #883 CI sightings (runs 32394063330 and 32435308598): both failed at
 * `signedInAccount.ts:193` inside `openSignedInToday`'s call to `signIn()`,
 * neither log carries a `[signed-in] PGRST303 …` line before the timeout.
 *
 * This test simulates precisely that: a PGRST303 on `/rest/v1/areas`, and
 * `capture_items` never fired on the first attempt. Old code (watch scoped
 * to `capture_items` only) times out and rethrows with zero retries — proven
 * below by reverting `isTrackedRestGet`'s scope in isolation (see the
 * `it.skip`-free RED case documented in the PR body's CI evidence, captured
 * by running this file against the pre-fix source). Fixed code (watch scoped
 * to any `/rest/v1/` GET) retries once, `areas` succeeds on attempt 2, and
 * `capture_items` resolves — proving the fix without weakening the SUCCESS
 * predicate, which stays pinned to `capture_items` throughout.
 *
 * ## #883, reopened — the SECOND describe block below
 *
 * The widened watch above shipped in PR #893 and worked (confirmed live in
 * CI job 96699259913): the `[signed-in] PGRST303 … attempt 1/3 — settling
 * 1500ms` line appeared, then the test still died at a bare 60s timeout.
 * Tracing this: `sawPgrst303` was set within milliseconds by the response
 * listener, but the OLD retry loop only ever consulted it inside the `catch`
 * of `await rowsLoaded` — which only rejects once ITS OWN internal 60s
 * `waitForResponse` timeout expires. That alone burns the whole per-test
 * budget (`playwright.config.ts` `timeout: 60_000`) before the retry gets a
 * turn. Both tests above still pass unmodified against the new code (the
 * 60_000+1_500ms advance simply over-covers what the fix now needs), so they
 * remain valid regression coverage for the widened-GET-scope fix. The second
 * `describe` block below is new coverage for the reopened concern: fast
 * detection via a race (not a wait-for-timeout), a MEASURED settle wait
 * (JWT `nbf`/`iat` vs. the failing response's own `Date` header) instead of
 * a fixed guess, a fail-fast path when the measured skew is too large to
 * recover inside the test's budget, and a guard against a stray PGRST303 on
 * unrelated background traffic (e.g. `rollup_summaries`) turning a run that
 * was always going to pass into a false retry or a false failure.
 */

type ResponseListener = (response: Response) => void;
type FakeCookie = { name: string; value: string };

function fakeResponse(
  url: string,
  method: string,
  status: number,
  body: string,
  headers: Record<string, string> = {},
): Response {
  return {
    url: () => url,
    request: () =>
      ({ method: () => method }) as Response["request"] extends () => infer R
        ? R
        : never,
    ok: () => status >= 200 && status < 300,
    status: () => status,
    text: () => Promise.resolve(body),
    headers: () => Promise.resolve(headers),
  } as unknown as Response;
}

/**
 * A minimal fake of the `Page` surface `gotoWithAccountSync` actually calls.
 * `goto()` fires its scripted response(s) SYNCHRONOUSLY, after the listeners
 * for that attempt are already registered — matching the real arm-before-act
 * ordering `gotoWithAccountSync` uses (`page.on`/`page.waitForResponse` are
 * both called before `page.goto`), which this lane confirmed by reading the
 * source: that ordering was never the bug, so the fake does not need to
 * model network-arrival timing to reproduce #883.
 *
 * `cookies` backs `context().cookies()`, which `accessToken()` (and so
 * `measurePgrst303Skew`) reads to find the session JWT — needed for the
 * measured-skew tests below. Tests that don't pass `cookies` get an empty
 * jar, matching the two ORIGINAL tests above: `accessToken()` throws for
 * them, `measurePgrst303Skew` reports `measured: false`, and the retry falls
 * back to the `PGRST303_SETTLE_WAIT_MS` floor — which is exactly why those
 * two tests still pass unmodified against the new code.
 */
class FakePage {
  private listeners = new Set<ResponseListener>();
  gotoCount = 0;

  constructor(
    private readonly perAttempt: (attempt: number) => Response[],
    private readonly cookies: FakeCookie[] = [],
  ) {}

  on(event: "response", listener: ResponseListener): void {
    if (event === "response") this.listeners.add(listener);
  }

  off(event: "response", listener: ResponseListener): void {
    if (event === "response") this.listeners.delete(listener);
  }

  context() {
    return { cookies: async () => this.cookies };
  }

  async goto(_path: string): Promise<null> {
    this.gotoCount += 1;
    for (const response of this.perAttempt(this.gotoCount)) {
      for (const listener of [...this.listeners]) listener(response);
    }
    return null;
  }

  waitForResponse(
    predicate: (response: Response) => boolean,
    options: { timeout: number },
  ): Promise<Response> {
    return new Promise((resolve, reject) => {
      const listener: ResponseListener = (response) => {
        if (!predicate(response)) return;
        cleanup();
        resolve(response);
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(
          new Error(
            `page.waitForResponse: Test timeout of ${options.timeout}ms exceeded.`,
          ),
        );
      }, options.timeout);
      const cleanup = () => {
        clearTimeout(timer);
        this.listeners.delete(listener);
      };
      this.listeners.add(listener);
    });
  }
}

/** A real HTTP `Date` header string, fixed so tests are deterministic. */
const SERVER_DATE_MS = Date.parse("2026-08-21T00:00:00.000Z");
const SERVER_DATE_HEADER = new Date(SERVER_DATE_MS).toUTCString();

/** base64url-encodes a claims object into an (unsigned) 3-part JWT string — good enough for `decodeJwtPayloadUnsafe`, which never checks the signature. */
function fakeJwt(claims: Record<string, unknown>): string {
  const b64url = (value: unknown) =>
    Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  return `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(claims)}.fakesignature`;
}

/** A cookie jar shaped like `accessToken()` expects: `sb-*-auth-token` -> base64 JSON `{ access_token }`. */
function fakeAuthCookie(accessToken: string): FakeCookie[] {
  const session = { access_token: accessToken };
  const value = Buffer.from(JSON.stringify(session), "utf8").toString("base64");
  return [{ name: "sb-127-auth-token", value }];
}

/** `nbf` set `skewMs` ahead of `SERVER_DATE_HEADER` — the exact clock-skew shape PGRST303 reports. */
function skewedAuthCookies(skewMs: number): FakeCookie[] {
  return fakeAuthCookie(
    fakeJwt({ nbf: (SERVER_DATE_MS + skewMs) / 1_000, sub: "test-user" }),
  );
}

const AREAS_PGRST303 = () =>
  fakeResponse(
    "http://127.0.0.1:15431/rest/v1/areas?select=*",
    "GET",
    401,
    JSON.stringify({ code: "PGRST303", message: "JWT not yet valid" }),
    { date: SERVER_DATE_HEADER },
  );

const ROLLUP_SUMMARIES_PGRST303 = () =>
  fakeResponse(
    "http://127.0.0.1:15431/rest/v1/rollup_summaries?select=*",
    "GET",
    401,
    JSON.stringify({ code: "PGRST303", message: "JWT issued at future" }),
    { date: SERVER_DATE_HEADER },
  );

const CAPTURE_ITEMS_OK = () =>
  fakeResponse(
    "http://127.0.0.1:15431/rest/v1/capture_items?select=*",
    "GET",
    200,
    "[]",
  );

describe("gotoWithAccountSync survives a PGRST303 on an upstream read (#883)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries the whole navigation when `areas` (not `capture_items`) hits PGRST303, and succeeds once the retry's `areas` read clears", async () => {
    // Attempt 1: exactly the #883 shape — `listAreas()` 401s PGRST303, so
    // `syncPersistedAreas` never reaches `syncPersistedWorkflowRows` and
    // `capture_items` is never requested at all.
    // Attempt 2 (only reached if the retry fires): the clock has caught up,
    // `areas` succeeds silently (app code, not watched here) and
    // `capture_items` resolves — the real signal `gotoWithAccountSync` waits on.
    const page = new FakePage((attempt) =>
      attempt === 1 ? [AREAS_PGRST303()] : [CAPTURE_ITEMS_OK()],
    );

    const promise = gotoWithAccountSync(page as unknown as Page, "/");

    // Attempt 1's `capture_items` wait times out at 60s (nothing ever
    // satisfies it), and the settle wait before the retry is 1_500ms
    // (`PGRST303_SETTLE_WAIT_MS`) — advance past both in one jump.
    await vi.advanceTimersByTimeAsync(60_000 + 1_500);

    await expect(promise).resolves.toBeUndefined();
    // Proves a retry actually happened — not a first-attempt accident.
    expect(page.gotoCount).toBe(2);
  });

  it("still rethrows the bare timeout, unretried, when no PGRST303 was ever observed on any read", async () => {
    // A plain, non-PGRST303 hang (e.g. capture_items simply never arrives,
    // no error of any shape) must not be retried — the negative control
    // asserted throughout signedInAccount.ts: only the exact PGRST303
    // signature triggers a retry, nothing looser.
    const page = new FakePage(() => []);

    const promise = gotoWithAccountSync(page as unknown as Page, "/");
    const assertion = expect(promise).rejects.toThrow(
      /Test timeout of 60000ms exceeded/,
    );

    await vi.advanceTimersByTimeAsync(60_000);
    await assertion;

    // No retry: exactly one navigation attempt was made.
    expect(page.gotoCount).toBe(1);
  });
});

describe("gotoWithAccountSync measures the clock skew instead of guessing at it (#883, reopened)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("(a) recovers from a SMALL measured skew using exactly that wait, not the old blind 60s+1.5s path", async () => {
    const skewMs = 3_000;
    const page = new FakePage(
      (attempt) => (attempt === 1 ? [AREAS_PGRST303()] : [CAPTURE_ITEMS_OK()]),
      skewedAuthCookies(skewMs),
    );

    const promise = gotoWithAccountSync(page as unknown as Page, "/");

    // Detection is a race (fast), so the ONLY real waits are the fixed grace
    // window plus the measured skew + its margin — nowhere near the old
    // 60_000ms `waitForResponse` timeout this scenario used to need.
    await vi.advanceTimersByTimeAsync(
      PGRST303_GRACE_MS + skewMs + SKEW_SETTLE_MARGIN_MS + 100,
    );

    await expect(promise).resolves.toBeUndefined();
    expect(page.gotoCount).toBe(2);
  });

  it("(b) fails FAST with the measured skew named in the error when the skew is too large to recover in the test's budget — RED against the pre-fix source (see PR body)", async () => {
    // The docstring's own observed shape: "skew >= 120s -> 401". A skew this
    // size cannot be waited out inside MAX_RECOVERABLE_SKEW_WAIT_MS, so this
    // must fail immediately and loudly instead of retrying into more of the
    // same skew.
    const skewMs = 130_000;
    const page = new FakePage(
      () => [AREAS_PGRST303()], // every attempt would see the identical unresolved skew
      skewedAuthCookies(skewMs),
    );

    const promise = gotoWithAccountSync(page as unknown as Page, "/");
    const assertion = expect(promise).rejects.toThrow(
      /measured skew 130000ms[\s\S]*over the 20000ms budget/,
    );

    // Only the grace window elapses before the fail-fast throw — proving
    // this does NOT wait into (or anywhere near) a 60s timeout.
    await vi.advanceTimersByTimeAsync(PGRST303_GRACE_MS);
    await assertion;

    // Exactly one attempt: no pointless retries into the same unresolved skew.
    expect(page.gotoCount).toBe(1);
  });

  it("(c) adds ZERO delay when there is no PGRST303 at all", async () => {
    const page = new FakePage((attempt) =>
      attempt === 1 ? [CAPTURE_ITEMS_OK()] : [],
    );

    const promise = gotoWithAccountSync(page as unknown as Page, "/");
    // No timers need to advance at all — the success response resolves the
    // race on the very first attempt with no wait scheduled.
    await vi.advanceTimersByTimeAsync(0);

    await expect(promise).resolves.toBeUndefined();
    expect(page.gotoCount).toBe(1);
  });

  it("does not fail (or retry) a run where an UNRELATED background read hits PGRST303 but the real capture_items load succeeds anyway", async () => {
    // Live-observed shape from this file's own `watchAccountFailures` doc
    // comment: the app's background `rollup_summaries` poll can hit the same
    // clock race independently of the areas/capture_items chain this
    // function actually gates on. A regression that treated ANY detected
    // PGRST303 as fatal would turn this passing run into a false retry or a
    // false failure — the grace window exists specifically to prevent that.
    const page = new FakePage(
      (attempt) =>
        attempt === 1 ? [ROLLUP_SUMMARIES_PGRST303(), CAPTURE_ITEMS_OK()] : [],
      skewedAuthCookies(130_000), // even a large skew must not matter here
    );

    const promise = gotoWithAccountSync(page as unknown as Page, "/");
    // Generous enough to cover the grace window regardless of which of the
    // two responses' microtask chains happens to settle the race first.
    await vi.advanceTimersByTimeAsync(PGRST303_GRACE_MS);

    await expect(promise).resolves.toBeUndefined();
    // No retry: capture_items landed on the very first attempt.
    expect(page.gotoCount).toBe(1);
  });

  it("MAX_RECOVERABLE_SKEW_WAIT_MS is exported so this suite's cap assertions cannot silently drift from the source", () => {
    expect(MAX_RECOVERABLE_SKEW_WAIT_MS).toBe(20_000);
  });
});
