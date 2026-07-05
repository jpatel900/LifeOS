"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./config";

let browserClient: SupabaseClient | null | undefined;

/**
 * Singleton cookie-backed browser client (FR-029 session longevity).
 *
 * `@supabase/ssr`'s createBrowserClient stores the session in cookies (with
 * persistSession + autoRefreshToken on), so:
 * - the session survives browser restarts and multi-week absences up to the
 *   refresh-token lifetime, instead of depending on a tab staying open; and
 * - the middleware (src/middleware.ts) can refresh the token server-side on
 *   the first request back, before the client even hydrates, so a returning
 *   user holding a refreshable session is never bounced to /login.
 *
 * SECURITY_PRIVACY §3: session handling stays inside the secure client
 * library — no hand-rolled token storage. Returns null when Supabase is not
 * configured (demo mode), same contract as before.
 */
export function createSupabaseBrowserClient() {
  if (browserClient !== undefined) {
    return browserClient;
  }

  const config = getSupabaseConfig();

  if (!config) {
    browserClient = null;
    return browserClient;
  }

  browserClient = createBrowserClient(config.url, config.anonKey);
  return browserClient;
}
