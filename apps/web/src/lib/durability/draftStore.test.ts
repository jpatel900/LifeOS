import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Phase2TaskDraft } from "@lifeos/schemas";
import {
  clearStoredTaskDrafts,
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
});

afterEach(async () => {
  await clearStoredTaskDrafts();
});

describe("draftStore", () => {
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

  it("removes a draft that is no longer in the set", async () => {
    await reconcileStoredTaskDrafts([
      makeDraft({ id: "d-1" }),
      makeDraft({ id: "d-2" }),
    ]);
    expect(await storedTaskDraftCount()).toBe(2);

    // What an accept or a reject looks like from here: the draft stops being
    // pending, so the caller stops passing it, so the store stops holding it.
    await reconcileStoredTaskDrafts([makeDraft({ id: "d-2" })]);

    expect((await listStoredTaskDrafts()).map((draft) => draft.id)).toEqual([
      "d-2",
    ]);
  });

  it("an empty set empties the store", async () => {
    await reconcileStoredTaskDrafts([makeDraft({ id: "d-1" })]);
    await reconcileStoredTaskDrafts([]);

    expect(await listStoredTaskDrafts()).toEqual([]);
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
