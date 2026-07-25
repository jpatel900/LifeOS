import { randomUUID } from "node:crypto";
import { expect, type APIRequestContext, type Page } from "@playwright/test";

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

/** Navigate to a cockpit stage via the "Workflow stages" nav. */
export async function goToStage(page: Page, stage: RegExp): Promise<void> {
  await page
    .getByRole("navigation", { name: "Workflow stages" })
    .getByRole("button", { name: stage })
    .click();
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
