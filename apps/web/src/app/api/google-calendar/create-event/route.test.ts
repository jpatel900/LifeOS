import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  acknowledgeGoogleCalendarFirstWriteWarningForAccessToken: vi.fn(),
  createCalendarBlockForProposalForAccessToken: vi.fn(),
  createPendingExternalWriteEventForAccessToken: vi.fn(),
  getCalendarBlockForProposalForAccessToken: vi.fn(),
  getGoogleCalendarConfig: vi.fn(),
  getGoogleCalendarStoredConnectionForAccessToken: vi.fn(),
  getTaskForAccessToken: vi.fn(),
  getTimeBlockProposalForAccessToken: vi.fn(),
  insertGoogleCalendarEventForConnection: vi.fn(),
  markTimeBlockProposalAcceptedForAccessToken: vi.fn(),
  recordGoogleCalendarPlacementForAccessToken: vi.fn(),
  findGoogleBackedScheduledBlockForTaskForAccessToken: vi.fn(),
  requireSupabaseServerUser: vi.fn(),
  updateCalendarBlockGoogleEventForAccessToken: vi.fn(),
  updateExternalWriteEventResultForAccessToken: vi.fn(),
}));

vi.mock("@/lib/googleCalendar/config", () => ({
  getGoogleCalendarConfig: mocks.getGoogleCalendarConfig,
}));

vi.mock("@/lib/googleCalendar/server", () => ({
  acknowledgeGoogleCalendarFirstWriteWarningForAccessToken:
    mocks.acknowledgeGoogleCalendarFirstWriteWarningForAccessToken,
  getGoogleCalendarStoredConnectionForAccessToken:
    mocks.getGoogleCalendarStoredConnectionForAccessToken,
}));

vi.mock("@/lib/googleCalendar/events", () => ({
  insertGoogleCalendarEventForConnection:
    mocks.insertGoogleCalendarEventForConnection,
}));

vi.mock("@/lib/externalWrites/server", () => ({
  createPendingExternalWriteEventForAccessToken:
    mocks.createPendingExternalWriteEventForAccessToken,
  updateExternalWriteEventResultForAccessToken:
    mocks.updateExternalWriteEventResultForAccessToken,
}));

vi.mock("@/lib/planning/server", () => ({
  createCalendarBlockForProposalForAccessToken:
    mocks.createCalendarBlockForProposalForAccessToken,
  getCalendarBlockForProposalForAccessToken:
    mocks.getCalendarBlockForProposalForAccessToken,
  getTaskForAccessToken: mocks.getTaskForAccessToken,
  getTimeBlockProposalForAccessToken: mocks.getTimeBlockProposalForAccessToken,
  markTimeBlockProposalAcceptedForAccessToken:
    mocks.markTimeBlockProposalAcceptedForAccessToken,
  recordGoogleCalendarPlacementForAccessToken:
    mocks.recordGoogleCalendarPlacementForAccessToken,
  findGoogleBackedScheduledBlockForTaskForAccessToken:
    mocks.findGoogleBackedScheduledBlockForTaskForAccessToken,
  updateCalendarBlockGoogleEventForAccessToken:
    mocks.updateCalendarBlockGoogleEventForAccessToken,
}));

vi.mock("@/lib/supabase/server", () => ({
  requireSupabaseServerUser: mocks.requireSupabaseServerUser,
}));

import { POST } from "./route";

const user = { id: "550e8400-e29b-41d4-a716-446655440001" };
const proposal = {
  id: "550e8400-e29b-41d4-a716-446655440501",
  user_id: user.id,
  area_id: "550e8400-e29b-41d4-a716-446655440101",
  task_id: "550e8400-e29b-41d4-a716-446655440301",
  proposed_start: "2026-05-10T16:00:00.000Z",
  proposed_end: "2026-05-10T17:00:00.000Z",
  rationale_json: {
    note: "Local planning proposal created from task duration.",
  },
  conflict_flag: false,
  conflict_details_json: null,
  status: "proposed" as const,
  created_at: "2026-05-10T15:00:00.000Z",
};
const block = {
  id: "550e8400-e29b-41d4-a716-446655440601",
  user_id: user.id,
  area_id: proposal.area_id,
  proposal_id: proposal.id,
  task_id: proposal.task_id,
  google_event_id: "google-event-1",
  start_at: proposal.proposed_start,
  end_at: proposal.proposed_end,
  status: "scheduled" as const,
  created_at: "2026-05-10T15:30:00.000Z",
  updated_at: "2026-05-10T15:30:00.000Z",
};
const connection = {
  id: "550e8400-e29b-41d4-a716-446655440901",
  user_id: user.id,
  provider: "google_calendar" as const,
  calendar_id: "primary",
  encrypted_access_token: "encrypted-access",
  encrypted_refresh_token: "encrypted-refresh",
  granted_scopes_json: [
    "https://www.googleapis.com/auth/calendar.freebusy",
    "https://www.googleapis.com/auth/calendar.events.owned",
  ],
  status: "connected" as const,
  first_write_warning_acknowledged_at: "2026-05-09T00:00:00.000Z",
  connected_at: "2026-05-09T00:00:00.000Z",
  disconnected_at: null,
  token_expires_at: "2026-05-09T01:00:00.000Z",
  token_type: "Bearer",
  created_at: "2026-05-09T00:00:00.000Z",
  updated_at: "2026-05-09T00:00:00.000Z",
};

function request(
  body: Record<string, unknown>,
  token = "supabase-access-token",
) {
  return new Request("http://localhost/api/google-calendar/create-event", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("google-calendar create-event route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getGoogleCalendarConfig.mockReturnValue({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost:3000/api/google-calendar/callback",
      tokenEncryptionKey: "token-encryption-key",
    });
    mocks.requireSupabaseServerUser.mockResolvedValue({ user });
    mocks.getGoogleCalendarStoredConnectionForAccessToken.mockResolvedValue({
      connection,
    });
    mocks.getTimeBlockProposalForAccessToken.mockResolvedValue(proposal);
    mocks.getCalendarBlockForProposalForAccessToken.mockResolvedValue(null);
    mocks.getTaskForAccessToken.mockResolvedValue({
      id: proposal.task_id,
      title: "Call dentist tomorrow",
    });
    mocks.createPendingExternalWriteEventForAccessToken.mockResolvedValue({
      id: "550e8400-e29b-41d4-a716-446655440701",
    });
    mocks.insertGoogleCalendarEventForConnection.mockResolvedValue({
      googleEventId: "google-event-1",
    });
    mocks.createCalendarBlockForProposalForAccessToken.mockResolvedValue(block);
    mocks.markTimeBlockProposalAcceptedForAccessToken.mockResolvedValue({
      ...proposal,
      status: "accepted",
    });
    mocks.updateExternalWriteEventResultForAccessToken.mockResolvedValue({
      id: "550e8400-e29b-41d4-a716-446655440701",
      result_status: "succeeded",
    });
    mocks.findGoogleBackedScheduledBlockForTaskForAccessToken.mockResolvedValue(
      null,
    );
    mocks.recordGoogleCalendarPlacementForAccessToken.mockResolvedValue({
      proposal: { ...proposal, status: "accepted" },
      block,
      task: { id: proposal.task_id, status: "scheduled" },
    });
  });

  it("requires explicit approval", async () => {
    const response = await POST(
      request({
        proposal_id: proposal.id,
        approved: false,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(mocks.insertGoogleCalendarEventForConnection).not.toHaveBeenCalled();
  });

  it("requires first-write warning acknowledgement before the first write", async () => {
    mocks.getGoogleCalendarStoredConnectionForAccessToken.mockResolvedValue({
      connection: {
        ...connection,
        first_write_warning_acknowledged_at: null,
      },
    });

    const response = await POST(
      request({
        proposal_id: proposal.id,
        approved: true,
        approved_start: proposal.proposed_start,
        approved_end: proposal.proposed_end,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(428);
    expect(body.first_write_warning_required).toBe(true);
    expect(mocks.insertGoogleCalendarEventForConnection).not.toHaveBeenCalled();
  });

  it("inserts an approved event, stores google_event_id, and logs success", async () => {
    const response = await POST(
      request({
        proposal_id: proposal.id,
        approved: true,
        timezone: "America/Toronto",
        approved_start: proposal.proposed_start,
        approved_end: proposal.proposed_end,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.google_event_id).toBe("google-event-1");
    expect(mocks.insertGoogleCalendarEventForConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        proposedEnd: proposal.proposed_end,
        proposedStart: proposal.proposed_start,
        title: "Call dentist tomorrow",
        timezone: "America/Toronto",
      }),
    );
    // Calendar hunt #1: the account side of an approved event lands in ONE
    // transactional call, with the same semantics as placing a block: the
    // proposal is accepted, sibling proposals are superseded, and the task is
    // scheduled.
    expect(
      mocks.recordGoogleCalendarPlacementForAccessToken,
    ).toHaveBeenCalledWith(
      "supabase-access-token",
      proposal.id,
      "google-event-1",
    );
    expect(body.task).toEqual(expect.objectContaining({ status: "scheduled" }));
    expect(
      mocks.createCalendarBlockForProposalForAccessToken,
    ).not.toHaveBeenCalled();
    expect(
      mocks.markTimeBlockProposalAcceptedForAccessToken,
    ).not.toHaveBeenCalled();
    expect(
      mocks.updateExternalWriteEventResultForAccessToken,
    ).toHaveBeenCalledWith(
      "supabase-access-token",
      "550e8400-e29b-41d4-a716-446655440701",
      expect.objectContaining({
        errorMessage: null,
        resultStatus: "succeeded",
      }),
    );
  });

  it("logs a failed external write and preserves the local proposal", async () => {
    mocks.insertGoogleCalendarEventForConnection.mockRejectedValue(
      new Error("Google Calendar event insert failed."),
    );

    const response = await POST(
      request({
        proposal_id: proposal.id,
        approved: true,
        approved_start: proposal.proposed_start,
        approved_end: proposal.proposed_end,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.ok).toBe(false);
    expect(body.error).toBe(
      "Google Calendar write failed. Local proposal data is unchanged. Review connection status and retry.",
    );
    expect(
      mocks.recordGoogleCalendarPlacementForAccessToken,
    ).not.toHaveBeenCalled();
    expect(
      mocks.updateExternalWriteEventResultForAccessToken,
    ).toHaveBeenCalledWith(
      "supabase-access-token",
      "550e8400-e29b-41d4-a716-446655440701",
      expect.objectContaining({
        errorMessage:
          "Google Calendar write failed. Local proposal data is unchanged. Review connection status and retry.",
        resultStatus: "failed",
      }),
    );
  });

  // Calendar hunt #6: once Google has the event, the write SUCCEEDED. A
  // later account failure must not be logged as a failed write or told to the
  // person as "Local proposal data is unchanged" while the event exists.
  it("says the event exists when Google insert succeeds but the account record fails", async () => {
    mocks.recordGoogleCalendarPlacementForAccessToken.mockRejectedValue(
      new Error("calendar_blocks insert failed."),
    );

    const response = await POST(
      request({
        proposal_id: proposal.id,
        approved: true,
        approved_start: proposal.proposed_start,
        approved_end: proposal.proposed_end,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.ok).toBe(false);
    expect(body.google_event_created).toBe(true);
    expect(body.error).toContain("is on your Google Calendar");
    expect(body.error).not.toContain("unchanged");
    expect(mocks.insertGoogleCalendarEventForConnection).toHaveBeenCalled();
    expect(
      mocks.updateExternalWriteEventResultForAccessToken,
    ).toHaveBeenCalledWith(
      "supabase-access-token",
      "550e8400-e29b-41d4-a716-446655440701",
      expect.objectContaining({
        resultStatus: "succeeded",
        resultSummary: expect.objectContaining({
          google_event_id_stored: false,
          provider_event_id_present: true,
          follow_up: "account_record_failed",
        }),
      }),
    );
    expect(
      mocks.updateExternalWriteEventResultForAccessToken,
    ).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ resultStatus: "failed" }),
    );
  });

  it("still reports success when only the audit follow-up throws after everything landed", async () => {
    mocks.updateExternalWriteEventResultForAccessToken.mockRejectedValueOnce(
      new Error("incident rule failed"),
    );

    const response = await POST(
      request({
        proposal_id: proposal.id,
        approved: true,
        approved_start: proposal.proposed_start,
        approved_end: proposal.proposed_end,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.google_event_id).toBe("google-event-1");
    expect(
      mocks.updateExternalWriteEventResultForAccessToken,
    ).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ resultStatus: "failed" }),
    );
  });

  it("blocks duplicate event creation when a google_event_id already exists", async () => {
    mocks.getCalendarBlockForProposalForAccessToken.mockResolvedValue(block);

    const response = await POST(
      request({
        proposal_id: proposal.id,
        approved: true,
        approved_start: proposal.proposed_start,
        approved_end: proposal.proposed_end,
      }),
    );

    expect(response.status).toBe(409);
    expect(
      mocks.createPendingExternalWriteEventForAccessToken,
    ).not.toHaveBeenCalled();
    expect(mocks.insertGoogleCalendarEventForConnection).not.toHaveBeenCalled();
  });

  it("refuses a second Google event for a task that already has one (calendar hunt #1)", async () => {
    mocks.findGoogleBackedScheduledBlockForTaskForAccessToken.mockResolvedValue(
      {
        ...block,
        id: "550e8400-e29b-41d4-a716-446655440602",
        proposal_id: "550e8400-e29b-41d4-a716-446655440502",
      },
    );

    const response = await POST(
      request({
        proposal_id: proposal.id,
        approved: true,
        approved_start: proposal.proposed_start,
        approved_end: proposal.proposed_end,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("already has a Google Calendar event");
    expect(
      mocks.findGoogleBackedScheduledBlockForTaskForAccessToken,
    ).toHaveBeenCalledWith("supabase-access-token", proposal.task_id);
    expect(
      mocks.createPendingExternalWriteEventForAccessToken,
    ).not.toHaveBeenCalled();
    expect(mocks.insertGoogleCalendarEventForConnection).not.toHaveBeenCalled();
  });

  it("refuses when the approved time is not the time the account holds (calendar hunt #4)", async () => {
    const response = await POST(
      request({
        proposal_id: proposal.id,
        approved: true,
        // The person moved it later on this device; the account never got it.
        approved_start: "2026-05-10T18:00:00.000Z",
        approved_end: "2026-05-10T19:00:00.000Z",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("time you approved");
    expect(
      mocks.createPendingExternalWriteEventForAccessToken,
    ).not.toHaveBeenCalled();
    expect(mocks.insertGoogleCalendarEventForConnection).not.toHaveBeenCalled();
  });

  it("accepts the same instant written with a numeric offset", async () => {
    const response = await POST(
      request({
        proposal_id: proposal.id,
        approved: true,
        approved_start: "2026-05-10T12:00:00.000-04:00",
        approved_end: "2026-05-10T13:00:00.000-04:00",
      }),
    );

    expect(response.status).toBe(200);
  });

  it("blocks unauthenticated requests", async () => {
    const response = await POST(
      new Request("http://localhost/api/google-calendar/create-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposal_id: proposal.id,
          approved: true,
        }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("handles unconnected calendar state safely", async () => {
    mocks.getGoogleCalendarStoredConnectionForAccessToken.mockResolvedValue({
      connection: null,
    });

    const response = await POST(
      request({
        proposal_id: proposal.id,
        approved: true,
        approved_start: proposal.proposed_start,
        approved_end: proposal.proposed_end,
      }),
    );

    expect(response.status).toBe(409);
    expect(mocks.insertGoogleCalendarEventForConnection).not.toHaveBeenCalled();
  });
});
