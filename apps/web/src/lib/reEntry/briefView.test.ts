import { describe, expect, it, vi } from "vitest";
import {
  createBriefViewRecorder,
  recordBriefViewFireAndForget,
} from "./briefView";
import { localDayStamp } from "../time/localDay";
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
  const today = new Date(2026, 6, 18, 9, 0);

  it("uses a repeat visit during a failed write for one bounded retry", async () => {
    let failFirst!: (result: { error: unknown }) => void;
    const first = new Promise<{ error: unknown }>((resolve) => {
      failFirst = resolve;
    });
    const write = vi
      .fn(async () => ({ error: "offline" as unknown }))
      .mockReturnValueOnce(first);
    const { client } = makeClient({ upsertImpl: write });
    const recorder = createBriefViewRecorder();
    recorder.recordIfNeeded(client, today);
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    recorder.recordIfNeeded(client, today);
    recorder.recordIfNeeded(client, today);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    failFirst({ error: "offline" });
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(2));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("records the latest account's visit if the previous account is still writing", async () => {
    let finishFirst!: (result: { error: null }) => void;
    const firstWrite = new Promise<{ error: null }>((resolve) => {
      finishFirst = resolve;
    });
    const auth = {
      userId: "first",
      upsertImpl: vi
        .fn(async () => ({ error: null }))
        .mockReturnValueOnce(firstWrite),
    };
    const { client, upsert } = makeClient(auth);
    const recorder = createBriefViewRecorder();
    recorder.recordIfNeeded(client, today);
    await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    auth.userId = "second";
    recorder.recordIfNeeded(client, today);
    recorder.recordIfNeeded(client, today);
    finishFirst({ error: null });
    await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(2));
    expect(upsert).toHaveBeenLastCalledWith(
      { user_id: "second", viewed_on: "2026-07-18" },
      { onConflict: "user_id,viewed_on", ignoreDuplicates: true },
    );
  });

  it.each(["returned error", "rejection"])(
    "retries after a %s on the next visit and deduplicates success",
    async (failure) => {
      const write = vi.fn(async () => ({ error: null as unknown }));
      if (failure === "rejection")
        write.mockRejectedValueOnce(new Error("offline"));
      else write.mockResolvedValueOnce({ error: { message: "offline" } });
      const { client } = makeClient({ upsertImpl: write });
      const recorder = createBriefViewRecorder();
      recorder.recordIfNeeded(client, today);
      await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1));
      recorder.recordIfNeeded(client, today);
      recorder.recordIfNeeded(client, today);
      await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(2));
      recorder.recordIfNeeded(client, today);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(write).toHaveBeenCalledTimes(2);
    },
  );

  it("records after a demo or signed-out visit on the same day", async () => {
    const auth = { userId: null as string | null };
    const { client, upsert } = makeClient(auth);
    const recorder = createBriefViewRecorder();
    recorder.recordIfNeeded(null, today);
    recorder.recordIfNeeded(client, today);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(upsert).not.toHaveBeenCalled();
    auth.userId = "signed-in";
    recorder.recordIfNeeded(client, today);
    await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    expect(upsert).toHaveBeenCalledWith(
      { user_id: "signed-in", viewed_on: "2026-07-18" },
      { onConflict: "user_id,viewed_on", ignoreDuplicates: true },
    );
  });

  it("records each signed-in account's visit when the client survives an account switch", async () => {
    const auth = { userId: "first" };
    const { client, upsert } = makeClient(auth);
    const getUser = client.auth!.getUser;
    client.auth!.getSession = vi.fn(async () => ({
      data: { session: { user: { id: auth.userId }, access_token: "fixture" } },
      error: null,
    }));
    const recorder = createBriefViewRecorder();
    recorder.recordIfNeeded(client, today);
    await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    recorder.recordIfNeeded(client, today);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(getUser).toHaveBeenCalledTimes(1); // Re-rendering Start needs no new auth request.
    auth.userId = "second";
    recorder.recordIfNeeded(client, today);
    await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(2));
    expect(upsert).toHaveBeenLastCalledWith(
      { user_id: "second", viewed_on: "2026-07-18" },
      { onConflict: "user_id,viewed_on", ignoreDuplicates: true },
    );
  });

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
