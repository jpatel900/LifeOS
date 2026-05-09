import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./config";

interface CreateSupabaseServerClientOptions {
  accessToken?: string | null;
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

export async function requireSupabaseServerUser(accessToken: string) {
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
