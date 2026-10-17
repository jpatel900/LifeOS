import { randomUUID } from "node:crypto";
import {
  expect,
  type APIRequestContext,
  type Locator,
  type Page,
  type Request,
  type Response,
} from "@playwright/test";
import { PARSE_CAPTURE_CLIENT_DEADLINE_MS } from "../../../src/lib/ai/requestDeadline";

/**
 * Shared helpers for the B8 production smoke (issue #241).
 *
 * Design rules encoded here:
 * - No production identifiers are hardcoded. Everything comes from env.
 * - Every row the smoke creates carries an identifiable marker so it can be
 *   found unambiguously against a populated prod account AND cleaned up
 *   afterwards without ever touching rows the smoke did not create.
 * - Provider prerequisites are DETECTED, not assumed: legs that need a live
 *   provider (auth/Supabase) skip with a clear message rather than crash.
 */

export interface SmokeEnv {
  baseURL: string;
  email: string | null;
  password: string | null;
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  googleTestCalendarId: string | null;
}

export function readSmokeEnv(): SmokeEnv {
  return {
    baseURL: (process.env.SMOKE_BASE_URL ?? "").trim(),
    email: emptyToNull(process.env.SMOKE_EMAIL),
    password: emptyToNull(process.env.SMOKE_PASSWORD),
    supabaseUrl: emptyToNull(process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabaseAnonKey: emptyToNull(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    googleTestCalendarId: emptyToNull(
      process.env.SMOKE_GOOGLE_TEST_CALENDAR_ID,
    ),
  };
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Stable run identifier shared by every row this smoke creates. Kept short and
 * URL/text safe. Callers build markers off this so cleanup can prefix-match.
 */
export function newRunId(): string {
  return `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
}

export const MARKER_PREFIX = "smoke-b8-";

/** Marker embedded into capture text and derived task titles. */
export function marker(runId: string): string {
  return `${MARKER_PREFIX}${runId}-`;
}

/** The capture text the golden journey seeds, carrying the run marker. */
export function goldenCaptureText(runId: string): string {
  return `${marker(runId)}golden capture needs triage and planning`;
}

/**
 * Whether authenticated (persisted) legs can run at all. Requires both
 * credentials and a configured Supabase target; otherwise login cannot
 * succeed and the persisted legs must be skipped, not failed.
 */
export function canAuthenticate(env: SmokeEnv): boolean {
  return Boolean(
    env.email && env.password && env.supabaseUrl && env.supabaseAnonKey,
  );
}

/**
 * Form-based login via the deployed `/login` page so the Supabase browser
 * session is written into the page context and carried by the app.
 * Returns true on success. Callers gate persisted legs on the result.
 *
 * #719: success is confirmed by the SESSION, not by a destination path. This
 * helper used to wait for `/settings/areas`, but #592 moved the post-sign-in
 * destination to Today (`/`) so Today owns the first-use decision, and #688
 * added a `?next=` override on top of that — so the path was never a stable
 * success signal. Observed against a local authenticated target on
 * 2026-07-25: the sign-in SUCCEEDED (the follow-up parse request carried a
 * bearer token and was served 200) while this helper reported failure and the
 * journey silently degraded to its unauthenticated branch. A smoke that
 * cannot tell "signed in" from "signed out" is the exact silent-pass failure
 * this file exists to prevent, so the check is now:
 *   1. the app navigated AWAY from /login (a rejected sign-in stays put and
 *      renders a sanitized alert), and
 *   2. a Supabase session token is actually present in the browser context —
 *      which is the thing every persisted leg downstream depends on.
 */
export async function login(page: Page, env: SmokeEnv): Promise<boolean> {
  if (!env.email || !env.password) {
    return false;
  }

  await page.goto("/login");
  await page.locator("#email").fill(env.email);
  await page.locator("#password").fill(env.password);
  await page.getByRole("button", { name: "Sign in" }).click();

  try {
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
      timeout: 20_000,
    });
  } catch {
    return false;
  }

  return (await readSupabaseAccessToken(page)) !== null;
}

/**
 * Read the Supabase access token out of the signed-in browser session. Used to
 * confirm sign-in and to authenticate marker-scoped cleanup. Returns null when
 * unavailable.
 *
 * #719: this used to read localStorage only. FR-029 moved the app's browser
 * client to `@supabase/ssr`'s `createBrowserClient`, which stores the session
 * in a COOKIE (`sb-<ref>-auth-token`, value `base64-<base64url JSON>`, split
 * into `.0`/`.1`… chunks when large) so the session survives restarts and the
 * middleware can refresh it server-side. Observed against a local
 * authenticated target on 2026-07-25: localStorage held only
 * `lifeos.moments.preferences`, and the single cookie `sb-127-auth-token`
 * (2377 chars) held the session — so this helper returned null on every
 * authenticated run and cleanup logged "could not authenticate; rows may
 * persist" while the journey's rows stayed behind. Cookies are read first,
 * with the old localStorage idiom kept as a fallback so a target still on the
 * supabase-js client keeps working.
 */
export async function readSupabaseAccessToken(
  page: Page,
): Promise<string | null> {
  return page.evaluate(() => {
    const decodeSession = (raw: string): string | null => {
      try {
        let json = raw;
        if (json.startsWith("base64-")) {
          const encoded = json.slice("base64-".length);
          // `@supabase/ssr` encodes base64url; atob needs standard base64.
          const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
          const padded = normalized.padEnd(
            normalized.length + ((4 - (normalized.length % 4)) % 4),
            "=",
          );
          const bytes = Uint8Array.from(window.atob(padded), (character) =>
            character.charCodeAt(0),
          );
          json = new TextDecoder().decode(bytes);
        }
        const parsed = JSON.parse(json) as { access_token?: unknown };
        return typeof parsed?.access_token === "string"
          ? parsed.access_token
          : null;
      } catch {
        return null;
      }
    };

    // 1. Cookie storage (@supabase/ssr, the app's current client).
    try {
      const chunks = new Map<string, Map<number, string>>();
      for (const entry of document.cookie.split(";")) {
        const separator = entry.indexOf("=");
        if (separator === -1) {
          continue;
        }
        const name = entry.slice(0, separator).trim();
        const value = entry.slice(separator + 1).trim();
        const match = /^(sb-.*-auth-token)(?:\.(\d+))?$/.exec(name);
        if (!match) {
          continue;
        }
        const base = match[1];
        const index = match[2] ? Number(match[2]) : 0;
        if (!chunks.has(base)) {
          chunks.set(base, new Map());
        }
        chunks.get(base)!.set(index, decodeURIComponent(value));
      }
      for (const parts of chunks.values()) {
        const ordered = [...parts.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([, value]) => value)
          .join("");
        const token = decodeSession(ordered);
        if (token) {
          return token;
        }
      }
    } catch {
      // Blocked cookies or unexpected shape: fall through to localStorage.
    }

    // 2. localStorage storage (supabase-js idiom), kept as a fallback.
    try {
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (!key || !key.startsWith("sb-") || !key.endsWith("-auth-token")) {
          continue;
        }
        const raw = window.localStorage.getItem(key);
        if (!raw) {
          continue;
        }
        const token = decodeSession(raw);
        if (token) {
          return token;
        }
      }
    } catch {
      // Blocked storage or unexpected shape: treat as no token.
    }

    return null;
  });
}

export interface CleanupResult {
  table: string;
  ok: boolean;
  detail: string;
}

/**
 * Best-effort, marker-scoped cleanup, run against the Supabase REST API in the
 * authenticated user's RLS scope. Every filter is prefix-scoped to the run
 * marker, so it can NEVER touch rows the smoke did not create (an
 * under-matching filter only ever deletes fewer rows, never foreign ones).
 *
 * Reliable anchors, per docs/DATA_MODEL.md:
 * - `capture_items.raw_text` carries the marker verbatim (doctrine guarantees
 *   raw capture is preserved). Deleting these cascades to child tasks/blocks
 *   IF the schema declares ON DELETE CASCADE; where it does not, downstream
 *   rows may remain.
 * - `tasks.title` carries the marker ONLY when the mock parser is active. With
 *   an AI parser configured the title may be rewritten, so this leg is truly
 *   best-effort and may legitimately match nothing.
 *
 * Other journey tables (`time_block_proposals`, `calendar_blocks`,
 * `execution_sessions`, `review_entries`) have no free-text column the UI lets
 * the smoke stamp with the marker (their descriptive fields are jsonb), so
 * they are intentionally NOT targeted here to avoid silent false-success. They
 * are removed only if `capture_items`/`tasks` deletion cascades to them.
 *
 * Note: this only truly runs against a real Supabase target. In local
 * mock/demo mode there is no Supabase session, so it is a reported no-op.
 */
export async function cleanupSmokeRows(
  request: APIRequestContext,
  env: SmokeEnv,
  accessToken: string,
  runId: string,
): Promise<CleanupResult[]> {
  const results: CleanupResult[] = [];

  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    return results;
  }

  const prefix = marker(runId);
  // `tasks` first (best-effort, mock-parser only), then the guaranteed
  // `capture_items` anchor last so a cascade can sweep any remaining children.
  const targets: { table: string; column: string }[] = [
    { table: "tasks", column: "title" },
    { table: "capture_items", column: "raw_text" },
  ];

  for (const { table, column } of targets) {
    const url =
      `${env.supabaseUrl}/rest/v1/${table}` +
      `?${column}=like.${encodeURIComponent(`${prefix}%`)}`;
    try {
      const response = await request.delete(url, {
        headers: {
          apikey: env.supabaseAnonKey,
          Authorization: `Bearer ${accessToken}`,
          // return=representation so we can report how many rows matched
          // instead of blindly logging "deleted" on a zero-match 204.
          Prefer: "return=representation",
        },
      });
      let matched = "unknown";
      try {
        const rows = (await response.json()) as unknown[];
        matched = Array.isArray(rows) ? String(rows.length) : "unknown";
      } catch {
        // No body (e.g. minimal preference upstream); leave matched unknown.
      }
      results.push({
        table,
        ok: response.ok(),
        detail: response.ok()
          ? `deleted ${matched} row(s) (${response.status()})`
          : `status ${response.status()}`,
      });
    } catch (error) {
      results.push({
        table,
        ok: false,
        detail: error instanceof Error ? error.message : "delete failed",
      });
    }
  }

  return results;
}

/**
 * Assert the JSON degraded-mode contract of an endpoint: it must answer with
 * a designed, parseable payload (never a 5xx crash), and its `status`/mode
 * must be one of the known designed states.
 */
export async function assertDesignedJson(
  request: APIRequestContext,
  path: string,
  assertion: (body: Record<string, unknown>, status: number) => void,
): Promise<Record<string, unknown>> {
  const response = await request.get(path);
  const status = response.status();
  // A designed degradation answers; it never 5xx-crashes at the config level.
  expect(status, `${path} returned server error ${status}`).toBeLessThan(500);
  const body = (await response.json()) as Record<string, unknown>;
  assertion(body, status);
  return body;
}

/**
 * Plain-language cause for an account with no areas (#1026). Since #1050 the
 * app refuses to Sort with no areas, so no parse request is ever sent.
 */
export const NO_AREAS_SMOKE_MESSAGE =
  "The smoke account has no areas, so Sort did not run. Add one area to the smoke account.";

/** Start of the app's own no-areas Sort message (workflowContext/captureParse.ts). */
const NO_AREAS_SORT_COPY = "Add an area before sorting";

/**
 * How long the smoke waits for Sort to answer. The app stops waiting after
 * PARSE_CAPTURE_CLIENT_DEADLINE_MS (35 seconds) and shows a failure card, so
 * the smoke waits 10 seconds more: a slow answer still counts, and a stopped
 * request has time to show its card (#1026).
 */
export const SORT_ANSWER_WAIT_MS = PARSE_CAPTURE_CLIENT_DEADLINE_MS + 10_000;

/**
 * Read-only check, run once after sign-in: does the smoke account have at
 * least one active area (the same filter the app loads areas with)? Returns
 * null when the check itself could not run, so a network hiccup never fails
 * the smoke here; the Sort step below still names the cause. It reads one id
 * and writes nothing.
 */
export async function smokeAccountHasActiveArea(
  request: APIRequestContext,
  env: SmokeEnv,
  accessToken: string,
): Promise<boolean | null> {
  if (!env.supabaseUrl || !env.supabaseAnonKey) return null;
  try {
    const response = await request.get(
      `${env.supabaseUrl}/rest/v1/areas?select=id&is_active=eq.true&limit=1`,
      {
        headers: {
          apikey: env.supabaseAnonKey,
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );
    if (!response.ok()) return null;
    const rows = (await response.json()) as unknown;
    return Array.isArray(rows) ? rows.length > 0 : null;
  } catch {
    return null;
  }
}

/**
 * Press Sort on one capture row and return the `/api/parse-capture` answer.
 *
 * Before #1026 the smoke only waited for that answer, so when Sort never sent
 * a request (no areas) or the app gave up on it, the run hung until the
 * 120-second test limit with no hint why. Now the wait is raced against the
 * row's own failure card. If the card wins, the run fails at once with a
 * plain message naming the cause. If neither shows up within
 * SORT_ANSWER_WAIT_MS, it fails with what it saw.
 */
export async function clickSortAndWaitForAnswer(
  page: Page,
  captureRow: Locator,
): Promise<Response> {
  const isSortRequest = (request: Request) =>
    request.url().includes("/api/parse-capture") && request.method() === "POST";
  const seen = { sent: false, failed: false };
  const onRequest = (request: Request) => {
    if (isSortRequest(request)) seen.sent = true;
  };
  const onRequestFailed = (request: Request) => {
    if (isSortRequest(request)) seen.failed = true;
  };
  page.on("request", onRequest);
  page.on("requestfailed", onRequestFailed);

  type Outcome =
    | { kind: "answer"; response: Response }
    | { kind: "failure-card" }
    | { kind: "nothing" };
  // Both waits settle instead of throwing, so the losing one never surfaces
  // as an unhandled error later in the run.
  const answer: Promise<Outcome> = page
    .waitForResponse((response) => isSortRequest(response.request()), {
      timeout: SORT_ANSWER_WAIT_MS,
    })
    .then(
      (response) => ({ kind: "answer", response }) as const,
      () => ({ kind: "nothing" }) as const,
    );
  const failureCard = captureRow.getByTestId(/^triage-sheet-sort-failed-/);
  const cardShown: Promise<Outcome> = failureCard
    .waitFor({ state: "visible", timeout: SORT_ANSWER_WAIT_MS })
    .then(
      () => ({ kind: "failure-card" }) as const,
      () => ({ kind: "nothing" }) as const,
    );

  const startedAt = Date.now();
  try {
    await captureRow.getByTestId(/^triage-sheet-sort-/).click();
    let outcome = await Promise.race([answer, cardShown]);
    if (outcome.kind === "failure-card" && seen.sent && !seen.failed) {
      // A sent request that was answered shows its card right after the
      // answer arrives (the signed-out branch expects exactly that). Give the
      // answer a moment to win before calling it lost.
      outcome = await Promise.race([
        answer,
        new Promise<Outcome>((resolve) =>
          setTimeout(() => resolve({ kind: "failure-card" }), 2_000),
        ),
      ]);
    }
    if (outcome.kind === "answer") return outcome.response;

    const seconds = Math.round((Date.now() - startedAt) / 1000);
    const limitSeconds = PARSE_CAPTURE_CLIENT_DEADLINE_MS / 1000;
    if (outcome.kind === "nothing") {
      throw new Error(
        `Sort showed no answer and no failure message within ${SORT_ANSWER_WAIT_MS / 1000} seconds ` +
          `(the app's own limit is ${limitSeconds} seconds). ` +
          (seen.sent
            ? "Its request was sent but never answered."
            : "Its request was never sent."),
      );
    }
    // The card's first line is its headline; the full text also holds the
    // "What happened?" detail, which keeps the specific cause.
    const fullText = (await failureCard.textContent()) ?? "";
    const cardText = (
      (await failureCard.locator("p").first().textContent()) ?? fullText
    )
      .replace(/\s+/g, " ")
      .trim();
    if (fullText.includes(NO_AREAS_SORT_COPY)) {
      throw new Error(`${NO_AREAS_SMOKE_MESSAGE} The app said: "${cardText}"`);
    }
    throw new Error(
      seen.sent
        ? `Sort sent its request but got no answer, and the app stopped ` +
            `waiting after ${seconds} seconds (its limit is ${limitSeconds}). ` +
            `The app said: "${cardText}"`
        : `Sort stopped after ${seconds} seconds before it sent its request. ` +
            `If that is close to ${limitSeconds} seconds, the browser's ` +
            `sign-in and profile lookups before the request took too long. ` +
            `The app said: "${cardText}"`,
    );
  } finally {
    page.off("request", onRequest);
    page.off("requestfailed", onRequestFailed);
  }
}
