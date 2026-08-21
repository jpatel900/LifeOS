import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Page, Response } from "@playwright/test";
import { gotoWithAccountSync } from "../../tests/e2e/helpers/signedInAccount";

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
 */

type ResponseListener = (response: Response) => void;

function fakeResponse(
  url: string,
  method: string,
  status: number,
  body: string,
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
 */
class FakePage {
  private listeners = new Set<ResponseListener>();
  gotoCount = 0;

  constructor(private readonly perAttempt: (attempt: number) => Response[]) {}

  on(event: "response", listener: ResponseListener): void {
    if (event === "response") this.listeners.add(listener);
  }

  off(event: "response", listener: ResponseListener): void {
    if (event === "response") this.listeners.delete(listener);
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

const AREAS_PGRST303 = () =>
  fakeResponse(
    "http://127.0.0.1:15431/rest/v1/areas?select=*",
    "GET",
    401,
    JSON.stringify({ code: "PGRST303", message: "JWT not yet valid" }),
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
