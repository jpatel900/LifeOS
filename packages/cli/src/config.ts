import path from "node:path";
import os from "node:os";

export interface CliConfig {
  /** Base URL of the LifeOS deployment (the authoritative server layer). */
  apiUrl: string;
  /** Supabase project URL — used for AUTH ONLY (ADR 0006). */
  supabaseUrl: string | null;
  /** Supabase anon (publishable) key — used for AUTH ONLY. Never service-role. */
  supabaseAnonKey: string | null;
  /** Where the user session (refresh token) is stored between invocations. */
  sessionFile: string;
}

function firstEnv(env: NodeJS.ProcessEnv, names: string[]): string | null {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) return value;
  }
  return null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): CliConfig {
  // A service-role key must never even be READ by the CLI. If someone
  // exports one into the CLI's environment expecting elevated behavior,
  // fail loudly instead of silently ignoring the footgun.
  if (env.LIFEOS_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Refusing to run with a service-role key in the environment. " +
        "The CLI authenticates as a user (lifeos login); unset " +
        "SUPABASE_SERVICE_ROLE_KEY / LIFEOS_SERVICE_ROLE_KEY.",
    );
  }

  return {
    apiUrl: (
      firstEnv(env, ["LIFEOS_API_URL"]) ?? "http://localhost:3000"
    ).replace(/\/+$/, ""),
    supabaseUrl: firstEnv(env, [
      "LIFEOS_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
    ]),
    supabaseAnonKey: firstEnv(env, [
      "LIFEOS_SUPABASE_ANON_KEY",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ]),
    sessionFile:
      firstEnv(env, ["LIFEOS_SESSION_FILE"]) ??
      path.join(os.homedir(), ".lifeos", "session.json"),
  };
}
