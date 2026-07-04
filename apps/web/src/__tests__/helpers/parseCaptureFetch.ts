import { vi } from "vitest";
import { POST } from "@/app/api/parse-capture/route";

/**
 * Routes fetch("/api/parse-capture") to the real route handler so cockpit
 * tests exercise the actual capture → parse round-trip. AI parsing is pinned
 * off so the deterministic server mock parser answers. Returns a restore
 * function for afterEach.
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
        return POST(new Request("http://localhost/api/parse-capture", init));
      }
      return originalFetch(input, init);
    },
  );

  return () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  };
}
