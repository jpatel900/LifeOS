import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  claimAnonymousSnapshots,
  storeAccountSnapshot,
} from "./accountSnapshot";
import { loadStoredStateFromSession } from "./reducerCore";

beforeEach(() => {
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

  it("imports new anonymous work once, preserving both account work and references", () => {
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
    claimAnonymousSnapshots("account:A");
    expect(
      loadStoredStateFromSession(accountSnapshotKey("account:A")).state
        ?.captureItems,
    ).toEqual([...account.captureItems, ...anonymous.captureItems]);
    expect(sessionStorage.getItem(accountSnapshotKey("anonymous"))).toBeNull();
    claimAnonymousSnapshots("account:B");
    expect(
      loadStoredStateFromSession(accountSnapshotKey("account:B")).state
        ?.captureItems,
    ).toEqual([]);
  });

  it("uses the latest mounted snapshot when the passive mirror has not caught up", () => {
    const latest = captured("Just typed");
    claimAnonymousSnapshots("account:A", { scope: "anonymous", state: latest });
    expect(
      loadStoredStateFromSession(accountSnapshotKey("account:A")).state
        ?.captureItems,
    ).toEqual(latest.captureItems);
  });

  it("retains the anonymous source if the destination write is blocked", () => {
    const anonymous = captured("Keep this thought");
    sessionStorage.setItem(
      accountSnapshotKey("anonymous"),
      JSON.stringify(anonymous),
    );
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota", "QuotaExceededError");
    });
    expect(() => claimAnonymousSnapshots("account:A")).toThrow();
    expect(sessionStorage.getItem(accountSnapshotKey("anonymous"))).toBe(
      JSON.stringify(anonymous),
    );
  });

  it("reserves source ownership if removal fails and rejects late anonymous mirrors", () => {
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
    expect(() => claimAnonymousSnapshots("account:A")).toThrow();
    expect(() => storeAccountSnapshot("anonymous", anonymous)).toThrow();
    claimAnonymousSnapshots("account:B");
    expect(
      loadStoredStateFromSession(accountSnapshotKey("account:B")).state
        ?.captureItems,
    ).toEqual([]);
    expect(
      loadStoredStateFromSession(accountSnapshotKey("account:A")).state
        ?.captureItems,
    ).toEqual(anonymous.captureItems);
    remove.mockRestore();
    claimAnonymousSnapshots("account:A");
    expect(sessionStorage.getItem(accountSnapshotKey("anonymous"))).toBeNull();
  });
});
