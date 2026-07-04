import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captureError: vi.fn(),
  getParseCaptureStatus: vi.fn(),
  parseCaptureWithFallback: vi.fn(),
}));

vi.mock("@/lib/ai/parseCaptureService", () => ({
  getParseCaptureStatus: mocks.getParseCaptureStatus,
  parseCaptureWithFallback: mocks.parseCaptureWithFallback,
}));

vi.mock("@/lib/observability", () => ({
  captureError: mocks.captureError,
}));

import { GET, POST } from "./route";

describe("parse-capture route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns parser status from GET", async () => {
    mocks.getParseCaptureStatus.mockReturnValue({
      status: "ai_configured",
      preferredParser: "ai",
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      status: "ai_configured",
      preferredParser: "ai",
    });
  });

  it("forces mock parser when runtime status is ai_unavailable", async () => {
    mocks.getParseCaptureStatus.mockReturnValue({
      status: "ai_unavailable",
      preferredParser: "mock",
    });
    mocks.parseCaptureWithFallback.mockResolvedValue({
      parser: "mock",
      response: {
        schema_version: "1.0",
        prompt_version: "parse_capture.v1",
        parse_status: "parsed",
        overall_confidence: 0.8,
        triage_required: false,
        triage_reasons: [],
        drafts: [],
        clarification_questions: [],
        ambiguity_assessment: null,
      },
    });

    const response = await POST(
      new Request("http://localhost/api/parse-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText: "Plan Monday work." }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mocks.parseCaptureWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({ rawText: "Plan Monday work." }),
      expect.objectContaining({
        forceMock: true,
        // No Authorization header on this request, so tracing runs tokenless
        // (issue #288). Parsing still works; the trace insert is skipped.
        traceContext: { accessToken: null },
      }),
    );
  });

  it("forwards the bearer token to the tracing context when present (issue #288)", async () => {
    mocks.getParseCaptureStatus.mockReturnValue({
      status: "ai_configured",
      preferredParser: "ai",
    });
    mocks.parseCaptureWithFallback.mockResolvedValue({
      parser: "mock",
      response: {
        schema_version: "1.0",
        prompt_version: "parse_capture.v1",
        parse_status: "parsed",
        overall_confidence: 0.8,
        triage_required: false,
        triage_reasons: [],
        drafts: [],
        clarification_questions: [],
        ambiguity_assessment: null,
      },
    });

    const response = await POST(
      new Request("http://localhost/api/parse-capture", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer user-a-access-token",
        },
        body: JSON.stringify({ rawText: "Plan Monday work." }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.parseCaptureWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({ rawText: "Plan Monday work." }),
      expect.objectContaining({
        traceContext: { accessToken: "user-a-access-token" },
      }),
    );
  });

  it("returns safe non-leaky failure response and sanitized observability capture", async () => {
    mocks.getParseCaptureStatus.mockReturnValue({
      status: "ai_configured",
      preferredParser: "ai",
    });
    mocks.parseCaptureWithFallback.mockRejectedValue(
      new Error("internal provider failure: stack trace should never leak"),
    );

    const response = await POST(
      new Request("http://localhost/api/parse-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText: "Email Alex." }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toEqual({
      ok: false,
      error: "Parsing failed safely. You can retry with the mock parser.",
      can_retry_with_mock: true,
      status: "ai_configured",
    });
    expect(mocks.captureError).toHaveBeenCalledWith({
      feature: "parse_capture_route",
      error: expect.any(Error),
      context: {
        environment: "server",
        error_category: "route_handler_failure",
        route_pattern: "/api/parse-capture",
      },
    });
    expect(JSON.stringify(body)).not.toMatch(/stack trace|internal provider/i);
  });

  it("does not leak request validation errors", async () => {
    mocks.getParseCaptureStatus.mockReturnValue({
      status: "ai_configured",
      preferredParser: "ai",
    });

    const response = await POST(
      new Request("http://localhost/api/parse-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText: "Need help",
          parserMode: "dangerous",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).toBe(
      "Parsing failed safely. You can retry with the mock parser.",
    );
    expect(body.can_retry_with_mock).toBe(true);
    expect(body.status).toBe("ai_configured");
    expect(mocks.captureError).toHaveBeenCalledWith({
      feature: "parse_capture_route",
      error: expect.any(Error),
      context: {
        environment: "server",
        error_category: "route_handler_failure",
        route_pattern: "/api/parse-capture",
      },
    });
  });
});
