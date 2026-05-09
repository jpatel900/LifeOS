import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getParseCaptureStatus: vi.fn(),
  parseCaptureWithFallback: vi.fn(),
}));

vi.mock("@/lib/ai/parseCaptureService", () => ({
  getParseCaptureStatus: mocks.getParseCaptureStatus,
  parseCaptureWithFallback: mocks.parseCaptureWithFallback,
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
      { forceMock: true },
    );
  });

  it("returns safe non-leaky failure response and sanitized log", async () => {
    mocks.getParseCaptureStatus.mockReturnValue({
      status: "ai_configured",
      preferredParser: "ai",
    });
    mocks.parseCaptureWithFallback.mockRejectedValue(
      new Error("internal provider failure: stack trace should never leak"),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

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
    expect(errorSpy).toHaveBeenCalledWith("parse-capture route failed safely", {
      errorType: "Error",
    });
    expect(JSON.stringify(body)).not.toMatch(/stack trace|internal provider/i);
  });

  it("does not leak request validation errors", async () => {
    mocks.getParseCaptureStatus.mockReturnValue({
      status: "ai_configured",
      preferredParser: "ai",
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

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
    expect(body.error).toBe("Parsing failed safely. You can retry with the mock parser.");
    expect(body.can_retry_with_mock).toBe(true);
    expect(body.status).toBe("ai_configured");
    expect(errorSpy).toHaveBeenCalledWith("parse-capture route failed safely", {
      errorType: "Error",
    });
  });
});

