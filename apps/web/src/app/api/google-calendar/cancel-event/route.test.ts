import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createPendingExternalWriteEventForAccessToken: vi.fn(),
  deleteGoogleCalendarEventForConnection: vi.fn(),
  getCalendarBlockForAccessToken: vi.fn(),
  getGoogleCalendarConfig: vi.fn(),
  getGoogleCalendarEventForConnection: vi.fn(),
  getGoogleCalendarStoredConnectionForAccessToken: vi.fn(),
  markCalendarBlockCancelledForAccessToken: vi.fn(),
  requireSupabaseServerUser: vi.fn(),
  updateExternalWriteEventResultForAccessToken: vi.fn(),
}));

vi.mock("@/lib/googleCalendar/config", () => ({
  getGoogleCalendarConfig: mocks.getGoogleCalendarConfig,
}));

vi.mock("@/lib/googleCalendar/server", () => ({
  getGoogleCalendarStoredConnectionForAccessToken:
    mocks.getGoogleCalendarStoredConnectionForAccessToken,
}));

vi.mock("@/lib/googleCalendar/events", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/googleCalendar/events")>();
  return {
    ...actual,
    deleteGoogleCalendarEventForConnection:
      mocks.deleteGoogleCalendarEventForConnection,
    getGoogleCalendarEventForConnection:
      mocks.getGoogleCalendarEventForConnection,
  };
});

vi.mock("@/lib/externalWrites/server", () => ({
  createPendingExternalWriteEventForAccessToken:
    mocks.createPendingExternalWriteEventForAccessToken,
  updateExternalWriteEventResultForAccessToken:
    mocks.updateExternalWriteEventResultForAccessToken,
}));

vi.mock("@/lib/planning/server", () => ({
  getCalendarBlockForAccessToken: mocks.getCalendarBlockForAccessToken,
  markCalendarBlockCancelledForAccessToken:
    mocks.markCalendarBlockCancelledForAccessToken,
}));

vi.mock("@/lib/supabase/server", () => ({
  requireSupabaseServerUser: mocks.requireSupabaseServerUser,
}));

import {
  GoogleCalendarEventDriftError,
  GoogleCalendarMissingEtagError,
} from "@/lib/googleCalendar/events";
import { POST } from "./route";

const user = { id: "550e8400-e29b-41d4-a716-446655440001" };
const proposalId = "550e8400-e29b-41d4-a716-446655440501";
const ownedGoogleEventId = "lifeos550e8400e29b41d4a716446655440501";
const block = {
  id: "550e8400-e29b-41d4-a716-446655440601",
  user_id: user.id,
  area_id: "550e8400-e29b-41d4-a716-446655440101",
  proposal_id: proposalId,
  task_id: "550e8400-e29b-41d4-a716-446655440301",
  google_event_id: ownedGoogleEventId,
  start_at: "2026-05-10T16:00:00.000Z",
  end_at: "2026-05-10T17:00:00.000Z",
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
const eventRead = {
  exists: true,
  googleEventId: ownedGoogleEventId,
  googleEventEtag: '"etag-1"',
  googleEventStatus: "confirmed",
  lifeosProposalId: proposalId,
  eventSnapshot: {
    id: ownedGoogleEventId,
    etag: '"etag-1"',
    summary: "Call dentist tomorrow",
    extendedProperties: { private: { lifeos_proposal_id: proposalId } },
  },
};

function request(
  body: Record<string, unknown>,
  token = "supabase-access-token",
) {
  return new Request("http://localhost/api/google-calendar/cancel-event", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("google-calendar cancel-event route", () => {
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
    mocks.getCalendarBlockForAccessToken.mockResolvedValue(block);
    mocks.createPendingExternalWriteEventForAccessToken.mockResolvedValue({
      id: "550e8400-e29b-41d4-a716-446655440701",
    });
    mocks.getGoogleCalendarEventForConnection.mockResolvedValue(eventRead);
    mocks.deleteGoogleCalendarEventForConnection.mockResolvedValue({
      status: "deleted",
    });
    mocks.markCalendarBlockCancelledForAccessToken.mockResolvedValue({
      ...block,
      status: "cancelled",
    });
    mocks.updateExternalWriteEventResultForAccessToken.mockResolvedValue({
      id: "550e8400-e29b-41d4-a716-446655440701",
      result_status: "succeeded",
    });
  });

  it("requires explicit approval", async () => {
    const response = await POST(
      request({
        calendar_block_id: block.id,
        approved: false,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(mocks.deleteGoogleCalendarEventForConnection).not.toHaveBeenCalled();
  });

  it("cancels an owned event with a before-image and drift-checked delete", async () => {
    const response = await POST(
      request({
        calendar_block_id: block.id,
        approved: true,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(
      mocks.createPendingExternalWriteEventForAccessToken,
    ).toHaveBeenCalledWith(
      "supabase-access-token",
      expect.objectContaining({
        requestSummary: expect.objectContaining({
          google_event_before_image: eventRead.eventSnapshot,
          google_event_etag: '"etag-1"',
          google_event_status: "confirmed",
        }),
      }),
    );
    expect(
      mocks.createPendingExternalWriteEventForAccessToken.mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      mocks.deleteGoogleCalendarEventForConnection.mock.invocationCallOrder[0],
    );
    expect(mocks.deleteGoogleCalendarEventForConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: ownedGoogleEventId,
        expectedEtag: '"etag-1"',
      }),
    );
    expect(mocks.markCalendarBlockCancelledForAccessToken).toHaveBeenCalledWith(
      "supabase-access-token",
      block.id,
    );
    expect(
      mocks.updateExternalWriteEventResultForAccessToken,
    ).toHaveBeenCalledWith(
      "supabase-access-token",
      "550e8400-e29b-41d4-a716-446655440701",
      expect.objectContaining({
        errorMessage: null,
        resultStatus: "succeeded",
        resultSummary: expect.objectContaining({
          google_event_etag: '"etag-1"',
          google_event_status: "confirmed",
          provenance_marker_matched: true,
        }),
      }),
    );
  });

  it("refuses to cancel events that LifeOS did not create", async () => {
    mocks.getCalendarBlockForAccessToken.mockResolvedValue({
      ...block,
      google_event_id: "someone-elses-event",
    });

    const response = await POST(
      request({
        calendar_block_id: block.id,
        approved: true,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("created by LifeOS");
    expect(
      mocks.createPendingExternalWriteEventForAccessToken,
    ).not.toHaveBeenCalled();
    expect(mocks.deleteGoogleCalendarEventForConnection).not.toHaveBeenCalled();
  });

  it("aborts when the provenance marker does not match the block", async () => {
    mocks.getGoogleCalendarEventForConnection.mockResolvedValue({
      ...eventRead,
      lifeosProposalId: "550e8400-e29b-41d4-a716-446655440999",
    });

    const response = await POST(
      request({
        calendar_block_id: block.id,
        approved: true,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("provenance marker");
    expect(mocks.deleteGoogleCalendarEventForConnection).not.toHaveBeenCalled();
    expect(
      mocks.markCalendarBlockCancelledForAccessToken,
    ).not.toHaveBeenCalled();
    expect(
      mocks.updateExternalWriteEventResultForAccessToken,
    ).toHaveBeenCalledWith(
      "supabase-access-token",
      "550e8400-e29b-41d4-a716-446655440701",
      expect.objectContaining({
        resultStatus: "failed",
      }),
    );
  });

  it("aborts on etag drift and asks for re-approval", async () => {
    mocks.deleteGoogleCalendarEventForConnection.mockRejectedValue(
      new GoogleCalendarEventDriftError(),
    );

    const response = await POST(
      request({
        calendar_block_id: block.id,
        approved: true,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("approve again");
    expect(
      mocks.markCalendarBlockCancelledForAccessToken,
    ).not.toHaveBeenCalled();
    expect(
      mocks.updateExternalWriteEventResultForAccessToken,
    ).toHaveBeenCalledWith(
      "supabase-access-token",
      "550e8400-e29b-41d4-a716-446655440701",
      expect.objectContaining({
        resultStatus: "failed",
      }),
    );
  });

  it("treats an already-deleted event as a safe local cancel", async () => {
    mocks.getGoogleCalendarEventForConnection.mockResolvedValue({
      exists: false,
      googleEventId: ownedGoogleEventId,
      googleEventEtag: null,
      lifeosProposalId: null,
      googleEventStatus: null,
      eventSnapshot: null,
    });

    const response = await POST(
      request({
        calendar_block_id: block.id,
        approved: true,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.event_already_gone).toBe(true);
    expect(mocks.deleteGoogleCalendarEventForConnection).not.toHaveBeenCalled();
    expect(mocks.markCalendarBlockCancelledForAccessToken).toHaveBeenCalledWith(
      "supabase-access-token",
      block.id,
    );
  });

  it("treats a readable cancelled Google tombstone as terminal without resurrection", async () => {
    mocks.getGoogleCalendarEventForConnection.mockResolvedValue({
      ...eventRead,
      googleEventStatus: "cancelled",
      eventSnapshot: {
        ...eventRead.eventSnapshot,
        status: "cancelled",
        etag: '"cancelled-etag"',
      },
    });

    const response = await POST(
      request({
        calendar_block_id: block.id,
        approved: true,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.event_already_gone).toBe(true);
    expect(mocks.deleteGoogleCalendarEventForConnection).not.toHaveBeenCalled();
    expect(mocks.markCalendarBlockCancelledForAccessToken).toHaveBeenCalledWith(
      "supabase-access-token",
      block.id,
    );
  });

  it("fails closed when the fetched event has no etag", async () => {
    mocks.getGoogleCalendarEventForConnection.mockResolvedValue({
      ...eventRead,
      googleEventEtag: null,
    });
    mocks.deleteGoogleCalendarEventForConnection.mockRejectedValue(
      new GoogleCalendarMissingEtagError(),
    );

    const response = await POST(
      request({
        calendar_block_id: block.id,
        approved: true,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("requires a live event etag");
    expect(
      mocks.markCalendarBlockCancelledForAccessToken,
    ).not.toHaveBeenCalled();
  });

  it("blocks cancelling a block that is already cancelled", async () => {
    mocks.getCalendarBlockForAccessToken.mockResolvedValue({
      ...block,
      status: "cancelled",
    });

    const response = await POST(
      request({
        calendar_block_id: block.id,
        approved: true,
      }),
    );

    expect(response.status).toBe(409);
    expect(
      mocks.createPendingExternalWriteEventForAccessToken,
    ).not.toHaveBeenCalled();
    expect(mocks.deleteGoogleCalendarEventForConnection).not.toHaveBeenCalled();
  });

  it("logs a failed external write and preserves the local block", async () => {
    mocks.deleteGoogleCalendarEventForConnection.mockRejectedValue(
      new Error("Google Calendar event delete failed."),
    );

    const response = await POST(
      request({
        calendar_block_id: block.id,
        approved: true,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.ok).toBe(false);
    expect(
      mocks.markCalendarBlockCancelledForAccessToken,
    ).not.toHaveBeenCalled();
    expect(
      mocks.updateExternalWriteEventResultForAccessToken,
    ).toHaveBeenCalledWith(
      "supabase-access-token",
      "550e8400-e29b-41d4-a716-446655440701",
      expect.objectContaining({
        resultStatus: "failed",
      }),
    );
  });

  it("blocks unauthenticated requests", async () => {
    const response = await POST(
      new Request("http://localhost/api/google-calendar/cancel-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calendar_block_id: block.id,
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
        calendar_block_id: block.id,
        approved: true,
      }),
    );

    expect(response.status).toBe(409);
    expect(mocks.deleteGoogleCalendarEventForConnection).not.toHaveBeenCalled();
  });
});
