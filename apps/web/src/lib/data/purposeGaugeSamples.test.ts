import { describe, expect, it, vi } from "vitest";
import type { MinimalSupabaseClient } from "@/lib/data/workflow";
import {
  mapCheckinRowToSample,
  readPurposeGaugeSamples,
} from "./purposeGaugeSamples";

describe("mapCheckinRowToSample", () => {
  it("maps a valid row to a Mirror sample at UTC midnight of the check-in day", () => {
    const sample = mapCheckinRowToSample({
      checked_on: "2026-07-12",
      response: "lighter",
    });
    expect(sample).toEqual({
      response: "lighter",
      sampledAtMs: Date.UTC(2026, 6, 12),
      sanctuaryContext: {},
    });
  });

  it("drops a row whose response is not one of the three FR-033 values", () => {
    expect(
      mapCheckinRowToSample({ checked_on: "2026-07-12", response: "great" }),
    ).toBeNull();
  });

  it("drops a row with a malformed date", () => {
    expect(
      mapCheckinRowToSample({ checked_on: "not-a-date", response: "even" }),
    ).toBeNull();
  });
});

function fakeReadClient(result: {
  data: unknown;
  error?: { message?: string } | null;
}): MinimalSupabaseClient {
  const select = vi.fn().mockResolvedValue({
    data: result.data,
    error: result.error ?? null,
  });
  const from = vi.fn(() => ({ select }));
  return { from } as unknown as MinimalSupabaseClient;
}

describe("readPurposeGaugeSamples", () => {
  it("reads persisted rows and maps them to Mirror samples", async () => {
    const client = fakeReadClient({
      data: [
        { checked_on: "2026-07-04", response: "heavier" },
        { checked_on: "2026-07-12", response: "even" },
        { checked_on: "2026-07-20", response: "lighter" },
      ],
    });

    const samples = await readPurposeGaugeSamples(client);

    expect(samples).toEqual([
      {
        response: "heavier",
        sampledAtMs: Date.UTC(2026, 6, 4),
        sanctuaryContext: {},
      },
      {
        response: "even",
        sampledAtMs: Date.UTC(2026, 6, 12),
        sanctuaryContext: {},
      },
      {
        response: "lighter",
        sampledAtMs: Date.UTC(2026, 6, 20),
        sanctuaryContext: {},
      },
    ]);
  });

  it("yields no samples in demo/mock mode (null client)", async () => {
    expect(await readPurposeGaugeSamples(null)).toEqual([]);
  });

  it("fails closed to an empty set on a read error (never a fabricated trend)", async () => {
    const client = fakeReadClient({ data: null, error: { message: "denied" } });
    expect(await readPurposeGaugeSamples(client)).toEqual([]);
  });

  it("silently drops invalid rows while keeping valid ones", async () => {
    const client = fakeReadClient({
      data: [
        { checked_on: "2026-07-04", response: "lighter" },
        { checked_on: "2026-07-05", response: "bogus" },
        { checked_on: "bad", response: "even" },
      ],
    });
    const samples = await readPurposeGaugeSamples(client);
    expect(samples).toHaveLength(1);
    expect(samples[0]).toMatchObject({ response: "lighter" });
  });
});
