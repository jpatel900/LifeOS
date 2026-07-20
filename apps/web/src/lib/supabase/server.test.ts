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
  requireSupabaseServerUser,
  SupabaseAuthRejectedError,
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

describe("requireSupabaseServerUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSupabaseConfig.mockReturnValue({
      url: "http://127.0.0.1:15431",
      anonKey: "anon-key",
    });
  });

  // LOW-1 (#670): an invalid/expired JWT must raise a typed
  // SupabaseAuthRejectedError — never a plain Error carrying the raw Supabase
  // Auth message — so every route can classify it as 401 by type, not by
  // regex-matching the message text.
  it("throws SupabaseAuthRejectedError (not the raw provider message) when Supabase Auth rejects the token", async () => {
    mocks.createClient.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { message: "invalid claim: missing sub claim" },
        }),
      },
    });

    await expect(requireSupabaseServerUser("bad-token")).rejects.toThrow(
      SupabaseAuthRejectedError,
    );
  });

  it("throws SupabaseAuthRejectedError when the token is valid JSON but has no user (defense in depth)", async () => {
    mocks.createClient.mockReturnValue({
      auth: {
        getUser: vi
          .fn()
          .mockResolvedValue({ data: { user: null }, error: null }),
      },
    });

    await expect(requireSupabaseServerUser("no-user-token")).rejects.toThrow(
      SupabaseAuthRejectedError,
    );
  });

  it("resolves with the user-scoped client and user on a valid token", async () => {
    const user = { id: "user-1" };
    mocks.createClient.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
      },
    });

    const result = await requireSupabaseServerUser("good-token");
    expect(result.user).toEqual(user);
  });

  it("throws a plain (non-auth) Error when Supabase is not configured", async () => {
    mocks.getSupabaseConfig.mockReturnValue(null);

    let caught: unknown;
    try {
      await requireSupabaseServerUser("token");
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(SupabaseAuthRejectedError);
  });
});
