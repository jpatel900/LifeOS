import fs from "node:fs";
import path from "node:path";
import {
  createClient,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import type { CliConfig } from "./config";

/**
 * ADR 0006 boundary: this module is the ONLY place the CLI touches Supabase,
 * and only its auth surface — obtaining, refreshing, and clearing a USER
 * session. All data reads/writes go through the /api/v1 server contracts
 * (see api.ts). A static boundary test enforces this.
 */

interface StoredSession {
  access_token: string;
  refresh_token: string;
  /** Unix epoch seconds; refresh when within 60s of expiry. */
  expires_at: number | null;
  user_email: string | null;
}

function readSessionFile(sessionFile: string): StoredSession | null {
  try {
    const raw = fs.readFileSync(sessionFile, "utf8");
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (
      typeof parsed.access_token !== "string" ||
      typeof parsed.refresh_token !== "string"
    ) {
      return null;
    }
    return {
      access_token: parsed.access_token,
      refresh_token: parsed.refresh_token,
      expires_at:
        typeof parsed.expires_at === "number" ? parsed.expires_at : null,
      user_email:
        typeof parsed.user_email === "string" ? parsed.user_email : null,
    };
  } catch {
    return null;
  }
}

function writeSessionFile(sessionFile: string, session: Session) {
  const dir = path.dirname(sessionFile);
  fs.mkdirSync(dir, { recursive: true });
  const stored: StoredSession = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at ?? null,
    user_email: session.user?.email ?? null,
  };
  fs.writeFileSync(sessionFile, JSON.stringify(stored, null, 2), {
    mode: 0o600,
  });
}

function makeAuthClient(config: CliConfig): SupabaseClient {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error(
      "Supabase auth is not configured. Set LIFEOS_SUPABASE_URL and " +
        "LIFEOS_SUPABASE_ANON_KEY (or the NEXT_PUBLIC_* equivalents).",
    );
  }
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function login(
  config: CliConfig,
  email: string,
  password: string,
): Promise<{ email: string | null }> {
  const client = makeAuthClient(config);
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw new Error(error.message);
  if (!data.session) throw new Error("Sign-in returned no session.");
  writeSessionFile(config.sessionFile, data.session);
  return { email: data.session.user?.email ?? null };
}

export function logout(config: CliConfig): { cleared: boolean } {
  try {
    fs.rmSync(config.sessionFile, { force: true });
    return { cleared: true };
  } catch {
    return { cleared: false };
  }
}

export function whoami(config: CliConfig): {
  signed_in: boolean;
  email: string | null;
} {
  const stored = readSessionFile(config.sessionFile);
  return { signed_in: stored !== null, email: stored?.user_email ?? null };
}

/**
 * Returns a live access token, refreshing through Supabase auth when the
 * stored one is expired/near expiry. Throws when not signed in.
 */
export async function getAccessToken(config: CliConfig): Promise<string> {
  const stored = readSessionFile(config.sessionFile);
  if (!stored) {
    throw new Error("Not signed in. Run: lifeos login --email <email>");
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const fresh =
    stored.expires_at === null || stored.expires_at - nowSeconds > 60;
  if (fresh) return stored.access_token;

  const client = makeAuthClient(config);
  const { data, error } = await client.auth.refreshSession({
    refresh_token: stored.refresh_token,
  });
  if (error || !data.session) {
    throw new Error(
      `Session expired and refresh failed${error ? `: ${error.message}` : ""}. Run: lifeos login`,
    );
  }
  writeSessionFile(config.sessionFile, data.session);
  return data.session.access_token;
}
