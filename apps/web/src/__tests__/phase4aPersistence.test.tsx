import { describe, expect, it, vi } from "vitest";
import { createArea } from "@/lib/data/workflow";

const userId = "550e8400-e29b-41d4-a716-446655440001";

function authenticatedClient(fromMock: (table: string) => unknown) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      }),
    },
    from: (table: string) => fromMock(table),
  };
}

describe("Phase 4A persistence surface contracts", () => {
  it("persists a palette color when creating an area", async () => {
    const existingSelect = vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue({
        data: [],
        error: null,
      }),
    });
    const single = vi.fn().mockResolvedValue({
      data: {
        id: "550e8400-e29b-41d4-a716-446655440101",
        user_id: userId,
        name: "Deep Work",
        slug: "deep-work",
        description: null,
        color: "#3f8fd6",
        icon: null,
        sort_order: 0,
        is_active: true,
        created_at: "2026-05-28T16:30:00.000Z",
        updated_at: "2026-05-28T16:30:00.000Z",
      },
      error: null,
    });
    const insertSelect = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select: insertSelect });
    const from = vi
      .fn()
      .mockReturnValueOnce({ select: existingSelect })
      .mockReturnValueOnce({ insert });

    const result = await createArea(authenticatedClient(from), {
      name: "Deep Work",
      description: null,
      color: "#3f8fd6",
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ color: "#3f8fd6" }),
    );
    expect(result.area.color).toBe("#3f8fd6");
  });
});
