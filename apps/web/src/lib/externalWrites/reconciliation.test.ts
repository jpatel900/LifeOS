import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createCalendarBlockForProposalForAccessToken: vi.fn(),
  getCalendarBlockForProposalForAccessToken: vi.fn(),
  getGoogleCalendarEventForConnection: vi.fn(),
  getGoogleCalendarStoredConnectionForAccessToken: vi.fn(),
  getTimeBlockProposalForAccessToken: vi.fn(),
  requireSupabaseServerUser: vi.fn(),
  requireSupabaseServiceRoleClient: vi.fn(),
  updateCalendarBlockGoogleEventForAccessToken: vi.fn(),
  updateExternalWriteEventResultForAccessToken: vi.fn(),
}));

vi.mock("@/lib/googleCalendar/server", () => ({
  getGoogleCalendarStoredConnectionForAccessToken:
    mocks.getGoogleCalendarStoredConnectionForAccessToken,
}));
vi.mock("@/lib/googleCalendar/events", () => ({
  getGoogleCalendarEventForConnection:
    mocks.getGoogleCalendarEventForConnection,
}));
vi.mock("@/lib/planning/server", () => ({
  createCalendarBlockForProposalForAccessToken:
    mocks.createCalendarBlockForProposalForAccessToken,
  getCalendarBlockForProposalForAccessToken:
    mocks.getCalendarBlockForProposalForAccessToken,
  getTimeBlockProposalForAccessToken: mocks.getTimeBlockProposalForAccessToken,
  updateCalendarBlockGoogleEventForAccessToken:
    mocks.updateCalendarBlockGoogleEventForAccessToken,
}));
vi.mock("@/lib/supabase/server", () => ({
  requireSupabaseServerUser: mocks.requireSupabaseServerUser,
  requireSupabaseServiceRoleClient: mocks.requireSupabaseServiceRoleClient,
}));
vi.mock("./server", () => ({
  updateExternalWriteEventResultForAccessToken:
    mocks.updateExternalWriteEventResultForAccessToken,
}));

import { reconcilePendingGoogleCalendarInsertAuditsForAccessToken } from "./reconciliation";

const user = { id: "550e8400-e29b-41d4-a716-446655440001" };
const proposal = {
  id: "550e8400-e29b-41d4-a716-446655440501",
  user_id: user.id,
  area_id: "550e8400-e29b-41d4-a716-446655440101",
  task_id: null,
  proposed_start: "2026-05-10T16:00:00.000Z",
  proposed_end: "2026-05-10T17:00:00.000Z",
  rationale_json: {},
  conflict_flag: false,
  conflict_details_json: null,
  status: "accepted",
  created_at: "2026-05-10T15:00:00.000Z",
};
const auditRow = {
  id: "550e8400-e29b-41d4-a716-446655440701",
  user_id: user.id,
  area_id: proposal.area_id,
  provider: "google_calendar",
  operation: "calendar.events.insert",
  target_type: "time_block_proposal",
  target_id: proposal.id,
  request_summary_json: { proposal_id: proposal.id },
  result_summary_json: {},
  result_status: "pending",
  error_message: null,
  created_at: "2026-05-10T14:00:00.000Z",
};

function mockPendingRows(rows: unknown[]) {
  const order = vi.fn().mockResolvedValue({ data: rows, error: null });
  const lte = vi.fn().mockReturnValue({ order });
  const eq = vi.fn();
  eq.mockReturnValue({ eq, lte });
  const select = vi.fn().mockReturnValue({ eq });
  mocks.requireSupabaseServiceRoleClient.mockReturnValue({
    from: vi.fn().mockReturnValue({ select }),
  });
  return { lte };
}

describe("external write reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSupabaseServerUser.mockResolvedValue({ user });
    mocks.getGoogleCalendarStoredConnectionForAccessToken.mockResolvedValue({
      connection: { calendar_id: "primary", status: "connected" },
    });
    mocks.getTimeBlockProposalForAccessToken.mockResolvedValue(proposal);
    mocks.getCalendarBlockForProposalForAccessToken.mockResolvedValue(null);
    mocks.createCalendarBlockForProposalForAccessToken.mockResolvedValue({
      id: "550e8400-e29b-41d4-a716-446655440601",
    });
  });

  it("resolves a crash-window pending insert as succeeded when the deterministic remote event exists", async () => {
    const { lte } = mockPendingRows([auditRow]);
    mocks.getGoogleCalendarEventForConnection.mockResolvedValue({
      exists: true,
    });

    const result =
      await reconcilePendingGoogleCalendarInsertAuditsForAccessToken(
        "supabase-access-token",
        { now: () => new Date("2026-05-10T16:00:00.000Z") },
      );

    expect(lte).toHaveBeenCalledWith("created_at", "2026-05-10T15:00:00.000Z");
    expect(mocks.getGoogleCalendarEventForConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "lifeos550e8400e29b41d4a716446655440501",
      }),
    );
    expect(
      mocks.createCalendarBlockForProposalForAccessToken,
    ).toHaveBeenCalledWith(
      "supabase-access-token",
      proposal,
      "lifeos550e8400e29b41d4a716446655440501",
    );
    expect(
      mocks.updateExternalWriteEventResultForAccessToken,
    ).toHaveBeenCalledWith(
      "supabase-access-token",
      auditRow.id,
      expect.objectContaining({ resultStatus: "succeeded" }),
    );
    expect(result).toEqual({
      checked: 1,
      failed: 0,
      leftPending: 0,
      succeeded: 1,
    });
  });

  it("leaves stale pending rows pending when Google is unreachable", async () => {
    mockPendingRows([auditRow]);
    mocks.getGoogleCalendarEventForConnection.mockRejectedValue(
      new Error("Google Calendar event read failed."),
    );

    const result =
      await reconcilePendingGoogleCalendarInsertAuditsForAccessToken(
        "supabase-access-token",
        { now: () => new Date("2026-05-10T16:00:00.000Z") },
      );

    expect(
      mocks.updateExternalWriteEventResultForAccessToken,
    ).not.toHaveBeenCalled();
    expect(result.leftPending).toBe(1);
  });
});
