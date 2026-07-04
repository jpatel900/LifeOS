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
 * session is written into the page context and carried by the cockpit.
 * Returns true on success. Callers gate persisted legs on the result.
 */
export async function login(page: Page, env: SmokeEnv): Promise<boolean> {
  if (!env.email || !env.password) {
    return false;
  }

  await page.goto("/login");
  await page.locator("#email").fill(env.email);
  await page.locator("#password").fill(env.password);
  await page.getByRole("button", { name: "Sign in" }).click();

  // On success the app routes to /settings/areas. On failure it renders a
  // sanitized "Sign in failed" alert instead of crashing.
  try {
    await page.waitForURL(/\/settings\/areas$/, { timeout: 20_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Read the Supabase access token from the browser session persisted by
 * `@supabase/supabase-js` in localStorage. Used to authenticate the
 * `/api/google-calendar/connection` probe. Returns null when unavailable.
 */
export async function readSupabaseAccessToken(
  page: Page,
): Promise<string | null> {
  return page.evaluate(() => {
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
        const parsed = JSON.parse(raw) as { access_token?: unknown };
        if (typeof parsed?.access_token === "string") {
          return parsed.access_token;
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
