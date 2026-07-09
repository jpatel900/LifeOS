import { describe, expect, it, vi } from "vitest";

const enhanceRollupProse = vi.fn();
vi.mock("@/lib/ai/rollupProseService", () => ({
  enhanceRollupProse: (...args: unknown[]) => enhanceRollupProse(...args),
}));
vi.mock("@/lib/observability", () => ({
  captureError: vi.fn(async () => {}),
}));

import { POST } from "./route";

const draft = {
  highlights: ["Shipped the parser fix"],
  misses: ["Skipped Tuesday review"],
  counts: { wins: 1, completed_sessions: 3, missed_sessions: 1 },
};

function postRequest(body: unknown, token?: string) {
  return new Request("http://localhost/api/rollup-prose", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

const validBody = {
  areaLabel: "Engineering",
  periodType: "week",
  periodLabel: "2026-06-29 – 2026-07-05",
  draft,
};

describe("POST /api/rollup-prose", () => {
  it("returns the enhanced summary and passes the bearer token to the service", async () => {
    const enhanced = { ...draft, highlights: ["Shipped a parser fix 🎉"] };
    enhanceRollupProse.mockResolvedValueOnce({
      source: "ai",
      summary: enhanced,
    });

    const response = await POST(postRequest(validBody, "tok"));
    const json = await response.json();

    expect(json).toMatchObject({ ok: true, source: "ai", summary: enhanced });
    expect(enhanceRollupProse).toHaveBeenCalledWith(
      expect.objectContaining({ areaLabel: "Engineering", periodType: "week" }),
      expect.objectContaining({ traceContext: { accessToken: "tok" } }),
    );
  });

  it("rejects an invalid body with 400 (client keeps its deterministic draft)", async () => {
    const response = await POST(postRequest({ areaLabel: "X" }));
    expect(response.status).toBe(400);
    expect((await response.json()).ok).toBe(false);
  });

  it("rejects a bad periodType with 400", async () => {
    const response = await POST(
      postRequest({ ...validBody, periodType: "year" }),
    );
    expect(response.status).toBe(400);
  });

  it("echoes the deterministic draft if the service unexpectedly throws", async () => {
    enhanceRollupProse.mockRejectedValueOnce(new Error("boom"));
    const response = await POST(postRequest(validBody));
    const json = await response.json();
    expect(json).toMatchObject({
      ok: true,
      source: "deterministic",
      summary: draft,
      degraded: true,
    });
  });
});
