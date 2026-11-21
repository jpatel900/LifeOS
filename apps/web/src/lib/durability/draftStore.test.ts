import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Phase2TaskDraft } from "@lifeos/schemas";
import { createEmptyWorkflowState } from "../workflow/shared";
import { createRawCaptureItem } from "../workflow/capture";
import { reserveCaptureWriteOwners } from "./pendingWriteJournal";
import {
  claimAnonymousSnapshots,
  mergeAnonymousSnapshot,
} from "../workflowContext/accountSnapshot";
import {
  clearSnapshotRecoveriesForTests,
  reserveSnapshotRecovery,
} from "../workflowContext/snapshotRecovery";
import {
  clearStoredTaskDrafts,
  claimAnonymousTaskDrafts,
  listStoredTaskDrafts,
  reconcileStoredTaskDrafts,
  storedTaskDraftCount,
} from "./draftStore";

/**
 * #737 C1 re-score GAP 3 — the draft store's own contract, without React.
 *
 * The guard test (`src/__tests__/durableTriageDraftGuard.test.tsx`) proves the
 * provider uses this correctly; these prove the store itself behaves, so a
 * failure tells you which of the two moved.
 */

function makeDraft(
  overrides: Partial<Phase2TaskDraft> & { id: string },
): Phase2TaskDraft {
  return {
    user_id: "user-1",
    capture_item_id: "capture-1",
    area_id: "area-1",
    title: `Draft ${overrides.id}`,
    description: null,
    confidence: 0.8,
    estimated_minutes_low: 30,
    estimated_minutes_high: 60,
    first_tiny_step: null,
    breakdown: null,
    person_mentions: [],
    is_commitment: false,
    status: "pending",
    created_at: "2026-05-08T12:00:00.000Z",
    ...overrides,
  } as Phase2TaskDraft;
}

beforeEach(async () => {
  await clearStoredTaskDrafts();
  await clearSnapshotRecoveriesForTests();
  sessionStorage.clear();
});

afterEach(async () => {
  await clearStoredTaskDrafts();
});

describe("draftStore", () => {
  it.each([false, true])(
    "uses durable fallback ownership for drafts without a session source (mixed=%s)",
    async (mixed) => {
      const first = createRawCaptureItem({ rawText: "A's recovery" });
      const second = createRawCaptureItem({ rawText: "B's recovery" });
      await reserveCaptureWriteOwners("A", [first.id]);
      if (mixed) await reserveCaptureWriteOwners("B", [second.id]);
      await reserveSnapshotRecovery(
        {
          id: crypto.randomUUID(),
          scope: "anonymous",
          owner: "account:B",
          unanchored: true,
          state: {
            ...createEmptyWorkflowState(),
            captureItems: mixed ? [first, second] : [first],
          },
        },
        mergeAnonymousSnapshot,
      );
      const draft = makeDraft({
        id: "fallback-draft",
        capture_item_id: first.id,
      });
      await reconcileStoredTaskDrafts([draft], "anonymous");
      const owners = {};
      const claimed = await claimAnonymousSnapshots(
        "account:C",
        undefined,
        undefined,
        owners,
      );
      await claimAnonymousTaskDrafts("account:C", {
        ...owners,
        ...claimed.draftOwners,
      });
      expect(await listStoredTaskDrafts("account:C")).toEqual([]);
      expect(
        await listStoredTaskDrafts(mixed ? "anonymous" : "account:A"),
      ).toEqual([draft]);
    },
  );

  it("leaves quarantined source drafts untouched across account claims", async () => {
    const draft = makeDraft({ id: "quarantined-draft" });
    await reconcileStoredTaskDrafts([draft], "anonymous");
    for (const account of ["account:A", "account:B"]) {
      await claimAnonymousTaskDrafts(account, { anonymous: null });
      expect(await listStoredTaskDrafts(account)).toEqual([]);
      expect(await listStoredTaskDrafts("anonymous")).toEqual([draft]);
    }
  });
  it("honors a reserved snapshot owner when another account finishes recovery", async () => {
    const draft = makeDraft({ id: "reserved-draft" });
    await reconcileStoredTaskDrafts([draft], "anonymous");
    await claimAnonymousTaskDrafts("account:B", { anonymous: "account:A" });
    expect(await listStoredTaskDrafts("account:A")).toEqual([draft]);
    expect(await listStoredTaskDrafts("account:B")).toEqual([]);
  });
  it("claims explicitly anonymous drafts once and blocks a retired scope's late mirror", async () => {
    const draft = makeDraft({ id: "anonymous-unique-draft" });
    await reconcileStoredTaskDrafts([draft], "anonymous");
    await Promise.all([
      claimAnonymousTaskDrafts("account:A"),
      claimAnonymousTaskDrafts("account:B"),
    ]);
    await reconcileStoredTaskDrafts([draft], "anonymous");
    await claimAnonymousTaskDrafts("account:B");
    expect(await listStoredTaskDrafts("account:A")).toEqual([draft]);
    expect(await listStoredTaskDrafts("account:B")).toEqual([]);
    expect(await listStoredTaskDrafts("anonymous")).toEqual([]);
    expect(await storedTaskDraftCount()).toBe(1);
  });
  it("isolates same-id drafts and decisions by account and retains legacy drafts", async () => {
    const legacy = makeDraft({ id: "d-1", title: "Unattributed old draft" });
    const accountA = makeDraft({ id: "d-1", title: "Private to A" });
    const accountB = makeDraft({ id: "d-1", title: "Private to B" });
    await reconcileStoredTaskDrafts([legacy]);
    await reconcileStoredTaskDrafts([accountA], "account:A");
    await reconcileStoredTaskDrafts([accountB], "account:B");
    await reconcileStoredTaskDrafts(
      [{ ...accountA, status: "rejected" }],
      "account:A",
    );
    await reconcileStoredTaskDrafts([accountA], "account:A");

    expect(await listStoredTaskDrafts("account:A")).toEqual([
      { ...accountA, status: "rejected" },
    ]);
    expect(await listStoredTaskDrafts("account:B")).toEqual([accountB]);
    expect(await listStoredTaskDrafts("anonymous")).toEqual([]);
    expect(await listStoredTaskDrafts()).toEqual([legacy]);
    expect(await storedTaskDraftCount()).toBe(3);
  });
  it("holds a draft and reads it back whole", async () => {
    const draft = makeDraft({ id: "d-1", title: "Renew the certificate" });
    await reconcileStoredTaskDrafts([draft]);

    expect(await listStoredTaskDrafts()).toEqual([draft]);
  });

  it("last write wins for the same draft id", async () => {
    await reconcileStoredTaskDrafts([makeDraft({ id: "d-1", title: "First" })]);
    await reconcileStoredTaskDrafts([
      makeDraft({ id: "d-1", title: "Edited by the user" }),
    ]);

    const stored = await listStoredTaskDrafts();
    expect(stored).toHaveLength(1);
    expect(stored[0]!.title).toBe("Edited by the user");
  });

  // Bug hunt #12: with two LifeOS tabs open, each tab reconciled the store
  // to ITS OWN drafts and deleted the other tab's. A draft only leaves the
  // device when the user decides about it, and that decision is written as
  // the draft's status — never inferred from one tab not knowing it.
  it("keeps a draft another tab wrote, even when this tab does not hold it", async () => {
    // Tab A sorted capture X.
    await reconcileStoredTaskDrafts([makeDraft({ id: "tab-a-x" })]);
    // Tab B, which never saw X, sorts capture Y.
    await reconcileStoredTaskDrafts([
      makeDraft({ id: "tab-b-y", capture_item_id: "capture-2" }),
    ]);

    expect(
      (await listStoredTaskDrafts()).map((draft) => draft.id).sort(),
    ).toEqual(["tab-a-x", "tab-b-y"]);
  });

  it("an empty set changes nothing", async () => {
    await reconcileStoredTaskDrafts([makeDraft({ id: "d-1" })]);
    await reconcileStoredTaskDrafts([]);

    expect((await listStoredTaskDrafts()).map((draft) => draft.id)).toEqual([
      "d-1",
    ]);
  });

  it("records a decision, and a stale undecided copy from another tab cannot undo it", async () => {
    await reconcileStoredTaskDrafts([makeDraft({ id: "d-1" })]);
    // This tab rejected it.
    await reconcileStoredTaskDrafts([
      makeDraft({ id: "d-1", status: "rejected" }),
    ]);
    // Another tab still holds its older, undecided copy and writes it back.
    await reconcileStoredTaskDrafts([makeDraft({ id: "d-1" })]);

    const stored = await listStoredTaskDrafts();
    expect(stored).toHaveLength(1);
    expect(stored[0]!.status).toBe("rejected");
  });

  it("reads degrade to nothing stored when IndexedDB is missing", async () => {
    const realIndexedDb = globalThis.indexedDB;
    // @ts-expect-error deliberately removing the global.
    delete globalThis.indexedDB;
    try {
      expect(await listStoredTaskDrafts()).toEqual([]);
      expect(await storedTaskDraftCount()).toBe(0);
    } finally {
      globalThis.indexedDB = realIndexedDb;
    }
  });

  it("a write THROWS when IndexedDB is missing, rather than pretending", async () => {
    // The caller must be able to tell the user their draft is only in this
    // tab. A silent no-op here is the exact data-loss shape this tier exists
    // to end — the same rule `enqueuePendingWrite` follows.
    const realIndexedDb = globalThis.indexedDB;
    // @ts-expect-error deliberately removing the global.
    delete globalThis.indexedDB;
    try {
      await expect(
        reconcileStoredTaskDrafts([makeDraft({ id: "d-1" })]),
      ).rejects.toThrow(/IndexedDB is unavailable/);
    } finally {
      globalThis.indexedDB = realIndexedDb;
    }
  });
});
