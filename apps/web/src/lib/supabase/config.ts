type SupabaseEnv = {
  [key: string]: string | undefined;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
};

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function getSupabaseConfig(
  env: SupabaseEnv = process.env
): SupabaseConfig | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!hasText(url) || !hasText(anonKey)) {
    return null;
  }

  return {
    url,
    anonKey,
  };
}

export function isSupabaseConfigured(env: SupabaseEnv = process.env) {
  return getSupabaseConfig(env) !== null;
}
