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
  recordGoogleCalendarPlacementForAccessToken: vi.fn(),
  finishGoogleCalendarApprovalForAccessToken: vi.fn(),
}));

vi.mock("@/lib/googleCalendar/server", () => ({
  getGoogleCalendarStoredConnectionForAccessToken:
    mocks.getGoogleCalendarStoredConnectionForAccessToken,
}));
vi.mock("@/lib/googleCalendar/events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/googleCalendar/events")>()),
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
  recordGoogleCalendarPlacementForAccessToken:
    mocks.recordGoogleCalendarPlacementForAccessToken,
}));
vi.mock("@/lib/supabase/server", () => ({
  requireSupabaseServerUser: mocks.requireSupabaseServerUser,
  requireSupabaseServiceRoleClient: mocks.requireSupabaseServiceRoleClient,
}));
vi.mock("./server", () => ({
  finishGoogleCalendarApprovalForAccessToken:
    mocks.finishGoogleCalendarApprovalForAccessToken,
  updateExternalWriteEventResultForAccessToken:
    mocks.updateExternalWriteEventResultForAccessToken,
}));

import { reconcilePendingGoogleCalendarInsertAuditsForAccessToken } from "./reconciliation";

const user = { id: "550e8400-e29b-41d4-a716-446655440001" };
const connection = {
  user_id: user.id,
  id: "550e8400-e29b-41d4-a716-446655440901",
  calendar_id: "primary",
  status: "connected",
  connected_at: "2026-05-09T00:00:00.000Z",
  credential_verified_at: "2026-05-09T00:00:00.000Z",
  encrypted_refresh_token: "synthetic-refresh",
};
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
  request_summary_json: {
    proposal_id: proposal.id,
    claim_task_id: proposal.task_id,
    claim_connection_id: connection.id,
    claim_connected_at: connection.connected_at,
    calendar_id: connection.calendar_id,
    proposed_start: proposal.proposed_start,
    proposed_end: proposal.proposed_end,
  },
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
      connection,
    });
    mocks.getTimeBlockProposalForAccessToken.mockResolvedValue(proposal);
    mocks.getCalendarBlockForProposalForAccessToken.mockResolvedValue(null);
    mocks.createCalendarBlockForProposalForAccessToken.mockResolvedValue({
      id: "550e8400-e29b-41d4-a716-446655440601",
    });
    mocks.finishGoogleCalendarApprovalForAccessToken.mockResolvedValue({
      block: { id: "550e8400-e29b-41d4-a716-446655440601" },
      proposal,
      task: null,
    });
  });

  it("resolves a crash-window pending insert as succeeded when the deterministic remote event exists", async () => {
    const { lte } = mockPendingRows([auditRow]);
    mocks.getGoogleCalendarEventForConnection.mockResolvedValue({
      exists: true,
      googleEventId: "lifeos550e8400e29b41d4a716446655440501",
      googleEventEtag: '"verified"',
      lifeosProposalId: proposal.id,
      status: "confirmed",
      eventSnapshot: {
        start: { dateTime: proposal.proposed_start },
        end: { dateTime: proposal.proposed_end },
      },
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
    // Healed with the same one-transaction placement the route uses
    // (calendar hunt #1/#7), so the task is scheduled too.
    expect(
      mocks.finishGoogleCalendarApprovalForAccessToken,
    ).toHaveBeenCalledWith(
      "supabase-access-token",
      expect.objectContaining({
        auditId: auditRow.id,
        proposalId: proposal.id,
        googleEventId: "lifeos550e8400e29b41d4a716446655440501",
        googleEventEtag: '"verified"',
      }),
    );
    expect(
      mocks.updateExternalWriteEventResultForAccessToken,
    ).not.toHaveBeenCalled();
    expect(result).toEqual({
      checked: 1,
      failed: 0,
      leftPending: 0,
      succeeded: 1,
    });
  });

  // Calendar hunt #7: a cancelled Google event is not an event that exists.
  it("does not count a cancelled remote event as a successful write", async () => {
    mockPendingRows([auditRow]);
    mocks.getGoogleCalendarEventForConnection.mockResolvedValue({
      exists: true,
      status: "cancelled",
    });

    const result =
      await reconcilePendingGoogleCalendarInsertAuditsForAccessToken(
        "supabase-access-token",
        { now: () => new Date("2026-05-10T16:00:00.000Z") },
      );

    expect(
      mocks.recordGoogleCalendarPlacementForAccessToken,
    ).not.toHaveBeenCalled();
    expect(
      mocks.updateExternalWriteEventResultForAccessToken,
    ).not.toHaveBeenCalled();
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.leftPending).toBe(1);
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

  it("does not release a crashed request from absence while its old POST could still arrive", async () => {
    mockPendingRows([auditRow]);
    mocks.getGoogleCalendarEventForConnection.mockResolvedValue({
      exists: false,
    });
    const result =
      await reconcilePendingGoogleCalendarInsertAuditsForAccessToken(
        "supabase-access-token",
        { now: () => new Date("2026-05-10T16:00:00.000Z") },
      );
    expect(result.leftPending).toBe(1);
    expect(result.failed).toBe(0);
    expect(
      mocks.updateExternalWriteEventResultForAccessToken,
    ).not.toHaveBeenCalled();
    expect(
      mocks.recordGoogleCalendarPlacementForAccessToken,
    ).not.toHaveBeenCalled();
  });

  it.each(["generation", "calendar", "unverified", "unknown", "null", "array"])(
    "never probes a pending attempt through %s origin",
    async (kind) => {
      mockPendingRows([
        {
          ...auditRow,
          request_summary_json:
            kind === "unknown"
              ? {}
              : kind === "null"
                ? null
                : kind === "array"
                  ? []
                  : auditRow.request_summary_json,
        },
      ]);
      mocks.getGoogleCalendarStoredConnectionForAccessToken.mockResolvedValue({
        connection: {
          ...connection,
          ...(kind === "generation"
            ? {
                connected_at: "2026-05-10T00:00:00.000Z",
                credential_verified_at: "2026-05-10T00:00:00.000Z",
              }
            : {}),
          ...(kind === "calendar" ? { calendar_id: "other" } : {}),
          ...(kind === "unverified" ? { credential_verified_at: null } : {}),
        },
      });
      mocks.getGoogleCalendarEventForConnection.mockResolvedValue({
        exists: false,
      });
      const result =
        await reconcilePendingGoogleCalendarInsertAuditsForAccessToken(
          "supabase-access-token",
        );
      expect(result.leftPending).toBe(1);
      expect(mocks.getGoogleCalendarEventForConnection).not.toHaveBeenCalled();
      expect(
        mocks.updateExternalWriteEventResultForAccessToken,
      ).not.toHaveBeenCalled();
    },
  );
});
