import { describe, expect, it, vi } from "vitest";
import { syncJournaledCapture } from "./capture";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const input = {
  client_capture_id: "synthetic-capture-write",
  area_id: null,
  raw_text: "Synthetic capture",
  return_hook: null,
};

describe("capture replay account guard at the write boundary", () => {
  it("recovers the existing ID after response loss without clearing its historical area or status", async () => {
    const row = {
      ...input,
      id: "44444444-4444-4444-8444-444444444444",
      user_id: USER_A,
      area_id: "55555555-5555-4555-8555-555555555555",
      raw_audio_ref: null,
      capture_mode: "text",
      inferred_area_confidence: null,
      status: "resolved",
      created_at: "2026-05-27T00:00:00.000Z",
    };
    const original = { ...row };
    const filters: Array<[string, string]> = [];
    const read = {
      eq(column: string, value: string) {
        filters.push([column, value]);
        return read;
      },
      single: async () => ({ data: row, error: null }),
    };
    const client = {
      auth: {
        getUser: async () => ({ data: { user: { id: USER_A } }, error: null }),
      },
      from: () => ({
        upsert: (
          values: Record<string, unknown>,
          options: { ignoreDuplicates?: boolean },
        ) => ({
          select: () => {
            if (!options.ignoreDuplicates) Object.assign(row, values);
            const result = {
              data: options.ignoreDuplicates ? null : row,
              error: null,
            };
            return {
              single: async () => result,
              maybeSingle: async () => result,
            };
          },
        }),
        select: () => read,
      }),
    };
    expect(await syncJournaledCapture(client, input)).toEqual({
      provider: "supabase",
      captureId: row.id,
    });
    expect(row).toEqual(original);
    expect(filters).toEqual([
      ["user_id", USER_A],
      ["client_capture_id", input.client_capture_id],
    ]);
  });

  it("does not write through an identity that changed during the writer's own user read", async () => {
    const from = vi.fn();
    const client = {
      from,
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: USER_B } },
          error: null,
        })),
      },
    };
    await expect(
      syncJournaledCapture(client, input, {
        expectedUserId: USER_A,
        assertCurrentAccount: vi.fn(),
      }),
    ).rejects.toThrow("account changed");
    expect(from).not.toHaveBeenCalled();
  });

  it("checks the auth generation after its awaited user read, including A to B to A", async () => {
    const from = vi.fn();
    let changed = false;
    const client = {
      from,
      auth: {
        getUser: vi.fn(async () => {
          changed = true;
          return { data: { user: { id: USER_A } }, error: null };
        }),
      },
    };
    await expect(
      syncJournaledCapture(client, input, {
        expectedUserId: USER_A,
        assertCurrentAccount: () => {
          if (changed) throw new Error("The account changed.");
        },
      }),
    ).rejects.toThrow("account changed");
    expect(from).not.toHaveBeenCalled();
  });
});
