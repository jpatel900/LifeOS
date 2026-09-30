import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  listCaptureItems,
  syncJournaledCapture,
  type MinimalSupabaseClient,
} from "../data/workflow";
import {
  journalCaptureWrite,
  replayDurableWrites,
} from "../durability/durableWrites";
import {
  clearPendingWrites,
  pendingWriteCount,
} from "../durability/pendingWriteJournal";
import { createInitialWorkflowState, submitRawCapture } from "../workflow";

const CUSTOM_AREA = {
  id: "existing-custom-area",
  user_id: "synthetic-user",
  name: "Example area",
  color: "#64748b",
  created_at: "2026-07-05T15:00:00.000Z",
};

describe("raw capture area resolution", () => {
  beforeEach(async () => {
    await clearPendingWrites();
  });
  it("keeps an unscoped capture unassigned in a custom-only account", () => {
    const state = { ...createInitialWorkflowState(), areas: [CUSTOM_AREA] };
    const next = submitRawCapture(state, {
      rawText: "Volunteer sponsor follow-up",
      areaId: null,
    });
    expect(next.captureItems[0]?.area_id).toBeNull();
  });

  it("uses an existing custom area but never invents a stale area ID", () => {
    const state = { ...createInitialWorkflowState(), areas: [CUSTOM_AREA] };
    expect(
      submitRawCapture(state, {
        rawText: "Volunteer sponsor follow-up",
        areaId: CUSTOM_AREA.id,
      }).captureItems[0]?.area_id,
    ).toBe(CUSTOM_AREA.id);
    expect(
      submitRawCapture(state, {
        rawText: "Volunteer sponsor follow-up",
        areaId: "area-volunteer",
      }).captureItems[0]?.area_id,
    ).toBeNull();
  });

  it("journals, replays, and reads back a custom-only unscoped capture with null area", async () => {
    const state = { ...createInitialWorkflowState(), areas: [CUSTOM_AREA] };
    const capture = submitRawCapture(state, {
      rawText: "Synthetic unscoped thought",
      areaId: null,
    }).captureItems[0];
    let storedRow: Record<string, unknown> | null = null;
    const upsert = vi.fn((row: Record<string, unknown>) => ({
      select: () => ({
        single: async () => {
          storedRow = {
            ...row,
            id: "550e8400-e29b-41d4-a716-446655440010",
            raw_audio_ref: null,
            inferred_area_confidence: null,
            status: "new",
            created_at: "2026-07-05T15:00:00.000Z",
          };
          return { data: storedRow, error: null };
        },
      }),
    }));
    const from = vi.fn(() => ({
      upsert,
      select: () => ({
        order: async () => ({
          data: storedRow ? [storedRow] : [],
          error: null,
        }),
      }),
    }));
    const client = {
      from,
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "550e8400-e29b-41d4-a716-446655440001" } },
          error: null,
        }),
      },
    } as unknown as MinimalSupabaseClient;
    await journalCaptureWrite({
      workflowCaptureId: capture.id,
      workflowAreaId: capture.area_id,
      persistedAreaId: null,
      rawText: capture.raw_text,
      returnHook: null,
      clientCaptureId: "synthetic-capture-write",
    });
    expect(await pendingWriteCount("capture")).toBe(1);
    const summary = await replayDurableWrites({
      syncWin: vi.fn(),
      syncReview: vi.fn(),
      syncCapture: (args) => syncJournaledCapture(client, args),
    });
    expect(summary).toMatchObject({ synced: 1, failed: 0 });
    expect(await pendingWriteCount("capture")).toBe(0);
    expect(upsert.mock.calls[0]?.[0]).toMatchObject({
      area_id: null,
      raw_text: capture.raw_text,
    });
    const listed = await listCaptureItems(client);
    expect(listed.provider).toBe("supabase");
    expect(listed.captures[0]?.area_id).toBeNull();
    expect(listed.captures[0]?.raw_text).toBe(capture.raw_text);
  });

  it("keeps a capture unassigned when no areas exist", () => {
    const state = { ...createInitialWorkflowState(), areas: [] };
    expect(
      submitRawCapture(state, {
        rawText: "An ordinary thought",
        areaId: null,
      }).captureItems[0]?.area_id,
    ).toBeNull();
  });
});
