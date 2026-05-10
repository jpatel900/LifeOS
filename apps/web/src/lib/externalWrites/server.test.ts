import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSupabaseServerUser: vi.fn(),
  requireSupabaseServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  requireSupabaseServerUser: mocks.requireSupabaseServerUser,
  requireSupabaseServiceRoleClient: mocks.requireSupabaseServiceRoleClient,
}));

import {
  createPendingExternalWriteEventForAccessToken,
  updateExternalWriteEventResultForAccessToken,
} from "./server";

const user = { id: "550e8400-e29b-41d4-a716-446655440001" };
const auditRow = {
  id: "550e8400-e29b-41d4-a716-446655440701",
  user_id: user.id,
  area_id: null,
  provider: "google_calendar",
  operation: "calendar.events.insert",
  target_type: "time_block_proposal",
  target_id: "550e8400-e29b-41d4-a716-446655440501",
  request_summary_json: { proposal_id: "550e8400-e29b-41d4-a716-446655440501" },
  result_summary_json: {},
  result_status: "pending",
  error_message: null,
  created_at: "2026-05-09T00:00:00.000Z",
};

describe("external write audit helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSupabaseServerUser.mockResolvedValue({ user });
  });

  it("creates audit rows through the service-role client after matching the authenticated user", async () => {
    const single = vi.fn().mockResolvedValue({ data: auditRow, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const serviceClient = {
      from: vi.fn().mockReturnValue({ insert }),
    };
    mocks.requireSupabaseServiceRoleClient.mockReturnValue(serviceClient);

    const result = await createPendingExternalWriteEventForAccessToken(
      "supabase-access-token",
      {
        areaId: null,
        operation: "calendar.events.insert",
        requestSummary: {
          proposal_id: "550e8400-e29b-41d4-a716-446655440501",
        },
        targetId: "550e8400-e29b-41d4-a716-446655440501",
        targetType: "time_block_proposal",
        userId: user.id,
      },
    );

    expect(result.id).toBe(auditRow.id);
    expect(mocks.requireSupabaseServiceRoleClient).toHaveBeenCalled();
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: user.id,
        result_status: "pending",
      }),
    );
  });

  it("updates only the authenticated user's audit row through the service-role client", async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        ...auditRow,
        result_status: "failed",
        error_message: "Google Calendar event insert failed.",
      },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ single });
    const eq = vi.fn();
    const chain = { eq, select };
    eq.mockReturnValue(chain);
    const update = vi.fn().mockReturnValue(chain);
    const serviceClient = {
      from: vi.fn().mockReturnValue({ update }),
    };
    mocks.requireSupabaseServiceRoleClient.mockReturnValue(serviceClient);

    await updateExternalWriteEventResultForAccessToken(
      "supabase-access-token",
      auditRow.id,
      {
        errorMessage: "Google Calendar event insert failed.",
        resultStatus: "failed",
        resultSummary: { google_event_id_stored: false },
      },
    );

    expect(eq).toHaveBeenCalledWith("id", auditRow.id);
    expect(eq).toHaveBeenCalledWith("user_id", user.id);
  });
});
