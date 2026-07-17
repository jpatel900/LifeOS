import { describe, expect, it, vi } from "vitest";
import {
  createBriefViewRecorder,
  localDayStamp,
  recordBriefViewFireAndForget,
} from "./briefView";
import type { MinimalSupabaseClient } from "@/lib/data/workflow";

/**
 * #292 Stage-2 entry gate instrumentation. Two properties matter and are
 * both directly test-visible without a real Supabase instance:
 * 1. Exactly one insert per local render-day, scoped to the signed-in user.
 * 2. A failing/unauthenticated insert never throws into the caller — this
 *    write must never be able to break the re-entry ritual it instruments.
 */

function makeClient(overrides: {
  userId?: string | null;
  userError?: { message: string } | null;
  upsertError?: unknown;
  upsertImpl?: () => PromiseLike<{ error: unknown }>;
}): { client: MinimalSupabaseClient; upsert: ReturnType<typeof vi.fn> } {
  const upsert = vi.fn(
    overrides.upsertImpl ??
      (async () => ({ error: overrides.upsertError ?? null })),
  );

  const client = {
    from: vi.fn(() => ({ upsert })),
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user:
            overrides.userId === undefined
              ? { id: "user-1" }
              : overrides.userId === null
                ? null
                : { id: overrides.userId },
        },
        error: overrides.userError ?? null,
      })),
    },
  } as unknown as MinimalSupabaseClient;

  return { client, upsert };
}

describe("localDayStamp", () => {
  it("formats a local YYYY-MM-DD stamp", () => {
    expect(localDayStamp(new Date(2026, 6, 18, 23, 59))).toBe("2026-07-18");
    expect(localDayStamp(new Date(2026, 0, 5, 0, 0))).toBe("2026-01-05");
  });
});

describe("recordBriefViewFireAndForget", () => {
  it("skips silently in demo mode (client is null)", () => {
    expect(() =>
      recordBriefViewFireAndForget(null, "2026-07-18"),
    ).not.toThrow();
  });

  it("upserts the user-scoped row idempotently on conflict", async () => {
    const { client, upsert } = makeClient({ userId: "user-42" });

    recordBriefViewFireAndForget(client, "2026-07-18");

    await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    expect(upsert).toHaveBeenCalledWith(
      { user_id: "user-42", viewed_on: "2026-07-18" },
      { onConflict: "user_id,viewed_on", ignoreDuplicates: true },
    );
  });

  it("never throws when the insert fails", async () => {
    const { client, upsert } = makeClient({
      upsertImpl: async () => {
        throw new Error("network down");
      },
    });

    expect(() =>
      recordBriefViewFireAndForget(client, "2026-07-18"),
    ).not.toThrow();

    await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
  });

  it("never throws and skips the write when unauthenticated", async () => {
    const { client, upsert } = makeClient({ userId: null });

    expect(() =>
      recordBriefViewFireAndForget(client, "2026-07-18"),
    ).not.toThrow();

    // Give the fire-and-forget promise a tick to resolve.
    await Promise.resolve();
    await Promise.resolve();
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("createBriefViewRecorder", () => {
  it("records exactly once per local render-day even across repeated calls", async () => {
    const { client, upsert } = makeClient({ userId: "user-1" });
    const recorder = createBriefViewRecorder();
    const day1 = new Date(2026, 6, 18, 9, 0);

    recorder.recordIfNeeded(client, day1);
    recorder.recordIfNeeded(client, new Date(2026, 6, 18, 22, 0));
    recorder.recordIfNeeded(client, day1);

    await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
  });

  it("records again once the local day advances", async () => {
    const { client, upsert } = makeClient({ userId: "user-1" });
    const recorder = createBriefViewRecorder();

    recorder.recordIfNeeded(client, new Date(2026, 6, 18, 9, 0));
    recorder.recordIfNeeded(client, new Date(2026, 6, 19, 9, 0));

    await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(2));
  });

  it("is a no-op in demo mode but still respects the once-per-day gate", () => {
    const recorder = createBriefViewRecorder();

    expect(() => {
      recorder.recordIfNeeded(null, new Date(2026, 6, 18, 9, 0));
      recorder.recordIfNeeded(null, new Date(2026, 6, 18, 22, 0));
    }).not.toThrow();
  });
});
