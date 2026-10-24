import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  acknowledgeGoogleCalendarFirstWriteWarningForAccessToken: vi.fn(),
  createCalendarBlockForProposalForAccessToken: vi.fn(),
  createPendingExternalWriteEventForAccessToken: vi.fn(),
  claimGoogleCalendarApprovalForAccessToken: vi.fn(),
  getCalendarBlockForProposalForAccessToken: vi.fn(),
  getGoogleCalendarConfig: vi.fn(),
  getGoogleCalendarStoredConnectionForAccessToken: vi.fn(),
  getTaskForAccessToken: vi.fn(),
  getTimeBlockProposalForAccessToken: vi.fn(),
  insertGoogleCalendarEventForConnection: vi.fn(),
  resolveGoogleCalendarWriteAccessToken: vi.fn(),
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
  resolveGoogleCalendarWriteAccessToken:
    mocks.resolveGoogleCalendarWriteAccessToken,
}));

vi.mock("@/lib/externalWrites/server", () => ({
  claimGoogleCalendarApprovalForAccessToken:
    mocks.claimGoogleCalendarApprovalForAccessToken,
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

function authRejected(message: string) {
  const error = new Error(message);
  error.name = "SupabaseAuthRejectedError";
  return error;
}

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
    vi.resetAllMocks();
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
    mocks.claimGoogleCalendarApprovalForAccessToken.mockResolvedValue({
      id: "550e8400-e29b-41d4-a716-446655440701",
    });
    mocks.insertGoogleCalendarEventForConnection.mockResolvedValue({
      googleEventId: "google-event-1",
    });
    mocks.resolveGoogleCalendarWriteAccessToken.mockResolvedValue(
      "google-access-token",
    );
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
    expect(
      mocks.claimGoogleCalendarApprovalForAccessToken,
    ).not.toHaveBeenCalled();
    expect(mocks.insertGoogleCalendarEventForConnection).not.toHaveBeenCalled();
  });

  it("allows only one sibling past the durable claim when both prechecks see no block", async () => {
    const sibling = {
      ...proposal,
      id: "550e8400-e29b-41d4-a716-446655440502",
      proposed_start: "2026-05-10T18:00:00.000Z",
      proposed_end: "2026-05-10T19:00:00.000Z",
    };
    mocks.getTimeBlockProposalForAccessToken.mockImplementation(
      async (_token, id) => (id === sibling.id ? sibling : proposal),
    );
    let releasePrechecks!: () => void;
    const bothPrechecked = new Promise<void>((resolve) => {
      releasePrechecks = resolve;
    });
    let prechecks = 0;
    mocks.findGoogleBackedScheduledBlockForTaskForAccessToken.mockImplementation(
      async () => {
        if (++prechecks === 2) releasePrechecks();
        await bothPrechecked;
        return null;
      },
    );
    let winner: string | null = null;
    mocks.claimGoogleCalendarApprovalForAccessToken.mockImplementation(
      async (_token, row) => {
        if (winner && winner !== row.proposalId) {
          throw Object.assign(new Error("Calendar approval conflict"), {
            code: "CALENDAR_APPROVAL_CONFLICT",
          });
        }
        winner = row.proposalId;
        return { id: "550e8400-e29b-41d4-a716-446655440701" };
      },
    );
    const approve = (p: typeof proposal) =>
      POST(
        request({
          proposal_id: p.id,
          approved: true,
          approved_start: p.proposed_start,
          approved_end: p.proposed_end,
        }),
      );
    const responses = await Promise.all([approve(proposal), approve(sibling)]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(mocks.insertGoogleCalendarEventForConnection).toHaveBeenCalledTimes(
      1,
    );
    expect(
      mocks.recordGoogleCalendarPlacementForAccessToken,
    ).toHaveBeenCalledTimes(1);
    expect(mocks.insertGoogleCalendarEventForConnection).toHaveBeenCalledWith(
      expect.objectContaining({ proposalId: winner }),
    );
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
    expect(
      mocks.claimGoogleCalendarApprovalForAccessToken,
    ).not.toHaveBeenCalled();
    expect(mocks.insertGoogleCalendarEventForConnection).not.toHaveBeenCalled();
  });

  it("fails closed before Google if the durable claim cannot be saved", async () => {
    mocks.claimGoogleCalendarApprovalForAccessToken.mockRejectedValue(
      new Error("database unavailable"),
    );
    const response = await POST(
      request({
        proposal_id: proposal.id,
        approved: true,
        approved_start: proposal.proposed_start,
        approved_end: proposal.proposed_end,
      }),
    );
    expect(response.status).toBe(502);
    expect(mocks.insertGoogleCalendarEventForConnection).not.toHaveBeenCalled();
    expect(
      mocks.updateExternalWriteEventResultForAccessToken,
    ).not.toHaveBeenCalled();
  });

  // Review fix: a Google sign-in that cannot be refreshed means no request
  // reached Google. Reserving the approval first would keep the task blocked
  // after the person reconnects (a new connection generation), with nothing
  // on their calendar to cancel.
  it("does not reserve the approval when Google access cannot be refreshed", async () => {
    mocks.resolveGoogleCalendarWriteAccessToken.mockRejectedValue(
      new Error("Google Calendar token refresh failed."),
    );
    const response = await POST(
      request({
        proposal_id: proposal.id,
        approved: true,
        approved_start: proposal.proposed_start,
        approved_end: proposal.proposed_end,
      }),
    );
    expect(response.status).toBe(502);
    expect(
      mocks.claimGoogleCalendarApprovalForAccessToken,
    ).not.toHaveBeenCalled();
    expect(mocks.insertGoogleCalendarEventForConnection).not.toHaveBeenCalled();
    expect(
      mocks.updateExternalWriteEventResultForAccessToken,
    ).not.toHaveBeenCalled();
  });

  it("sends the access token resolved before the claim to the Google insert", async () => {
    const response = await POST(
      request({
        proposal_id: proposal.id,
        approved: true,
        approved_start: proposal.proposed_start,
        approved_end: proposal.proposed_end,
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.resolveGoogleCalendarWriteAccessToken).toHaveBeenCalledWith({
      connection,
      supabaseAccessToken: "supabase-access-token",
    });
    expect(
      mocks.resolveGoogleCalendarWriteAccessToken.mock.invocationCallOrder[0],
    ).toBeLessThan(
      mocks.claimGoogleCalendarApprovalForAccessToken.mock
        .invocationCallOrder[0]!,
    );
    expect(mocks.insertGoogleCalendarEventForConnection).toHaveBeenCalledWith(
      expect.objectContaining({ providerAccessToken: "google-access-token" }),
    );
  });

  it.each(["provider timeout", "placement failure"])(
    "keeps siblings blocked after %s and lets the winning proposal retry",
    async (failure) => {
      const sibling = {
        ...proposal,
        id: "550e8400-e29b-41d4-a716-446655440502",
      };
      mocks.getTimeBlockProposalForAccessToken.mockImplementation(
        async (_token, id) => (id === sibling.id ? sibling : proposal),
      );
      let winner: string | null = null;
      mocks.claimGoogleCalendarApprovalForAccessToken.mockImplementation(
        async (_token, row) => {
          if (winner && winner !== row.proposalId) {
            throw Object.assign(new Error("Calendar approval conflict"), {
              code: "CALENDAR_APPROVAL_CONFLICT",
            });
          }
          winner = row.proposalId;
          return { id: "550e8400-e29b-41d4-a716-446655440701" };
        },
      );
      if (failure === "provider timeout") {
        mocks.insertGoogleCalendarEventForConnection.mockRejectedValueOnce(
          new Error("timeout after possible insert"),
        );
      } else {
        mocks.recordGoogleCalendarPlacementForAccessToken.mockRejectedValueOnce(
          new Error("account unavailable"),
        );
      }
      const approve = (id: string) =>
        POST(
          request({
            proposal_id: id,
            approved: true,
            approved_start: proposal.proposed_start,
            approved_end: proposal.proposed_end,
          }),
        );
      expect((await approve(proposal.id)).status).toBe(502);
      expect((await approve(sibling.id)).status).toBe(409);
      expect((await approve(proposal.id)).status).toBe(200);
      expect(
        mocks.insertGoogleCalendarEventForConnection,
      ).toHaveBeenCalledTimes(2);
      for (const [params] of mocks.insertGoogleCalendarEventForConnection.mock
        .calls) {
        expect(params.proposalId).toBe(proposal.id);
      }
    },
  );

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
    expect(
      mocks.claimGoogleCalendarApprovalForAccessToken,
    ).toHaveBeenCalledWith("supabase-access-token", {
      userId: user.id,
      proposalId: proposal.id,
      taskId: proposal.task_id,
      proposedStart: proposal.proposed_start,
      proposedEnd: proposal.proposed_end,
      connectionId: connection.id,
      connectedAt: connection.connected_at,
      calendarId: connection.calendar_id,
      requestSummary: expect.objectContaining({
        proposal_id: proposal.id,
        proposed_start: proposal.proposed_start,
        proposed_end: proposal.proposed_end,
        calendar_id: connection.calendar_id,
        first_write_warning_acknowledged: true,
      }),
    });
    expect(
      mocks.claimGoogleCalendarApprovalForAccessToken.mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      mocks.insertGoogleCalendarEventForConnection.mock.invocationCallOrder[0]!,
    );
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
      mocks.claimGoogleCalendarApprovalForAccessToken,
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
      mocks.claimGoogleCalendarApprovalForAccessToken,
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
      mocks.claimGoogleCalendarApprovalForAccessToken,
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

  // Calendar hunt #8 (owner option B): a block put on the hour rail is an
  // ACCEPTED proposal that already has a block with no Google event. It goes
  // through the same explicit approval and the same transactional record.
  it("creates the Google event for an accepted rail block that has no event yet", async () => {
    mocks.getTimeBlockProposalForAccessToken.mockResolvedValue({
      ...proposal,
      status: "accepted",
    });
    mocks.getCalendarBlockForProposalForAccessToken.mockResolvedValue({
      ...block,
      google_event_id: null,
    });

    const response = await POST(
      request({
        proposal_id: proposal.id,
        approved: true,
        approved_start: proposal.proposed_start,
        approved_end: proposal.proposed_end,
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.insertGoogleCalendarEventForConnection).toHaveBeenCalled();
    expect(
      mocks.recordGoogleCalendarPlacementForAccessToken,
    ).toHaveBeenCalledWith(
      "supabase-access-token",
      proposal.id,
      "google-event-1",
    );
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
    expect(
      mocks.claimGoogleCalendarApprovalForAccessToken,
    ).not.toHaveBeenCalled();
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

  it("logs an unexpected failure server-side without echoing it (#670)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getTaskForAccessToken.mockRejectedValue(
      new Error("permission denied for table tasks"),
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
    expect(body.error).toBe(
      "Google Calendar write failed. Local proposal data is unchanged. Review connection status and retry.",
    );
    expect(spy).toHaveBeenCalledWith(
      "google-calendar/create-event failed:",
      expect.objectContaining({ message: "permission denied for table tasks" }),
    );
    spy.mockRestore();
  });

  it("returns fixed sign-in copy for a typed auth rejection (#670)", async () => {
    mocks.requireSupabaseServerUser.mockRejectedValue(
      authRejected("invalid claim: missing sub claim"),
    );

    const response = await POST(
      request({ proposal_id: proposal.id, approved: true }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Sign in before creating Google Calendar events.");
  });
});
