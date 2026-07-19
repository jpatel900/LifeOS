import { describe, expect, it, vi } from "vitest";
import type { MinimalSupabaseClient } from "@/lib/data/workflow";
import {
  localDayStamp,
  recordPurposeGaugeCheckinFireAndForget,
  shouldOfferPurposeGaugeCheckin,
} from "./purposeGaugeCheckin";

// Local-day (not UTC) construction so the stamp matches the offer gate under
// any timezone the test host runs in.
function localDate(year: number, month1: number, day: number): Date {
  return new Date(year, month1 - 1, day, 9, 0, 0);
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("localDayStamp", () => {
  it("formats the local calendar day as YYYY-MM-DD", () => {
    expect(localDayStamp(localDate(2026, 7, 4))).toBe("2026-07-04");
    expect(localDayStamp(localDate(2026, 12, 28))).toBe("2026-12-28");
  });
});

describe("shouldOfferPurposeGaugeCheckin — offer-gating truth table", () => {
  // The four fixed FR-033 sample days (4/12/20/28) offer when unsuppressed.
  it.each([4, 12, 20, 28])(
    "offers on sample day %i when no check-in was taken today",
    (day) => {
      expect(
        shouldOfferPurposeGaugeCheckin(localDate(2026, 7, day), null),
      ).toBe(true);
    },
  );

  // Every other day of the month never offers.
  it.each([1, 3, 5, 11, 13, 19, 21, 27, 29, 31])(
    "never offers on non-sample day %i",
    (day) => {
      expect(
        shouldOfferPurposeGaugeCheckin(localDate(2026, 7, day), null),
      ).toBe(false);
    },
  );

  it("suppresses the offer once a check-in was taken this same local day", () => {
    const now = localDate(2026, 7, 12);
    expect(shouldOfferPurposeGaugeCheckin(now, localDayStamp(now))).toBe(false);
  });

  it("still offers on a sample day when the last check-in was a different day", () => {
    const now = localDate(2026, 7, 12);
    expect(shouldOfferPurposeGaugeCheckin(now, "2026-07-04")).toBe(true);
  });
});

interface FakeUpsert {
  upsert: ReturnType<typeof vi.fn>;
}

function fakeClient(options: {
  user?: { id: string } | null;
  userError?: unknown;
  hasAuth?: boolean;
}): { client: MinimalSupabaseClient; upsert: ReturnType<typeof vi.fn> } {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn(() => ({ upsert }) as FakeUpsert);
  const auth =
    options.hasAuth === false
      ? undefined
      : {
          getUser: vi.fn().mockResolvedValue({
            data: {
              user: "user" in options ? options.user : { id: "user-1" },
            },
            error: options.userError ?? null,
          }),
        };
  return {
    client: { from, auth } as unknown as MinimalSupabaseClient,
    upsert,
  };
}

describe("recordPurposeGaugeCheckinFireAndForget — write on tap", () => {
  it("upserts the signed-in user's row idempotently with the tapped response", async () => {
    const { client, upsert } = fakeClient({ user: { id: "user-1" } });

    recordPurposeGaugeCheckinFireAndForget(client, "2026-07-12", "heavier");
    await flush();

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith(
      { user_id: "user-1", checked_on: "2026-07-12", response: "heavier" },
      { onConflict: "user_id,checked_on", ignoreDuplicates: true },
    );
  });

  it("writes nothing in demo/mock mode (null client)", async () => {
    // No client, no throw, no write — a null client is the mock path.
    expect(() =>
      recordPurposeGaugeCheckinFireAndForget(null, "2026-07-12", "lighter"),
    ).not.toThrow();
    await flush();
  });

  it("writes nothing when there is no authenticated user", async () => {
    const { client, upsert } = fakeClient({ user: null });

    recordPurposeGaugeCheckinFireAndForget(client, "2026-07-12", "even");
    await flush();

    expect(upsert).not.toHaveBeenCalled();
  });

  it("writes nothing and never throws when getUser errors", async () => {
    const { client, upsert } = fakeClient({
      user: null,
      userError: { message: "boom" },
    });

    recordPurposeGaugeCheckinFireAndForget(client, "2026-07-12", "even");
    await flush();

    expect(upsert).not.toHaveBeenCalled();
  });

  it("swallows a persistence failure so the Close ritual is never affected", async () => {
    const { client, upsert } = fakeClient({ user: { id: "user-1" } });
    upsert.mockRejectedValueOnce(new Error("network"));

    expect(() =>
      recordPurposeGaugeCheckinFireAndForget(client, "2026-07-12", "lighter"),
    ).not.toThrow();
    await flush();

    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
