import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getSupabaseConfig: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

vi.mock("./config", () => ({
  getSupabaseConfig: mocks.getSupabaseConfig,
}));

import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "./server";

describe("Supabase server clients", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSupabaseConfig.mockReturnValue({
      url: "http://127.0.0.1:15431",
      anonKey: "anon-key",
    });
    mocks.createClient.mockReturnValue({ from: vi.fn() });
  });

  it("creates user-scoped server clients with the anon key and bearer token", () => {
    createSupabaseServerClient({ accessToken: " user-jwt " });

    expect(mocks.createClient).toHaveBeenCalledWith(
      "http://127.0.0.1:15431",
      "anon-key",
      expect.objectContaining({
        global: {
          headers: {
            Authorization: "Bearer user-jwt",
          },
        },
      }),
    );
  });

  it("creates service-role clients only when the server-only key is present", () => {
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:15431",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    };

    createSupabaseServiceRoleClient(env);

    expect(mocks.createClient).toHaveBeenCalledWith(
      "http://127.0.0.1:15431",
      "service-role-key",
      expect.objectContaining({
        auth: expect.objectContaining({
          persistSession: false,
        }),
      }),
    );
  });

  it("returns null instead of falling back to anon privileges without a service-role key", () => {
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:15431",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "",
    };

    const client = createSupabaseServiceRoleClient(env);

    expect(client).toBeNull();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
