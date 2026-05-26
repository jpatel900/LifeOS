import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  OBSERVABILITY_REDACTED_EMAIL,
  OBSERVABILITY_REDACTED_TEXT,
} from "./sanitize";
import { getSentryInitConfig, sanitizeSentryEvent } from "./sentry";

describe("sentry observability helpers", () => {
  it("returns null init config when Sentry DSN is absent", () => {
    expect(getSentryInitConfig("client", {})).toBeNull();
  });

  it("keeps client init config free of secrets and privacy-unsafe toggles", () => {
    const config = getSentryInitConfig("client", {
      NODE_ENV: "production",
      NEXT_PUBLIC_SENTRY_DSN: "https://abc@example.ingest.sentry.io/123",
      SENTRY_DSN: "https://private@example.ingest.sentry.io/456",
    });

    expect(config).toMatchObject({
      dsn: "https://abc@example.ingest.sentry.io/123",
      environment: "production",
      sendDefaultPii: false,
      tracesSampleRate: 0,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
    });
    expect(JSON.stringify(config)).not.toContain("private@example.ingest");
  });

  it("sanitizes Sentry events before export", () => {
    const sanitized = sanitizeSentryEvent({
      message: "Send to jay@example.com",
      user: { email: "jay@example.com" },
      breadcrumbs: [{ message: "raw capture text here" }],
      request: {
        method: "POST",
        url: "https://example.com/api/parse-capture?token=abc123",
        headers: { Authorization: "Bearer secret-token" },
        data: { prompt: "raw prompt" },
        cookies: "session=abc",
      },
      tags: {
        provider: "sentry",
        route_pattern: "/api/parse-capture",
        prompt: "drop this",
      },
      extra: {
        completion: "raw completion",
        nested: { email: "jay@example.com" },
      },
    }) as Record<string, unknown>;

    expect(sanitized.message).toBe(OBSERVABILITY_REDACTED_EMAIL);
    expect(sanitized.user).toBeUndefined();
    expect(sanitized.breadcrumbs).toBeUndefined();
    expect(sanitized.request).toEqual({
      method: "POST",
      url: "https://example.com/api/parse-capture",
      headers: { Authorization: OBSERVABILITY_REDACTED_TEXT },
      data: OBSERVABILITY_REDACTED_TEXT,
      cookies: OBSERVABILITY_REDACTED_TEXT,
    });
    expect(sanitized.tags).toEqual({
      provider: "sentry",
    });
    expect(sanitized.extra).toEqual({
      completion: OBSERVABILITY_REDACTED_TEXT,
      nested: { email: OBSERVABILITY_REDACTED_TEXT },
    });
  });

  it("does not require or document Sentry source map auth tokens in this phase", () => {
    const envExample = readFileSync(
      resolve(__dirname, "../../../../../.env.example"),
      "utf8",
    );

    expect(envExample).toContain("NEXT_PUBLIC_SENTRY_DSN=");
    expect(envExample).toContain("SENTRY_DSN=");
    expect(envExample).not.toContain("SENTRY_AUTH_TOKEN");
  });
});
