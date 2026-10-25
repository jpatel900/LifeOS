import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isHeldForAnotherAccount,
  maySendAs,
  ownerStampForNewEntry,
  setDeviceAccount,
} from "./deviceAccount";
import {
  enqueuePendingWrite,
  listPendingWrites,
  listVisiblePendingWrites,
  replayPendingWrites,
  PendingWriteOwnershipError,
  visiblePendingWriteCount,
} from "./pendingWriteJournal";
import {
  enqueueCapture,
  listPendingCaptures,
  visiblePendingCaptureCount,
} from "../capture/offlineQueue";

/**
 * W3-16 #1: device-held work belongs to the account that made it. It is
 * never sent through, shown to, or counted for another account, and it is
 * never deleted for being someone else's: it waits for its own account.
 */

const ACCOUNT_A = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_B = "22222222-2222-4222-8222-222222222222";

function deleteDatabase(name: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

beforeEach(async () => {
  setDeviceAccount(undefined);
  await deleteDatabase("lifeos-pending-writes");
  await deleteDatabase("lifeos-capture-queue");
});

afterEach(() => {
  setDeviceAccount(undefined);
});

describe("deviceAccount rules", () => {
  it("stamps only a known signed-in account", () => {
    expect(ownerStampForNewEntry()).toBeUndefined();
    setDeviceAccount(null);
    expect(ownerStampForNewEntry()).toBeUndefined();
    setDeviceAccount(ACCOUNT_A);
    expect(ownerStampForNewEntry()).toBe(ACCOUNT_A);
  });

  it("sends an owned entry only through its own known account", () => {
    expect(maySendAs(ACCOUNT_A, ACCOUNT_A)).toBe(true);
    expect(maySendAs(ACCOUNT_A, ACCOUNT_B)).toBe(false);
    expect(maySendAs(ACCOUNT_A, null)).toBe(false);
    expect(maySendAs(ACCOUNT_A, undefined)).toBe(false);
    // Made signed out: the next account to sign in receives it (#960).
    expect(maySendAs(undefined, ACCOUNT_B)).toBe(true);
  });

  it("hides an owned entry until its own account is known", () => {
    expect(isHeldForAnotherAccount(ACCOUNT_A, ACCOUNT_B)).toBe(true);
    expect(isHeldForAnotherAccount(ACCOUNT_A, null)).toBe(true);
    expect(isHeldForAnotherAccount(ACCOUNT_A, ACCOUNT_A)).toBe(false);
    expect(isHeldForAnotherAccount(ACCOUNT_A, undefined)).toBe(true);
    expect(isHeldForAnotherAccount(undefined, ACCOUNT_B)).toBe(false);
  });
});

describe("pending-writes journal: held for its owner", () => {
  it("keeps an ownership rejection typed even if the storage transaction aborts", async () => {
    setDeviceAccount(ACCOUNT_A);
    const original = await enqueuePendingWrite({
      entity: "capture",
      payload: { n: 1 },
      clientWriteId: "owned",
    });
    const get = IDBIndex.prototype.get;
    const spy = vi
      .spyOn(IDBIndex.prototype, "get")
      .mockImplementation(function (this: IDBIndex, key) {
        const request = get.call(this, key);
        const transaction = this.objectStore.transaction;
        request.addEventListener("success", () => {
          queueMicrotask(() => transaction.abort());
        });
        return request;
      });
    setDeviceAccount(ACCOUNT_B);
    try {
      await expect(
        enqueuePendingWrite({
          entity: "capture",
          payload: { n: 2 },
          clientWriteId: "owned",
        }),
      ).rejects.toBeInstanceOf(PendingWriteOwnershipError);
    } finally {
      spy.mockRestore();
    }
    expect(await listPendingWrites()).toEqual([original]);
  });

  it("replays A's write only while A is signed in, and never deletes it for B", async () => {
    setDeviceAccount(ACCOUNT_A);
    const written = await enqueuePendingWrite({
      entity: "capture",
      payload: { raw_text: "account A thought" },
    });
    expect(written.owner_user_id).toBe(ACCOUNT_A);

    setDeviceAccount(ACCOUNT_B);
    const handler = vi.fn().mockResolvedValue(undefined);
    await replayPendingWrites({ capture: handler });
    expect(handler).not.toHaveBeenCalled();
    expect(await listPendingWrites("capture")).toHaveLength(1);
    expect(await listVisiblePendingWrites()).toHaveLength(0);
    expect(await visiblePendingWriteCount()).toBe(0);

    setDeviceAccount(ACCOUNT_A);
    expect(await visiblePendingWriteCount()).toBe(1);
    await replayPendingWrites({ capture: handler });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(await listPendingWrites()).toHaveLength(0);
  });

  it.each([ACCOUNT_B, null, undefined])(
    "rejects another or unresolved caller (%s) replacing an owned write",
    async (account) => {
      setDeviceAccount(ACCOUNT_A);
      const original = await enqueuePendingWrite({
        entity: "capture",
        payload: { raw_text: "account A original" },
        clientWriteId: "write-1",
      });
      setDeviceAccount(account);
      await expect(
        enqueuePendingWrite({
          entity: "capture",
          payload: { raw_text: "replacement private text" },
          clientWriteId: "write-1",
        }),
      ).rejects.toThrow("Cannot replace work held for another account.");
      expect(await listPendingWrites()).toEqual([original]);

      setDeviceAccount(ACCOUNT_A);
      const handler = vi.fn().mockResolvedValue(undefined);
      await replayPendingWrites({ capture: handler });
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].payload).toEqual(original.payload);
      expect(await listPendingWrites()).toEqual([]);
    },
  );

  it("a same-owner retry keeps its owner and queue position", async () => {
    setDeviceAccount(ACCOUNT_A);
    const original = await enqueuePendingWrite({
      entity: "capture",
      payload: { raw_text: "first" },
      clientWriteId: "write-1",
    });
    const retried = await enqueuePendingWrite({
      entity: "capture",
      payload: { raw_text: "first, retried" },
      clientWriteId: "write-1",
    });
    expect(retried.owner_user_id).toBe(ACCOUNT_A);
    expect(retried.seq).toBe(original.seq);
    expect(retried.payload).toEqual({ raw_text: "first, retried" });
  });

  it("keeps an unowned retry unowned after sign-in", async () => {
    setDeviceAccount(null);
    const original = await enqueuePendingWrite({
      entity: "capture",
      payload: { raw_text: "signed-out" },
      clientWriteId: "anonymous-write",
    });
    setDeviceAccount(ACCOUNT_A);
    const retried = await enqueuePendingWrite({
      entity: "capture",
      payload: { raw_text: "signed-out retry" },
      clientWriteId: "anonymous-write",
    });
    expect(retried.owner_user_id).toBeUndefined();
    expect(retried.seq).toBe(original.seq);
  });

  it("an account switch part-way through a pass holds back the rest", async () => {
    setDeviceAccount(ACCOUNT_A);
    await enqueuePendingWrite({ entity: "capture", payload: { n: 1 } });
    await enqueuePendingWrite({ entity: "capture", payload: { n: 2 } });

    const handler = vi.fn().mockImplementation(async () => {
      // The first send lands, then the device switches to B.
      setDeviceAccount(ACCOUNT_B);
    });
    await replayPendingWrites({ capture: handler });

    expect(handler).toHaveBeenCalledTimes(1);
    const left = await listPendingWrites("capture");
    expect(left.map((write) => write.payload)).toEqual([{ n: 2 }]);
  });

  it("a write made signed out goes to the account that signs in (#960)", async () => {
    setDeviceAccount(null);
    const written = await enqueuePendingWrite({
      entity: "capture",
      payload: { raw_text: "signed-out thought" },
    });
    expect(written.owner_user_id).toBeUndefined();

    setDeviceAccount(ACCOUNT_B);
    const handler = vi.fn().mockResolvedValue(undefined);
    await replayPendingWrites({ capture: handler });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe("offline capture queue: held for its owner", () => {
  it("hides owned lists and counts while identity is unresolved", async () => {
    setDeviceAccount(ACCOUNT_A);
    const owned = await enqueuePendingWrite({
      entity: "capture",
      payload: { raw_text: "owned" },
    });
    await enqueueCapture({ rawText: "owned", areaId: null });
    setDeviceAccount(null);
    const unowned = await enqueuePendingWrite({
      entity: "capture",
      payload: { raw_text: "unowned" },
    });
    await enqueueCapture({ rawText: "unowned", areaId: null });

    for (const account of [undefined, ACCOUNT_B, null]) {
      setDeviceAccount(account);
      expect(await listVisiblePendingWrites()).toEqual([unowned]);
      expect(await visiblePendingWriteCount()).toBe(1);
      expect(await visiblePendingCaptureCount()).toBe(1);
    }
    setDeviceAccount(ACCOUNT_A);
    expect(await listVisiblePendingWrites()).toEqual([owned, unowned]);
    expect(await visiblePendingWriteCount()).toBe(2);
    expect(await visiblePendingCaptureCount()).toBe(2);
  });

  it("stamps the queued capture and does not count it for another account", async () => {
    setDeviceAccount(ACCOUNT_A);
    const queued = await enqueueCapture({ rawText: "offline A", areaId: null });
    expect(queued.owner_user_id).toBe(ACCOUNT_A);

    setDeviceAccount(ACCOUNT_B);
    expect(await visiblePendingCaptureCount()).toBe(0);
    // Still on the device for A: nothing was deleted.
    expect(await listPendingCaptures()).toHaveLength(1);

    setDeviceAccount(ACCOUNT_A);
    expect(await visiblePendingCaptureCount()).toBe(1);
  });
});
