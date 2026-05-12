import { describe, expect, it } from "vitest";
import {
  OBSERVABILITY_REDACTED_EMAIL,
  OBSERVABILITY_REDACTED_TEXT,
  sanitizeEventProperties,
  sanitizeObservabilityValue,
} from "./sanitize";

describe("observability sanitizers", () => {
  it("scrubs known sensitive fields from nested objects", () => {
    const sanitized = sanitizeObservabilityValue({
      prompt: "Tell me everything about jay@example.com",
      nested: {
        access_token: "secret-token",
        provider: "openai",
      },
    });

    expect(sanitized).toEqual({
      prompt: OBSERVABILITY_REDACTED_TEXT,
      nested: {
        access_token: OBSERVABILITY_REDACTED_TEXT,
        provider: "openai",
      },
    });
  });

  it("sanitizes arrays and strips URL query strings", () => {
    const sanitized = sanitizeObservabilityValue([
      "https://example.com/callback?token=abc123",
      {
        authorization: "Bearer abc123",
      },
    ]);

    expect(sanitized).toEqual([
      "https://example.com/callback",
      {
        authorization: OBSERVABILITY_REDACTED_TEXT,
      },
    ]);
  });

  it("handles Error objects safely without exporting stacks", () => {
    const sanitized = sanitizeObservabilityValue(
      new Error("request failed for jay@example.com"),
    );

    expect(sanitized).toEqual({
      name: "Error",
      message: OBSERVABILITY_REDACTED_EMAIL,
      stack_present: true,
    });
  });

  it("allowlists analytics properties and drops non-allowlisted keys", () => {
    const sanitized = sanitizeEventProperties({
      provider: "sentry",
      status: "configured",
      route_pattern: "/api/parse-capture",
      raw_text: "this should not pass",
      arbitrary_payload: "drop me",
    });

    expect(sanitized).toEqual({
      provider: "sentry",
      status: "configured",
      route_pattern: "/api/parse-capture",
    });
  });

  it("sanitizes allowed analytics properties that contain sensitive values", () => {
    const sanitized = sanitizeEventProperties({
      environment: "production",
      route_pattern: "https://example.com/callback?code=abc123",
      error_type: "jay@example.com",
      retry_count: 2,
    });

    expect(sanitized).toEqual({
      environment: "production",
      route_pattern: "https://example.com/callback",
      error_type: OBSERVABILITY_REDACTED_EMAIL,
      retry_count: 2,
    });
  });
});

