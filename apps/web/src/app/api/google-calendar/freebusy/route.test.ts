import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkGoogleCalendarFreeBusyForConnection: vi.fn(),
  getGoogleCalendarConfig: vi.fn(),
  getGoogleCalendarStoredConnectionForAccessToken: vi.fn(),
  getTimeBlockProposalForAccessToken: vi.fn(),
  requireSupabaseServerUser: vi.fn(),
  updateTimeBlockProposalConflictForAccessToken: vi.fn(),
}));

vi.mock("@/lib/googleCalendar/config", () => ({
  getGoogleCalendarConfig: mocks.getGoogleCalendarConfig,
}));

vi.mock("@/lib/googleCalendar/freebusy", () => ({
  checkGoogleCalendarFreeBusyForConnection:
    mocks.checkGoogleCalendarFreeBusyForConnection,
}));

vi.mock("@/lib/googleCalendar/server", () => ({
  getGoogleCalendarStoredConnectionForAccessToken:
    mocks.getGoogleCalendarStoredConnectionForAccessToken,
}));

vi.mock("@/lib/planning/server", () => ({
  getTimeBlockProposalForAccessToken: mocks.getTimeBlockProposalForAccessToken,
  updateTimeBlockProposalConflictForAccessToken:
    mocks.updateTimeBlockProposalConflictForAccessToken,
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

const proposal = {
  id: "550e8400-e29b-41d4-a716-446655440501",
  user_id: "550e8400-e29b-41d4-a716-446655440001",
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

describe("google-calendar freebusy route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getGoogleCalendarConfig.mockReturnValue({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost:3000/api/google-calendar/callback",
      tokenEncryptionKey: "token-encryption-key",
    });
  });

  it("blocks unauthenticated requests", async () => {
    const response = await POST(
      new Request("http://localhost/api/google-calendar/freebusy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          proposal_id: proposal.id,
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.ok).toBe(false);
  });

  it("handles an unconnected calendar state safely", async () => {
    mocks.requireSupabaseServerUser.mockResolvedValue({
      user: { id: proposal.user_id },
    });
    mocks.getGoogleCalendarStoredConnectionForAccessToken.mockResolvedValue({
      connection: null,
    });

    const response = await POST(
      new Request("http://localhost/api/google-calendar/freebusy", {
        method: "POST",
        headers: {
          Authorization: "Bearer supabase-access-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          proposal_id: proposal.id,
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/connect google calendar/i);
    expect(
      mocks.updateTimeBlockProposalConflictForAccessToken,
    ).not.toHaveBeenCalled();
  });

  it("stores a successful no-conflict result with minimal metadata", async () => {
    mocks.requireSupabaseServerUser.mockResolvedValue({
      user: { id: proposal.user_id },
    });
    mocks.getGoogleCalendarStoredConnectionForAccessToken.mockResolvedValue({
      connection: {
        calendar_id: "primary",
        status: "connected",
      },
    });
    mocks.getTimeBlockProposalForAccessToken.mockResolvedValue(proposal);
    mocks.checkGoogleCalendarFreeBusyForConnection.mockResolvedValue({
      checkedAt: "2026-05-10T15:30:00.000Z",
      hasConflict: false,
    });
    mocks.updateTimeBlockProposalConflictForAccessToken.mockResolvedValue({
      ...proposal,
      conflict_flag: false,
      conflict_details_json: {
        provider: "google_calendar",
        status: "checked",
        checked_at: "2026-05-10T15:30:00.000Z",
        has_conflict: false,
      },
    });

    const response = await POST(
      new Request("http://localhost/api/google-calendar/freebusy", {
        method: "POST",
        headers: {
          Authorization: "Bearer supabase-access-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          proposal_id: proposal.id,
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.has_conflict).toBe(false);
    expect(
      mocks.updateTimeBlockProposalConflictForAccessToken,
    ).toHaveBeenCalledWith(
      "supabase-access-token",
      proposal.id,
      expect.objectContaining({
        checked_at: "2026-05-10T15:30:00.000Z",
        has_conflict: false,
        provider: "google_calendar",
        status: "checked",
      }),
      false,
    );
  });

  it("stores a successful conflict result", async () => {
    mocks.requireSupabaseServerUser.mockResolvedValue({
      user: { id: proposal.user_id },
    });
    mocks.getGoogleCalendarStoredConnectionForAccessToken.mockResolvedValue({
      connection: {
        calendar_id: "primary",
        status: "connected",
      },
    });
    mocks.getTimeBlockProposalForAccessToken.mockResolvedValue(proposal);
    mocks.checkGoogleCalendarFreeBusyForConnection.mockResolvedValue({
      checkedAt: "2026-05-10T15:35:00.000Z",
      hasConflict: true,
    });
    mocks.updateTimeBlockProposalConflictForAccessToken.mockResolvedValue({
      ...proposal,
      conflict_flag: true,
      conflict_details_json: {
        provider: "google_calendar",
        status: "checked",
        checked_at: "2026-05-10T15:35:00.000Z",
        has_conflict: true,
      },
    });

    const response = await POST(
      new Request("http://localhost/api/google-calendar/freebusy", {
        method: "POST",
        headers: {
          Authorization: "Bearer supabase-access-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          proposal_id: proposal.id,
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.has_conflict).toBe(true);
  });

  it("preserves the local proposal when free/busy fails", async () => {
    mocks.requireSupabaseServerUser.mockResolvedValue({
      user: { id: proposal.user_id },
    });
    mocks.getGoogleCalendarStoredConnectionForAccessToken.mockResolvedValue({
      connection: {
        calendar_id: "primary",
        status: "connected",
      },
    });
    mocks.getTimeBlockProposalForAccessToken.mockResolvedValue(proposal);
    mocks.checkGoogleCalendarFreeBusyForConnection.mockRejectedValue(
      new Error("Google Calendar free/busy failed."),
    );

    const response = await POST(
      new Request("http://localhost/api/google-calendar/freebusy", {
        method: "POST",
        headers: {
          Authorization: "Bearer supabase-access-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          proposal_id: proposal.id,
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.ok).toBe(false);
    expect(
      mocks.updateTimeBlockProposalConflictForAccessToken,
    ).not.toHaveBeenCalled();
  });

  describe("error sanitization (#670)", () => {
    function freebusyRequest(body: unknown) {
      return new Request("http://localhost/api/google-calendar/freebusy", {
        method: "POST",
        headers: {
          Authorization: "Bearer supabase-access-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    }

    it("does not echo a raw data-layer error and logs it server-side", async () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      mocks.requireSupabaseServerUser.mockResolvedValue({
        user: { id: proposal.user_id },
      });
      mocks.getGoogleCalendarStoredConnectionForAccessToken.mockRejectedValue(
        new Error('relation "google_calendar_connections" does not exist'),
      );

      const response = await POST(
        freebusyRequest({ proposal_id: proposal.id }),
      );
      const body = await response.json();

      expect(response.status).toBe(502);
      expect(body).toEqual({
        ok: false,
        error: "Google Calendar conflict check failed.",
      });
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it("returns fixed sign-in copy on auth rejection", async () => {
      mocks.requireSupabaseServerUser.mockRejectedValue(
        authRejected("invalid claim: missing sub claim"),
      );

      const response = await POST(
        freebusyRequest({ proposal_id: proposal.id }),
      );
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error).toBe(
        "Sign in before checking Google Calendar conflicts.",
      );
    });

    it("returns a plain 400 for an invalid body instead of the zod issue dump", async () => {
      mocks.requireSupabaseServerUser.mockResolvedValue({
        user: { id: proposal.user_id },
      });

      const response = await POST(freebusyRequest({ proposal_id: "nope" }));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe(
        "Google Calendar conflict check request was invalid.",
      );
    });

    it("passes through the fixed Google OAuth provider message", async () => {
      mocks.requireSupabaseServerUser.mockResolvedValue({
        user: { id: proposal.user_id },
      });
      mocks.getGoogleCalendarStoredConnectionForAccessToken.mockResolvedValue({
        connection: { calendar_id: "primary", status: "connected" },
      });
      mocks.getTimeBlockProposalForAccessToken.mockResolvedValue(proposal);
      const providerError = new Error(
        "Google Calendar connection step did not complete.",
      );
      Object.assign(providerError, {
        name: "GoogleOAuthProviderError",
        code: "invalid_grant",
        description: "Token has been expired or revoked.",
        httpStatus: 400,
        phase: "refresh",
      });
      mocks.checkGoogleCalendarFreeBusyForConnection.mockRejectedValue(
        providerError,
      );

      const response = await POST(
        freebusyRequest({ proposal_id: proposal.id }),
      );
      const body = await response.json();

      expect(response.status).toBe(502);
      expect(body.error).toBe(
        "Google Calendar connection step did not complete.",
      );
    });
  });
});
