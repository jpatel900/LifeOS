import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { createEmptyWorkflowState } from "../workflow/shared";
import { createRawCaptureItem } from "../workflow/capture";
import { mergeAnonymousSnapshot } from "./accountSnapshot";
import {
  clearSnapshotRecoveriesForTests,
  clearSnapshotRecoveryPayloads,
  listSnapshotRecoveries,
  repairSnapshotRecoveryOwner,
  reserveSnapshotRecovery,
} from "./snapshotRecovery";

beforeEach(clearSnapshotRecoveriesForTests);

async function legacyRecovery() {
  return reserveSnapshotRecovery(
    {
      id: "legacy-conflict",
      scope: "anonymous",
      owner: "account:B",
      state: {
        ...createEmptyWorkflowState(),
        captureItems: [createRawCaptureItem({ rawText: "Preserved work" })],
      },
      unanchored: true,
    },
    mergeAnonymousSnapshot,
  );
}

describe("conditional recovery owner repair", () => {
  it("changes only the owner of the validated recovery version", async () => {
    const old = await legacyRecovery();
    expect(await repairSnapshotRecoveryOwner(old, "account:A")).toEqual({
      ...old,
      owner: "account:A",
    });
    expect(await listSnapshotRecoveries()).toEqual([
      { ...old, owner: "account:A" },
    ]);
  });

  it("refuses a stale repair after another tab adds work", async () => {
    const old = await legacyRecovery();
    const current = await reserveSnapshotRecovery(
      {
        ...old,
        state: {
          ...createEmptyWorkflowState(),
          captureItems: [
            createRawCaptureItem({ rawText: "Concurrent new work" }),
          ],
        },
      },
      mergeAnonymousSnapshot,
    );
    expect(await repairSnapshotRecoveryOwner(old, "account:A")).toBeNull();
    expect(await listSnapshotRecoveries()).toEqual([current]);
  });

  it("never resurrects a payload cleared during owner resolution", async () => {
    const old = await legacyRecovery();
    await clearSnapshotRecoveryPayloads();
    expect(await repairSnapshotRecoveryOwner(old, "account:A")).toBeNull();
    expect(await listSnapshotRecoveries()).toEqual([
      { id: old.id, scope: old.scope, owner: old.owner },
    ]);
  });
});
