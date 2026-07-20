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

export async function requireSupabaseServerUser(accessToken: string) {
  assertServerRuntime();

  const client = createSupabaseServerClient({ accessToken });

  if (!client) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await client.auth.getUser();

  if (error) {
    throw new Error(error.message);
  }

  if (!data.user) {
    throw new Error("Sign in before using this server action.");
  }

  return {
    client,
    user: data.user,
  };
}
