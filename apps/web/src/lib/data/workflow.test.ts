import { describe, expect, it, vi } from "vitest";
import {
  createCaptureItem,
  listAreas,
  type MinimalSupabaseClient,
} from "./workflow";

describe("workflow data provider", () => {
  it("lists mock areas when Supabase is not configured", async () => {
    const result = await listAreas(null);

    expect(result.provider).toBe("mock");
    expect(result.areas.map((area) => area.name)).toContain("Main Job");
    expect(result.areas.every((area) => area.is_active)).toBe(true);
  });

  it("reads active areas through Supabase and validates the response", async () => {
    const eq = vi.fn().mockResolvedValue({
      data: [
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          user_id: "550e8400-e29b-41d4-a716-446655440001",
          name: "Main Job",
          slug: "main-job",
          description: null,
          color: "#2563eb",
          icon: "briefcase",
          sort_order: 0,
          is_active: true,
          created_at: "2026-05-07T00:00:00.000Z",
          updated_at: "2026-05-07T00:00:00.000Z",
        },
      ],
      error: null,
    });
    const order = vi.fn().mockReturnValue({ eq });
    const select = vi.fn().mockReturnValue({ order });
    const from = vi.fn().mockReturnValue({ select });
    const getUser = vi.fn().mockResolvedValue({
      data: {
        user: { id: "550e8400-e29b-41d4-a716-446655440001" },
      },
      error: null,
    });

    const result = await listAreas(
      { from, auth: { getUser } } as unknown as MinimalSupabaseClient
    );

    expect(getUser).toHaveBeenCalled();
    expect(from).toHaveBeenCalledWith("areas");
    expect(select).toHaveBeenCalledWith(
      "id,user_id,name,slug,description,color,icon,sort_order,is_active,created_at,updated_at"
    );
    expect(order).toHaveBeenCalledWith("sort_order", { ascending: true });
    expect(eq).toHaveBeenCalledWith("is_active", true);
    expect(result.provider).toBe("supabase");
    expect(result.areas[0]?.slug).toBe("main-job");
  });

  it("requires an authenticated user before reading Supabase areas", async () => {
    const from = vi.fn();
    const getUser = vi.fn().mockResolvedValue({
      data: { user: null },
      error: null,
    });

    await expect(
      listAreas({ from, auth: { getUser } } as unknown as MinimalSupabaseClient)
    ).rejects.toThrow("Sign in before loading areas from Supabase.");
    expect(from).not.toHaveBeenCalled();
  });

  it("persists capture items through Supabase after validating input", async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        id: "550e8400-e29b-41d4-a716-446655440010",
        user_id: "550e8400-e29b-41d4-a716-446655440001",
        area_id: null,
        raw_text: "Call dentist tomorrow",
        raw_audio_ref: null,
        capture_mode: "text",
        inferred_area_confidence: null,
        status: "new",
        created_at: "2026-05-07T00:00:00.000Z",
      },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });
    const getUser = vi.fn().mockResolvedValue({
      data: {
        user: { id: "550e8400-e29b-41d4-a716-446655440001" },
      },
      error: null,
    });

    const result = await createCaptureItem(
      { from, auth: { getUser } } as unknown as MinimalSupabaseClient,
      { raw_text: "Call dentist tomorrow", area_id: null }
    );

    expect(from).toHaveBeenCalledWith("capture_items");
    expect(insert).toHaveBeenCalledWith({
      user_id: "550e8400-e29b-41d4-a716-446655440001",
      area_id: null,
      raw_text: "Call dentist tomorrow",
      capture_mode: "text",
      status: "new",
    });
    expect(result.provider).toBe("supabase");
    expect(result.capture.raw_text).toBe("Call dentist tomorrow");
  });

  it("keeps capture working in mock mode", async () => {
    const result = await createCaptureItem(null, {
      raw_text: "Brain dump for later",
      area_id: null,
    });

    expect(result.provider).toBe("mock");
    expect(result.capture.raw_text).toBe("Brain dump for later");
    expect(result.capture.status).toBe("new");
  });
});
