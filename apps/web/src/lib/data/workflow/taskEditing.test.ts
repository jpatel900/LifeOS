import { describe, expect, it, vi } from "vitest";
import { editBacklogTaskAccountRow } from "./taskEditing";
import type { MinimalSupabaseClient } from "./shared";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const TASK_ID = "22222222-2222-4222-8222-222222222222";
const AREA_ID = "33333333-3333-4333-8333-333333333333";
const UPDATED_AT = "2026-07-04T09:00:00.000Z";

function rowFor(overrides: Record<string, unknown> = {}) {
  return {
    id: TASK_ID,
    user_id: USER_ID,
    area_id: AREA_ID,
    project_id: null,
    source_capture_item_id: null,
    title: "New title",
    description: null,
    status: "backlog",
    priority_score: null,
    priority_confidence: null,
    task_type: null,
    energy_type: null,
    estimated_minutes_low: null,
    estimated_minutes_high: null,
    due_at: null,
    definition_of_done: null,
    first_tiny_step: null,
    created_at: UPDATED_AT,
    updated_at: "2026-07-05T09:00:00.000Z",
    ...overrides,
  };
}

function client(maybeSingleResult: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(maybeSingleResult);
  const select = vi.fn().mockReturnValue({ maybeSingle });
  const eq3 = vi.fn().mockReturnValue({ select });
  const eq2 = vi.fn().mockReturnValue({ eq: eq3 });
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
  const update = vi.fn().mockReturnValue({ eq: eq1 });

  return {
    supabase: {
      from: vi.fn().mockReturnValue({ update }),
      auth: {
        getUser: vi
          .fn()
          .mockResolvedValue({ data: { user: { id: USER_ID } }, error: null }),
      },
    } as unknown as MinimalSupabaseClient,
    update,
    eq1,
    eq2,
    eq3,
    select,
  };
}

describe("editBacklogTaskAccountRow", () => {
  it("throws when there is no client — demo edits use local workflow state", async () => {
    await expect(
      editBacklogTaskAccountRow(
        null,
        TASK_ID,
        { title: "New title", description: null, area_id: AREA_ID },
        UPDATED_AT,
      ),
    ).rejects.toThrow("Demo backlog task edits use local workflow state.");
  });

  it("rejects a blank title at the account boundary via the reused TaskSchema, before any network call", async () => {
    const supabase = {
      from: vi.fn(),
      auth: { getUser: vi.fn() },
    } as unknown as MinimalSupabaseClient;

    await expect(
      editBacklogTaskAccountRow(
        supabase,
        TASK_ID,
        { title: "", description: null, area_id: AREA_ID },
        UPDATED_AT,
      ),
    ).rejects.toThrow();
    expect(supabase.from).not.toHaveBeenCalled();
    expect(supabase.auth!.getUser).not.toHaveBeenCalled();
  });

  it("rejects a non-uuid area_id at the account boundary via the reused TaskSchema", async () => {
    const supabase = {
      from: vi.fn(),
      auth: { getUser: vi.fn() },
    } as unknown as MinimalSupabaseClient;

    await expect(
      editBacklogTaskAccountRow(
        supabase,
        TASK_ID,
        { title: "New title", description: null, area_id: "area-main-job" },
        UPDATED_AT,
      ),
    ).rejects.toThrow();
  });

  it("throws a sign-in message when no user session exists", async () => {
    const supabase = {
      from: vi.fn(),
      auth: {
        getUser: vi
          .fn()
          .mockResolvedValue({ data: { user: null }, error: null }),
      },
    } as unknown as MinimalSupabaseClient;

    await expect(
      editBacklogTaskAccountRow(
        supabase,
        TASK_ID,
        { title: "New title", description: null, area_id: AREA_ID },
        UPDATED_AT,
      ),
    ).rejects.toThrow("Sign in before saving task edits.");
  });

  it("updates title/description/area_id guarded by id, backlog status, and updated_at", async () => {
    const { supabase, update, eq1, eq2, eq3, select } = client({
      data: rowFor(),
      error: null,
    });

    const result = await editBacklogTaskAccountRow(
      supabase,
      TASK_ID,
      { title: "New title", description: "New notes", area_id: AREA_ID },
      UPDATED_AT,
    );

    expect(update).toHaveBeenCalledWith({
      title: "New title",
      description: "New notes",
      area_id: AREA_ID,
    });
    expect(eq1).toHaveBeenCalledWith("id", TASK_ID);
    expect(eq2).toHaveBeenCalledWith("status", "backlog");
    expect(eq3).toHaveBeenCalledWith("updated_at", UPDATED_AT);
    expect(select).toHaveBeenCalled();
    expect(result).toEqual({
      provider: "supabase",
      status: "updated",
      task: expect.objectContaining({ id: TASK_ID, title: "New title" }),
    });
  });

  it("returns a conflict (not a throw) when the guard matches zero rows", async () => {
    const { supabase } = client({ data: null, error: null });

    const result = await editBacklogTaskAccountRow(
      supabase,
      TASK_ID,
      { title: "New title", description: null, area_id: AREA_ID },
      UPDATED_AT,
    );

    expect(result).toEqual({ provider: "supabase", status: "conflict" });
  });

  it("throws the Supabase message on a real error", async () => {
    const { supabase } = client({
      data: null,
      error: { message: "permission denied" },
    });

    await expect(
      editBacklogTaskAccountRow(
        supabase,
        TASK_ID,
        { title: "New title", description: null, area_id: AREA_ID },
        UPDATED_AT,
      ),
    ).rejects.toThrow("permission denied");
  });
});
