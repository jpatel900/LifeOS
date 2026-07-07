import { describe, expect, it, vi } from "vitest";
import type { RollupSummaryContent } from "@lifeos/schemas";
import { requestRollupProse } from "./rollupProseClient";

const draft: RollupSummaryContent = {
  highlights: ["Shipped the parser fix", "Closed three stale tasks"],
  misses: ["Skipped the Tuesday review block"],
  counts: { wins: 2, completed_sessions: 5, missed_sessions: 1 },
};

const input = {
  areaLabel: "Engineering",
  periodType: "week" as const,
  periodLabel: "2026-06-29 – 2026-07-05",
  draft,
};

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as unknown as Response;
}

describe("requestRollupProse", () => {
  it("returns the enhanced summary when the server replies faithfully", async () => {
    const enhanced: RollupSummaryContent = {
      highlights: ["Shipped a parser fix 🎉", "Cleared 3 stale tasks"],
      misses: ["Missed Tuesday's review"],
      counts: draft.counts,
    };
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ ok: true, summary: enhanced }),
    );
    const result = await requestRollupProse(input, { fetchImpl });
    expect(result).toEqual(enhanced);
  });

  it("falls back to the draft on a non-OK response", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, false));
    expect(await requestRollupProse(input, { fetchImpl })).toEqual(draft);
  });

  it("falls back when the server drops/adds an item (count mismatch)", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        ok: true,
        summary: {
          highlights: ["only one"], // draft had 2
          misses: ["Missed Tuesday's review"],
          counts: draft.counts,
        },
      }),
    );
    expect(await requestRollupProse(input, { fetchImpl })).toEqual(draft);
  });

  it("falls back when fetch throws (network error)", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });
    expect(await requestRollupProse(input, { fetchImpl })).toEqual(draft);
  });

  it("sends the bearer token when provided", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ ok: true, summary: draft }),
    );
    await requestRollupProse(input, { fetchImpl, accessToken: "tok" });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer tok",
    );
  });
});
