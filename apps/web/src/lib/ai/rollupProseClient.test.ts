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
  it("returns the enhanced summary, flagged as AI, when the server replies faithfully", async () => {
    const enhanced: RollupSummaryContent = {
      highlights: ["Shipped a parser fix 🎉", "Cleared 3 stale tasks"],
      misses: ["Missed Tuesday's review"],
      counts: draft.counts,
    };
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ ok: true, source: "ai", summary: enhanced }),
    );
    const result = await requestRollupProse(input, { fetchImpl });
    expect(result).toEqual({ summary: enhanced, enhanced: true });
  });

  it("does NOT flag a deterministic server fallback as AI (source deterministic)", async () => {
    // The server echoes the draft with source "deterministic" when it degrades
    // (no key / outage / unfaithful). The card must show it WITHOUT the badge.
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ ok: true, source: "deterministic", summary: draft }),
    );
    expect(await requestRollupProse(input, { fetchImpl })).toEqual({
      summary: draft,
      enhanced: false,
    });
  });

  it("falls back to the draft on a non-OK response", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, false));
    expect(await requestRollupProse(input, { fetchImpl })).toEqual({
      summary: draft,
      enhanced: false,
    });
  });

  it("falls back when the server drops/adds an item (count mismatch)", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        ok: true,
        source: "ai",
        summary: {
          highlights: ["only one"], // draft had 2
          misses: ["Missed Tuesday's review"],
          counts: draft.counts,
        },
      }),
    );
    expect(await requestRollupProse(input, { fetchImpl })).toEqual({
      summary: draft,
      enhanced: false,
    });
  });

  it("falls back when fetch throws (network error)", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });
    expect(await requestRollupProse(input, { fetchImpl })).toEqual({
      summary: draft,
      enhanced: false,
    });
  });

  it("sends the bearer token when provided", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ ok: true, source: "ai", summary: draft }),
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
