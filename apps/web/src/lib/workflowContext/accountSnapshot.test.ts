import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSnapshotRecoveriesForTests,
  clearSnapshotRecoveryPayloads,
  listSnapshotRecoveries,
  reserveSnapshotRecovery,
  snapshotRecoveryId,
} from "./snapshotRecovery";
import { reserveCaptureWriteOwners } from "../durability/pendingWriteJournal";
import {
  createEmptyWorkflowState,
  nextId,
  setAccountScopedWorkflowIds,
  syncWorkflowIdCounterFromState,
  STORAGE_KEY,
} from "../workflow/shared";
import { createRawCaptureItem } from "../workflow/capture";
import {
  accountSnapshotKey,
  anonymousWorkflowScope,
  claimAnonymousSnapshots,
  storeAccountSnapshot,
  safeUnownedWorkflowScope,
  unverifiedWorkflowScope,
  mergeAnonymousSnapshot,
} from "./accountSnapshot";
import { loadStoredStateFromSession } from "./reducerCore";

beforeEach(async () => {
  await clearSnapshotRecoveriesForTests();
  sessionStorage.clear();
  setAccountScopedWorkflowIds(true);
});
afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
  setAccountScopedWorkflowIds(false);
});

function captured(rawText: string) {
  return {
    ...createEmptyWorkflowState(),
    captureItems: [createRawCaptureItem({ rawText })],
  };
}

describe("account snapshots", () => {
  it("quarantines a copied normal claim before anonymous hydration", async () => {
    const original = captured("Already reserved in a different tab");
    storeAccountSnapshot("anonymous", original);
    const key = accountSnapshotKey("anonymous");
    const copiedSource = sessionStorage.getItem(key)!;
    await claimAnonymousSnapshots("account:A");
    sessionStorage.clear();
    sessionStorage.setItem(key, copiedSource);
    expect(await safeUnownedWorkflowScope("anonymous")).not.toBe("anonymous");
    expect(sessionStorage.getItem(key)).toBe(copiedSource);
  });

  it("quarantines a mixed-owner legacy source without blocking any account", async () => {
    const first = captured("A's owned work");
    const second = captured("B's owned work");
    const original = mergeAnonymousSnapshot(first, second);
    storeAccountSnapshot("anonymous", original);
    const key = accountSnapshotKey("anonymous");
    const bytes = sessionStorage.getItem(key);
    await reserveCaptureWriteOwners("A", [first.captureItems[0].id]);
    await reserveCaptureWriteOwners("B", [second.captureItems[0].id]);
    for (const account of ["account:C", "account:A", "account:B"]) {
      const owners = {};
      const claimed = await claimAnonymousSnapshots(
        account,
        undefined,
        undefined,
        owners,
      );
      expect(claimed.state.captureItems).toEqual([]);
      expect(claimed.storageBlocked).toBe(true);
      expect(owners).toEqual({ anonymous: null });
      expect(sessionStorage.getItem(key)).toBe(bytes);
    }
    expect(await safeUnownedWorkflowScope("anonymous")).not.toBe("anonymous");
  });

  it.each([false, true])(
    "keeps a stale copied source recoverable by A without blocking B (quota=%s)",
    async (quota) => {
      const original = captured("Copied before A signed in");
      storeAccountSnapshot("anonymous", original);
      const key = accountSnapshotKey("anonymous");
      const copiedSource = sessionStorage.getItem(key)!;
      await claimAnonymousSnapshots("account:A");
      // The copied tab was away during A's auth event. It returns as B.
      sessionStorage.clear();
      sessionStorage.setItem(key, copiedSource);
      const writes = quota
        ? vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new DOMException("Quota", "QuotaExceededError");
          })
        : undefined;
      for (let retry = 0; retry < 2; retry += 1) {
        expect(
          (await claimAnonymousSnapshots("account:B")).state.captureItems,
        ).toEqual([]);
      }
      writes?.mockRestore();
      expect(
        (await claimAnonymousSnapshots("account:A")).state.captureItems,
      ).toEqual(original.captureItems);
      await expect(
        reserveCaptureWriteOwners("B", [original.captureItems[0].id]),
      ).rejects.toThrow();
      // Closing this tab must not poison a new, unrelated account tab.
      sessionStorage.clear();
      expect(
        (await claimAnonymousSnapshots("account:C")).state.captureItems,
      ).toEqual([]);
    },
  );

  it.each(["session", "fallback"])(
    "repairs an old conflicting %s owner without exposing A's capture to B",
    async (kind) => {
      const original = captured("Previously poisoned source");
      storeAccountSnapshot("anonymous", original);
      const key = accountSnapshotKey("anonymous");
      const copiedSource = sessionStorage.getItem(key)!;
      const id = await snapshotRecoveryId("anonymous", copiedSource, original);
      // Seed the persisted state left by the old version, not a new claim.
      await reserveCaptureWriteOwners("A", [original.captureItems[0].id]);
      if (kind === "session") {
        sessionStorage.setItem(
          key,
          JSON.stringify({
            heldFor: "account:B",
            state: original,
            snapshotClaimId: id,
          }),
        );
      } else {
        await reserveSnapshotRecovery(
          {
            id,
            scope: "anonymous",
            owner: "account:B",
            state: original,
            unanchored: true,
          },
          mergeAnonymousSnapshot,
        );
        sessionStorage.clear();
      }
      expect(
        (await claimAnonymousSnapshots("account:C")).state.captureItems,
      ).toEqual([]);
      expect(
        (await claimAnonymousSnapshots("account:B")).state.captureItems,
      ).toEqual([]);
      expect(
        (await claimAnonymousSnapshots("account:A")).state.captureItems,
      ).toEqual(original.captureItems);
    },
  );

  it("starts a fresh unverified generation after retiring an account even when storage is blocked", () => {
    const initial = unverifiedWorkflowScope();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const next = unverifiedWorkflowScope("account:A");
    expect(next).not.toBe(initial);
    expect(next).toMatch(/^unverified:/);
  });

  it("never reads the unattributed legacy snapshot as a signed-in account", () => {
    const legacy = captured("Old private capture");
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
    expect(
      loadStoredStateFromSession(accountSnapshotKey("account:B")).state
        ?.captureItems,
    ).toEqual([]);
    expect(sessionStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(legacy));
  });

  it("keeps local IDs unique across scope resets so handoff does not rewrite journal references", () => {
    const first = nextId("capture");
    syncWorkflowIdCounterFromState(createEmptyWorkflowState());
    expect(nextId("capture")).not.toBe(first);
  });

  it("imports new anonymous work once, preserving both account work and references", async () => {
    const account = captured("A's held work");
    const anonymous = captured("New signed-out work");
    sessionStorage.setItem(
      accountSnapshotKey("account:A"),
      JSON.stringify(account),
    );
    sessionStorage.setItem(
      accountSnapshotKey("anonymous"),
      JSON.stringify(anonymous),
    );
    await claimAnonymousSnapshots("account:A");
    expect(
      loadStoredStateFromSession(accountSnapshotKey("account:A")).state
        ?.captureItems,
    ).toEqual([...account.captureItems, ...anonymous.captureItems]);
    expect(sessionStorage.getItem(accountSnapshotKey("anonymous"))).toBeNull();
    await claimAnonymousSnapshots("account:B");
    expect(
      loadStoredStateFromSession(accountSnapshotKey("account:B")).state
        ?.captureItems,
    ).toEqual([]);
  });

  it("uses the latest mounted snapshot when the passive mirror has not caught up", async () => {
    const latest = captured("Just typed");
    await claimAnonymousSnapshots("account:A", {
      scope: "anonymous",
      state: latest,
    });
    expect(
      loadStoredStateFromSession(accountSnapshotKey("account:A")).state
        ?.captureItems,
    ).toEqual(latest.captureItems);
  });

  it("retains an owner-qualified durable copy if all session writes are blocked", async () => {
    const anonymous = captured("Keep this thought");
    sessionStorage.setItem(
      accountSnapshotKey("anonymous"),
      JSON.stringify(anonymous),
    );
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota", "QuotaExceededError");
    });
    const claimed = await claimAnonymousSnapshots("account:A");
    expect(claimed.storageBlocked).toBe(true);
    expect(claimed.state.captureItems).toEqual(anonymous.captureItems);
    expect(await listSnapshotRecoveries()).toEqual([
      expect.objectContaining({ owner: "account:A", state: anonymous }),
    ]);
    expect(sessionStorage.getItem(accountSnapshotKey("anonymous"))).toBe(
      JSON.stringify(anonymous),
    );
  });

  it("reserves source ownership if removal fails and rejects late anonymous mirrors", async () => {
    const anonymous = captured("A's imported thought");
    sessionStorage.setItem(
      accountSnapshotKey("anonymous"),
      JSON.stringify(anonymous),
    );
    const remove = vi
      .spyOn(Storage.prototype, "removeItem")
      .mockImplementation(() => {
        throw new Error("Storage blocked");
      });
    expect((await claimAnonymousSnapshots("account:A")).storageBlocked).toBe(
      true,
    );
    expect(() => storeAccountSnapshot("anonymous", anonymous)).toThrow();
    await claimAnonymousSnapshots("account:B");
    expect(
      loadStoredStateFromSession(accountSnapshotKey("account:B")).state
        ?.captureItems,
    ).toEqual([]);
    expect(
      loadStoredStateFromSession(accountSnapshotKey("account:A")).state
        ?.captureItems,
    ).toEqual(anonymous.captureItems);
    remove.mockRestore();
    await claimAnonymousSnapshots("account:A");
    expect(sessionStorage.getItem(accountSnapshotKey("anonymous"))).toBeNull();
  });

  it("quarantines a fallback source before signed-out reload can edit it", async () => {
    const original = captured("A's reserved capture");
    storeAccountSnapshot("anonymous", original);
    const writes = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("quota");
      });
    const removals = vi
      .spyOn(Storage.prototype, "removeItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    await claimAnonymousSnapshots("account:A");
    writes.mockRestore();
    removals.mockRestore();
    const nextScope = await safeUnownedWorkflowScope("anonymous");
    expect(nextScope).not.toBe("anonymous");
    expect(anonymousWorkflowScope("pending")).toBe(nextScope);
    const newWork = captured("B's new capture");
    storeAccountSnapshot(nextScope, newWork);
    expect(
      (await claimAnonymousSnapshots("account:B")).state.captureItems,
    ).toEqual(newWork.captureItems);
    expect(
      (await claimAnonymousSnapshots("account:A")).state.captureItems,
    ).toEqual(original.captureItems);
  });

  it("does not conflate separate tabs using the same anonymous scope", async () => {
    const first = captured("First tab's capture");
    storeAccountSnapshot("anonymous", first);
    const writes = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("quota");
      });
    await claimAnonymousSnapshots("account:A");
    writes.mockRestore();
    const firstSource = sessionStorage.getItem(
      accountSnapshotKey("anonymous"),
    )!;
    sessionStorage.clear();
    const second = captured("Second tab's capture");
    storeAccountSnapshot("anonymous", second);
    expect(
      (await claimAnonymousSnapshots("account:B")).state.captureItems,
    ).toEqual(second.captureItems);
    sessionStorage.clear();
    sessionStorage.setItem(accountSnapshotKey("anonymous"), firstSource);
    expect(
      (await claimAnonymousSnapshots("account:A")).state.captureItems,
    ).toEqual(first.captureItems);
  });

  it("does not resurrect a consumed fallback source after A changes its account state", async () => {
    const original = captured("Already consumed");
    storeAccountSnapshot("anonymous", original);
    const originalSet = Storage.prototype.setItem;
    const writes = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(function (this: Storage, key, value) {
        if (key === accountSnapshotKey("anonymous")) throw new Error("quota");
        originalSet.call(this, key, value);
      });
    const removals = vi
      .spyOn(Storage.prototype, "removeItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    await claimAnonymousSnapshots("account:A");
    writes.mockRestore();
    removals.mockRestore();
    storeAccountSnapshot("account:A", createEmptyWorkflowState());
    expect(
      (await claimAnonymousSnapshots("account:A")).state.captureItems,
    ).toEqual([]);
    expect(
      (await claimAnonymousSnapshots("account:B")).state.captureItems,
    ).toEqual([]);
  });

  it.each(["new", "duplicated"])(
    "keeps the only recovery copy when a %s account-A tab opens and closes",
    async (kind) => {
      const original = captured("Tab one's durable recovery");
      storeAccountSnapshot("anonymous", original);
      const writes = vi
        .spyOn(Storage.prototype, "setItem")
        .mockImplementation(() => {
          throw new Error("quota");
        });
      await claimAnonymousSnapshots("account:A");
      writes.mockRestore();
      const firstTab = Object.fromEntries(
        Array.from({ length: sessionStorage.length }, (_, index) => {
          const key = sessionStorage.key(index)!;
          return [key, sessionStorage.getItem(key)!];
        }),
      );
      sessionStorage.clear();
      if (kind === "duplicated") {
        for (const [key, value] of Object.entries(firstTab))
          sessionStorage.setItem(key, value);
      }
      await claimAnonymousSnapshots("account:A");
      // Closing tab two destroys its sessionStorage. Reload the original tab.
      sessionStorage.clear();
      for (const [key, value] of Object.entries(firstTab))
        sessionStorage.setItem(key, value);
      expect(
        (await claimAnonymousSnapshots("account:A")).state.captureItems,
      ).toEqual(original.captureItems);
    },
  );

  it("keeps unanchored work durable across tabs and preserves each tab's applied receipt", async () => {
    const original = captured("Never reached sessionStorage");
    const writes = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("blocked from startup");
      });
    await claimAnonymousSnapshots("account:A", {
      scope: "anonymous",
      state: original,
    });
    writes.mockRestore();
    expect(
      (await claimAnonymousSnapshots("account:B")).state.captureItems,
    ).toEqual([]);
    expect(
      (await claimAnonymousSnapshots("account:A")).state.captureItems,
    ).toEqual(original.captureItems);
    storeAccountSnapshot("account:A", createEmptyWorkflowState());
    expect(
      (await claimAnonymousSnapshots("account:A")).state.captureItems,
    ).toEqual([]);
    sessionStorage.clear();
    expect(
      (await claimAnonymousSnapshots("account:A")).state.captureItems,
    ).toEqual(original.captureItems);
    expect((await listSnapshotRecoveries())[0]?.state?.captureItems).toEqual(
      original.captureItems,
    );
  });

  it("durably combines same-owner fallback work sharing a copied source token", async () => {
    storeAccountSnapshot("anonymous", createEmptyWorkflowState());
    const first = captured("First copied tab");
    const second = captured("Second copied tab");
    const writes = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("quota");
      });
    await claimAnonymousSnapshots("account:A", {
      scope: "anonymous",
      state: first,
    });
    await claimAnonymousSnapshots("account:A", {
      scope: "anonymous",
      state: second,
    });
    writes.mockRestore();
    expect(
      (await claimAnonymousSnapshots("account:A")).state.captureItems
        .map((capture) => capture.raw_text)
        .sort(),
    ).toEqual(["First copied tab", "Second copied tab"]);
  });

  it("explicit browser reset clears retained payloads without releasing their owner", async () => {
    const original = captured("Clear this recovery");
    storeAccountSnapshot("anonymous", original);
    const writes = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("quota");
      });
    await claimAnonymousSnapshots("account:A");
    writes.mockRestore();
    await clearSnapshotRecoveryPayloads();
    const retained = (await listSnapshotRecoveries())[0];
    expect(retained?.owner).toBe("account:A");
    expect(retained?.state).toBeUndefined();
    expect(
      (await claimAnonymousSnapshots("account:A")).state.captureItems,
    ).toEqual([]);
    expect(
      (await claimAnonymousSnapshots("account:B")).state.captureItems,
    ).toEqual([]);
  });

  it("preserves original bytes and refuses adoption when fallback transaction aborts", async () => {
    const original = captured("Still unclaimed");
    storeAccountSnapshot("anonymous", original);
    const bytes = sessionStorage.getItem(accountSnapshotKey("anonymous"));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    const originalTransaction = IDBDatabase.prototype.transaction;
    vi.spyOn(IDBDatabase.prototype, "transaction").mockImplementation(function (
      this: IDBDatabase,
      stores,
      mode,
      options,
    ) {
      const transaction = originalTransaction.call(this, stores, mode, options);
      if (this.name === "lifeos-snapshot-recovery" && mode === "readwrite")
        queueMicrotask(() => transaction.abort());
      return transaction;
    });
    const owners = {};
    await expect(
      claimAnonymousSnapshots(
        "account:A",
        { scope: "anonymous", state: original },
        undefined,
        owners,
      ),
    ).rejects.toThrow();
    expect(owners).toEqual({});
    expect(sessionStorage.getItem(accountSnapshotKey("anonymous"))).toBe(bytes);
    expect(sessionStorage.getItem(accountSnapshotKey("account:A"))).toBeNull();
  });
});
