import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * FR-029 session-refresh middleware contract:
 * - demo mode (Supabase unconfigured) is a pure pass-through — no client
 *   construction at all;
 * - configured mode constructs a cookie-bridged server client and calls
 *   auth.getUser() to force a token refresh;
 * - the middleware never redirects for auth/session reasons (no route
 *   protection lives here) — see below for the one redirect it does issue,
 *   the crafted-URL guard (Part of #687).
 */

const createServerClientMock = vi.fn();
const getUserMock = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: (...args: unknown[]) => {
    createServerClientMock(...args);
    return { auth: { getUser: getUserMock } };
  },
}));

vi.mock("@/lib/supabase/config", () => ({
  getSupabaseConfig: vi.fn(),
}));

import { middleware } from "./middleware";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { NextRequest } from "next/server";

function makeRequest(path = "/capture") {
  return new NextRequest(`http://localhost${path}`);
}

describe("session-refresh middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
  });

  it("passes through without touching Supabase when unconfigured (demo mode)", async () => {
    vi.mocked(getSupabaseConfig).mockReturnValue(null);

    const response = await middleware(makeRequest());

    expect(createServerClientMock).not.toHaveBeenCalled();
    expect(getUserMock).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it("refreshes the session via getUser() when configured", async () => {
    vi.mocked(getSupabaseConfig).mockReturnValue({
      url: "http://127.0.0.1:15431",
      anonKey: "local-anon-key",
    });

    const response = await middleware(makeRequest());

    expect(createServerClientMock).toHaveBeenCalledTimes(1);
    expect(createServerClientMock).toHaveBeenCalledWith(
      "http://127.0.0.1:15431",
      "local-anon-key",
      expect.objectContaining({ cookies: expect.any(Object) }),
    );
    expect(getUserMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("never redirects for auth reasons, even for a signed-out visitor", async () => {
    vi.mocked(getSupabaseConfig).mockReturnValue({
      url: "http://127.0.0.1:15431",
      anonKey: "local-anon-key",
    });
    getUserMock.mockResolvedValue({
      data: { user: null },
      error: { message: "Auth session missing!" },
    });

    const response = await middleware(makeRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});

/**
 * Crafted-URL guard (Part of #687).
 *
 * `constructor` is the only key that actually 500s today (it shadows
 * `Promise.prototype.constructor` on Next's exotic `searchParams` promise —
 * see the block comment on `DANGEROUS_SEARCH_PARAM_KEYS` in middleware.ts
 * and the evidence comment on PR #923 for the full mechanism and stack
 * traces). `__proto__`/`prototype` are stripped defensively even though
 * they're inert today, because they're the same "reserved identifier
 * missing from Next's own allowlist" hazard class. Every case here runs with
 * Supabase unconfigured (demo mode) so a redirect firing proves the guard
 * runs — and runs first — regardless of session state.
 */
describe("crafted-URL guard (Part of #687)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSupabaseConfig).mockReturnValue(null);
  });

  it.each(["constructor", "__proto__", "prototype"])(
    "redirects and strips a bare ?%s= param before Supabase ever runs",
    async (key) => {
      const response = await middleware(makeRequest(`/?${key}=1`));

      expect(response.status).toBe(307);
      const location = response.headers.get("location");
      expect(location).not.toBeNull();
      const redirectUrl = new URL(location!);
      expect(redirectUrl.searchParams.has(key)).toBe(false);
      expect(redirectUrl.pathname).toBe("/");
      expect(createServerClientMock).not.toHaveBeenCalled();
      expect(getUserMock).not.toHaveBeenCalled();
    },
  );

  it("strips all dangerous keys at once when more than one is present", async () => {
    const response = await middleware(
      makeRequest("/?constructor=1&__proto__=x&prototype=y"),
    );

    expect(response.status).toBe(307);
    const redirectUrl = new URL(response.headers.get("location")!);
    expect(redirectUrl.searchParams.has("constructor")).toBe(false);
    expect(redirectUrl.searchParams.has("__proto__")).toBe(false);
    expect(redirectUrl.searchParams.has("prototype")).toBe(false);
  });

  it("preserves a legitimate param alongside a dangerous one instead of dropping it", async () => {
    const response = await middleware(
      makeRequest("/?area=area-main-job&constructor=1"),
    );

    expect(response.status).toBe(307);
    const redirectUrl = new URL(response.headers.get("location")!);
    expect(redirectUrl.searchParams.get("area")).toBe("area-main-job");
    expect(redirectUrl.searchParams.has("constructor")).toBe(false);
  });

  it.each([
    "/?moment=close",
    "/?area=area-side-project",
    "/?sheet=review",
    "/?capture=1",
    "/?palette=1",
  ])(
    "does not redirect a legitimate app param (%s) — it reaches the page untouched",
    async (path) => {
      const response = await middleware(makeRequest(path));

      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    },
  );

  it.each([
    "/?utm_source=newsletter",
    "/?code=abc123",
    "/?state=xyz",
    "/?session_state=abc",
  ])(
    "does not redirect or touch analytics/auth-callback-style params (%s)",
    async (path) => {
      const response = await middleware(makeRequest(path));

      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    },
  );
});
