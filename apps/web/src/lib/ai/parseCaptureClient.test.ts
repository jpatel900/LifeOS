import { describe, expect, it, vi } from "vitest";
import { requestParseCapture } from "./parseCaptureClient";

const okResponseBody = {
  ok: true,
  parser: "ai",
  status: "ai_configured",
  response: {
    schema_version: "1.0",
    prompt_version: "parse_capture.v3",
    parse_status: "parsed",
    overall_confidence: 0.9,
    triage_required: false,
    triage_reasons: [],
    drafts: [],
    clarification_questions: [],
    ambiguity_assessment: null,
  },
};

describe("requestParseCapture live charter/profile read path (S3 #255)", () => {
  it("forwards per-area charter text and the operator profile in the request body", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => okResponseBody,
    })) as unknown as typeof fetch;

    await requestParseCapture({
      rawText: "Send Sarah the deck.",
      areaContext: [
        {
          slug: "main-job",
          name: "Main Job",
          charterText: "Ship the cockpit; protect deep-work mornings.",
        },
      ],
      operatorProfile: {
        profileText: "Strong at synthesis, weak at starting.",
        compensationRules: [
          { trait: "starting friction", rule: "require a concrete first move" },
        ],
      },
      parserMode: "auto",
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0];
    const body = JSON.parse((init as RequestInit).body as string);

    expect(body.areaContext[0].charterText).toBe(
      "Ship the cockpit; protect deep-work mornings.",
    );
    expect(body.operatorProfile.profileText).toBe(
      "Strong at synthesis, weak at starting.",
    );
    expect(body.operatorProfile.compensationRules).toEqual([
      { trait: "starting friction", rule: "require a concrete first move" },
    ]);
  });

  it("omits the operator profile when none is provided (empty-profile parity)", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => okResponseBody,
    })) as unknown as typeof fetch;

    await requestParseCapture({
      rawText: "Back up the laptop.",
      areaContext: [{ slug: "personal", name: "Personal" }],
      parserMode: "auto",
      fetchImpl,
    });

    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.operatorProfile).toBeUndefined();
  });
});
