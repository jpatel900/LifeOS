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

  it("hides an entry only when it is known to be another account's", () => {
    expect(isHeldForAnotherAccount(ACCOUNT_A, ACCOUNT_B)).toBe(true);
    expect(isHeldForAnotherAccount(ACCOUNT_A, null)).toBe(true);
    expect(isHeldForAnotherAccount(ACCOUNT_A, ACCOUNT_A)).toBe(false);
    // Not known yet (a reload before the session read): keep showing it.
    expect(isHeldForAnotherAccount(ACCOUNT_A, undefined)).toBe(false);
    expect(isHeldForAnotherAccount(undefined, ACCOUNT_B)).toBe(false);
  });
});

describe("pending-writes journal: held for its owner", () => {
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

  it("a retry under the same client id keeps the original owner", async () => {
    setDeviceAccount(ACCOUNT_A);
    await enqueuePendingWrite({
      entity: "capture",
      payload: { raw_text: "first" },
      clientWriteId: "write-1",
    });
    setDeviceAccount(ACCOUNT_B);
    const retried = await enqueuePendingWrite({
      entity: "capture",
      payload: { raw_text: "first, retried" },
      clientWriteId: "write-1",
    });
    expect(retried.owner_user_id).toBe(ACCOUNT_A);
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
