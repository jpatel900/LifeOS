import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./config";

interface CreateSupabaseServerClientOptions {
  accessToken?: string | null;
}

type SupabaseServiceEnv = {
  [key: string]: string | undefined;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

function assertServerRuntime() {
  const isTestRuntime =
    process.env.VITEST === "true" || process.env.NODE_ENV === "test";

  if (typeof window !== "undefined" && !isTestRuntime) {
    throw new Error("Supabase server helpers must stay server-only.");
  }
}

function normalizeAccessToken(accessToken?: string | null) {
  if (typeof accessToken !== "string") {
    return null;
  }

  const trimmed = accessToken.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function createSupabaseServerClient(
  options: CreateSupabaseServerClientOptions = {},
): SupabaseClient | null {
  assertServerRuntime();

  const config = getSupabaseConfig();
  const accessToken = normalizeAccessToken(options.accessToken);

  if (!config) {
    return null;
  }

  return createClient(config.url, config.anonKey, {
    global: accessToken
      ? {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      : undefined,
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function createSupabaseServiceRoleClient(
  env: SupabaseServiceEnv = process.env,
): SupabaseClient | null {
  assertServerRuntime();

  const config = getSupabaseConfig(env);
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!config || !serviceRoleKey) {
    return null;
  }

  return createClient(config.url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function requireSupabaseServiceRoleClient() {
  const client = createSupabaseServiceRoleClient();

  if (!client) {
    throw new Error("Supabase service role key is not configured.");
  }

  return client;
}

/**
 * LOW-1 (#670): thrown whenever the caller's bearer token is missing, invalid,
 * or expired. Distinguishing this by TYPE (not by pattern-matching the thrown
 * message) is what lets every route map auth failures to 401 without ever
 * inspecting — or echoing — the raw Supabase Auth error string.
 */
export class SupabaseAuthRejectedError extends Error {
  constructor(message = "Sign in before using this server action.") {
    super(message);
    this.name = "SupabaseAuthRejectedError";
  }
}

export async function requireSupabaseServerUser(accessToken: string) {
  assertServerRuntime();

  const client = createSupabaseServerClient({ accessToken });

  if (!client) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await client.auth.getUser();

  if (error) {
    // The raw Supabase Auth error (e.g. "invalid claim: missing sub claim",
    // "JWT expired") is logged by the caller, never returned to the client —
    // see SupabaseAuthRejectedError's doc comment above.
    throw new SupabaseAuthRejectedError(error.message);
  }

  if (!data.user) {
    throw new SupabaseAuthRejectedError();
  }

  return {
    client,
    user: data.user,
  };
}
