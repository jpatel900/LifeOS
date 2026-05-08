import { describe, expect, it } from "vitest";
import { getSupabaseConfig, isSupabaseConfigured } from "./config";

describe("Supabase config helpers", () => {
  it("uses mock mode when Supabase env vars are missing", () => {
    const env = {};

    expect(isSupabaseConfigured(env)).toBe(false);
    expect(getSupabaseConfig(env)).toBeNull();
  });

  it("returns the public Supabase URL and anon key when configured", () => {
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-anon-key",
    };

    expect(isSupabaseConfigured(env)).toBe(true);
    expect(getSupabaseConfig(env)).toEqual({
      url: "http://127.0.0.1:54321",
      anonKey: "local-anon-key",
    });
  });
});
