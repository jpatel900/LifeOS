import { vi } from "vitest";
import { POST } from "@/app/api/parse-capture/route";

/**
 * HIGH-1 (#670): /api/parse-capture requires a verified bearer token before
 * any parse, so tests that exercise the real route handler must call it as an
 * authenticated user. These helpers keep that wiring in one place:
 *
 * - The Supabase env config is scoped to the handler invocation only, so the
 *   surrounding component test keeps its demo-mode (unconfigured) behavior.
 * - Token verification is answered locally: the handler's Supabase client
 *   resolves its auth check via fetch, and the temporary fetch wrapper
 *   installed around the invocation answers `/auth/v1/user` with a test user.
 */
export const TEST_PARSE_CAPTURE_ACCESS_TOKEN = "parse-capture-test-token";

const SUPABASE_TEST_URL = "http://supabase.test";
const SUPABASE_TEST_ANON_KEY = "supabase-test-anon-key";

function isSupabaseAuthUserUrl(url: string) {
  try {
    const parsed = new URL(url);
    return (
      parsed.origin === SUPABASE_TEST_URL &&
      parsed.pathname.startsWith("/auth/v1/user")
    );
  } catch {
    return false;
  }
}

function supabaseTestUserResponse() {
  return new Response(
    JSON.stringify({
      id: "11111111-1111-4111-8111-111111111111",
      aud: "authenticated",
      role: "authenticated",
      email: "test-user@example.com",
      app_metadata: {},
      user_metadata: {},
      created_at: "2026-01-01T00:00:00.000Z",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

/**
 * Invokes the real parse-capture POST handler as an authenticated caller.
 * Injects a bearer token when the request has none, and answers the
 * resulting token-verification call with a valid test user.
 */
export async function postParseCaptureAuthenticated(init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (!headers.has("authorization")) {
    headers.set("Authorization", `Bearer ${TEST_PARSE_CAPTURE_ACCESS_TOKEN}`);
  }

  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const previousFetch = globalThis.fetch;

  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_TEST_URL;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = SUPABASE_TEST_ANON_KEY;
  globalThis.fetch = (async (
    input: RequestInfo | URL,
    fetchInit?: RequestInit,
  ) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (isSupabaseAuthUserUrl(url)) {
      return supabaseTestUserResponse();
    }
    return previousFetch(input, fetchInit);
  }) as typeof fetch;

  try {
    return await POST(
      new Request("http://localhost/api/parse-capture", { ...init, headers }),
    );
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    }
    if (previousAnonKey === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousAnonKey;
    }
  }
}

/**
 * Routes fetch("/api/parse-capture") to the real route handler so cockpit
 * tests exercise the actual capture → parse round-trip. AI parsing is pinned
 * off so the deterministic server mock parser answers. The invocation runs
 * authenticated (HIGH-1, #670) via postParseCaptureAuthenticated. Returns a
 * restore function for afterEach.
 */
export function stubParseCaptureFetch() {
  const originalFetch = globalThis.fetch;
  vi.stubEnv("AI_PARSE_CAPTURE_ENABLED", "false");
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (url.includes("/api/parse-capture")) {
        return postParseCaptureAuthenticated(init);
      }
      return originalFetch(input, init);
    },
  );

  return () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  };
}
