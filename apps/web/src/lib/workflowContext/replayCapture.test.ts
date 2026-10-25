import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { replayCapture } from "./replayCapture";
import {
  journalCaptureWrite,
  replayDurableWrites,
} from "../durability/durableWrites";
import {
  clearPendingWrites,
  listPendingWrites,
} from "../durability/pendingWriteJournal";
import { setDeviceAccount } from "../durability/deviceAccount";

const { listAreas, syncCapture } = vi.hoisted(() => ({
  listAreas: vi.fn(),
  syncCapture: vi.fn(),
}));
vi.mock("../data/workflow", () => ({
  listAreas,
  syncJournaledCapture: syncCapture,
}));

const USER = "22222222-2222-4222-8222-222222222222";
const OTHER_USER = "33333333-3333-4333-8333-333333333333";
const client = {
  from: vi.fn(),
  auth: { getUser: vi.fn() },
};
const recordCaptureId = vi.fn();
const ops = {
  syncWin: vi.fn(),
  syncReview: vi.fn(),
  recordCaptureId,
  syncCaptureWrite: (
    payload: Parameters<typeof replayCapture>[1],
    id: string,
  ) => replayCapture(client, payload, id),
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}
async function queue(area: string | null = "area-main-job") {
  return journalCaptureWrite({
    workflowCaptureId: "local-capture",
    workflowAreaId: area,
    persistedAreaId: null,
    rawText: "Synthetic capture",
    returnHook: "after lunch",
    clientCaptureId: "synthetic-write",
  });
}
beforeEach(async () => {
  vi.resetAllMocks();
  await clearPendingWrites();
  setDeviceAccount(USER);
  client.auth.getUser.mockResolvedValue({
    data: { user: { id: USER } },
    error: null,
  });
  listAreas.mockResolvedValue({ provider: "supabase", areas: [] });
  syncCapture.mockResolvedValue({
    provider: "supabase",
    captureId: "account-capture",
  });
});
afterEach(async () => {
  await clearPendingWrites();
  setDeviceAccount(undefined);
});

describe("capture replay area evidence", () => {
  it.each(["failed", "mock", "wrong owner"])(
    "keeps the capture when the area read is %s",
    async (mode) => {
      if (mode === "failed") listAreas.mockRejectedValue(new Error("offline"));
      if (mode === "mock")
        listAreas.mockResolvedValue({ provider: "mock", areas: [] });
      if (mode === "wrong owner")
        listAreas.mockResolvedValue({
          provider: "supabase",
          areas: [{ id: "area", user_id: OTHER_USER, slug: "main-job" }],
        });
      const write = await queue();
      expect(await replayDurableWrites(ops)).toMatchObject({
        synced: 0,
        failed: 1,
      });
      expect(syncCapture).not.toHaveBeenCalled();
      expect(recordCaptureId).not.toHaveBeenCalled();
      expect((await listPendingWrites("capture"))[0]).toMatchObject({
        payload: write.payload,
        owner_user_id: USER,
      });
    },
  );

  it("waits for a pending read and preserves content, then records the alias only after delivery", async () => {
    const read = deferred<{ provider: "supabase"; areas: [] }>();
    const started = deferred<void>();
    listAreas.mockImplementation(() => {
      started.resolve();
      return read.promise;
    });
    const write = await queue();
    const replay = replayDurableWrites(ops);
    await started.promise;
    expect(syncCapture).not.toHaveBeenCalled();
    expect((await listPendingWrites("capture"))[0]?.payload).toEqual(
      write.payload,
    );
    read.resolve({ provider: "supabase", areas: [] });
    expect(await replay).toMatchObject({ synced: 1, failed: 0 });
    expect(recordCaptureId).toHaveBeenCalledWith(write.payload, {
      provider: "supabase",
      captureId: "account-capture",
    });
    expect(await replayDurableWrites(ops)).toMatchObject({
      synced: 0,
      failed: 0,
    });
    expect(syncCapture).toHaveBeenCalledTimes(1);
  });

  it.each(["other account", "signed out", "round trip"])(
    "rejects area evidence after %s during the read",
    async (mode) => {
      listAreas.mockImplementation(async () => {
        setDeviceAccount(mode === "signed out" ? null : OTHER_USER);
        if (mode === "round trip") setDeviceAccount(USER);
        return { provider: "supabase", areas: [] };
      });
      await queue();
      expect(await replayDurableWrites(ops)).toMatchObject({
        synced: 0,
        failed: 1,
      });
      expect(syncCapture).not.toHaveBeenCalled();
      expect(await listPendingWrites("capture")).toHaveLength(1);
    },
  );

  it("accepts a same-account refresh without invalidating the capture", async () => {
    listAreas.mockImplementation(async () => {
      setDeviceAccount(USER);
      return { provider: "supabase", areas: [] };
    });
    await queue();
    expect(await replayDurableWrites(ops)).toMatchObject({
      synced: 1,
      failed: 0,
    });
  });

  it.each(["failed", "mock", "account changed"])(
    "retains the original entry and alias when the write is %s",
    async (mode) => {
      if (mode === "failed")
        syncCapture.mockRejectedValue(new Error("offline"));
      if (mode === "mock")
        syncCapture.mockResolvedValue({ provider: "mock", captureId: null });
      if (mode === "account changed")
        syncCapture.mockImplementation(async () => {
          setDeviceAccount(OTHER_USER);
          return { provider: "supabase", captureId: "account-capture" };
        });
      const write = await queue();
      expect(await replayDurableWrites(ops)).toMatchObject({
        synced: 0,
        failed: 1,
      });
      expect(recordCaptureId).not.toHaveBeenCalled();
      expect((await listPendingWrites("capture"))[0]?.payload).toEqual(
        write.payload,
      );
    },
  );

  it("does not use an unverified identity to infer deletion", async () => {
    client.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "offline" },
    });
    await queue();
    expect(await replayDurableWrites(ops)).toMatchObject({
      synced: 0,
      failed: 1,
    });
    expect(syncCapture).not.toHaveBeenCalled();
  });

  it("retains an unowned capture until an account is known, then recovers it", async () => {
    setDeviceAccount(undefined);
    await queue();
    expect(await replayDurableWrites(ops)).toMatchObject({
      synced: 0,
      failed: 1,
    });
    expect(listAreas).not.toHaveBeenCalled();
    expect(syncCapture).not.toHaveBeenCalled();
    expect(await listPendingWrites("capture")).toHaveLength(1);
    setDeviceAccount(USER);
    expect(await replayDurableWrites(ops)).toMatchObject({
      synced: 1,
      failed: 0,
    });
  });

  it("does not read or write through a different account from the journal owner", async () => {
    client.auth.getUser.mockResolvedValue({
      data: { user: { id: OTHER_USER } },
      error: null,
    });
    await queue();
    expect(await replayDurableWrites(ops)).toMatchObject({
      synced: 0,
      failed: 1,
    });
    expect(listAreas).not.toHaveBeenCalled();
    expect(syncCapture).not.toHaveBeenCalled();
  });

  it("rechecks identity at the handler continuation before recording an alias", async () => {
    await queue();
    const result = await replayDurableWrites({
      ...ops,
      syncCaptureWrite: async () => {
        queueMicrotask(() => setDeviceAccount(OTHER_USER));
        return { provider: "supabase", captureId: "account-capture" };
      },
    });
    expect(result).toMatchObject({ synced: 0, failed: 1 });
    expect(recordCaptureId).not.toHaveBeenCalled();
    expect(await listPendingWrites("capture")).toHaveLength(1);
  });

  it("does not require an area read for an unscoped capture", async () => {
    listAreas.mockRejectedValue(new Error("offline"));
    await queue(null);
    expect(await replayDurableWrites(ops)).toMatchObject({
      synced: 1,
      failed: 0,
    });
    expect(listAreas).not.toHaveBeenCalled();
    expect(syncCapture.mock.calls[0]?.[1]).toMatchObject({ area_id: null });
  });
});
