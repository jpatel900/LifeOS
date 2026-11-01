// W3-16 finding 2: retry after "Google said yes, LifeOS failed to save".
//
// The route tells the person to approve again, promising no second event:
// the event id is derived from the proposal, so Google answers 409 for the
// same id. The adapter used to treat that 409 as success WITHOUT reading the
// event, and the route then recorded the placement at the proposal's original
// time, even if the event was moved or cancelled on Google in between. It now
// reads the event first and refuses plainly when it no longer matches.
//
// This file keeps the REAL route and the REAL event adapter. Only the token
// lookup, the account helpers and the network are fake: an in-memory Google
// Calendar that answers insert and read like the real API (a duplicate id is
// 409, a cancelled event keeps its id). No real Google write happens.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  acknowledgeGoogleCalendarFirstWriteWarningForAccessToken: vi.fn(),
  claimGoogleCalendarApprovalForAccessToken: vi.fn(),
  findGoogleBackedScheduledBlockForTaskForAccessToken: vi.fn(),
  getCalendarBlockForProposalForAccessToken: vi.fn(),
  getGoogleCalendarConfig: vi.fn(),
  getGoogleCalendarStoredConnectionForAccessToken: vi.fn(),
  getTaskForAccessToken: vi.fn(),
  getTimeBlockProposalForAccessToken: vi.fn(),
  recordGoogleCalendarPlacementForAccessToken: vi.fn(),
  requireSupabaseServerUser: vi.fn(),
  resolveGoogleCalendarAccessToken: vi.fn(),
  updateExternalWriteEventResultForAccessToken: vi.fn(),
}));

vi.mock("@/lib/googleCalendar/config", () => ({
  getGoogleCalendarConfig: mocks.getGoogleCalendarConfig,
}));

vi.mock("@/lib/googleCalendar/freebusy", () => ({
  resolveGoogleCalendarAccessToken: mocks.resolveGoogleCalendarAccessToken,
}));

vi.mock("@/lib/googleCalendar/server", () => ({
  acknowledgeGoogleCalendarFirstWriteWarningForAccessToken:
    mocks.acknowledgeGoogleCalendarFirstWriteWarningForAccessToken,
  getGoogleCalendarStoredConnectionForAccessToken:
    mocks.getGoogleCalendarStoredConnectionForAccessToken,
}));

vi.mock("@/lib/externalWrites/server", () => ({
  claimGoogleCalendarApprovalForAccessToken:
    mocks.claimGoogleCalendarApprovalForAccessToken,
  updateExternalWriteEventResultForAccessToken:
    mocks.updateExternalWriteEventResultForAccessToken,
}));

vi.mock("@/lib/planning/server", () => ({
  findGoogleBackedScheduledBlockForTaskForAccessToken:
    mocks.findGoogleBackedScheduledBlockForTaskForAccessToken,
  getCalendarBlockForProposalForAccessToken:
    mocks.getCalendarBlockForProposalForAccessToken,
  getTaskForAccessToken: mocks.getTaskForAccessToken,
  getTimeBlockProposalForAccessToken: mocks.getTimeBlockProposalForAccessToken,
  recordGoogleCalendarPlacementForAccessToken:
    mocks.recordGoogleCalendarPlacementForAccessToken,
}));

vi.mock("@/lib/supabase/server", () => ({
  requireSupabaseServerUser: mocks.requireSupabaseServerUser,
}));

import { POST } from "./route";

const user = { id: "550e8400-e29b-41d4-a716-446655440001" };
const T1_START = "2026-05-10T16:00:00.000Z";
const T1_END = "2026-05-10T17:00:00.000Z";
const T2_START = "2026-05-10T19:00:00.000Z";
const T2_END = "2026-05-10T20:00:00.000Z";
const proposal = {
  id: "550e8400-e29b-41d4-a716-446655440501",
  user_id: user.id,
  area_id: "550e8400-e29b-41d4-a716-446655440101",
  task_id: "550e8400-e29b-41d4-a716-446655440301",
  proposed_start: T1_START,
  proposed_end: T1_END,
  rationale_json: { note: "Synthetic proposal." },
  conflict_flag: false,
  conflict_details_json: null,
  status: "proposed" as const,
  created_at: "2026-05-10T15:00:00.000Z",
};
const EVENT_ID = `lifeos${proposal.id.replace(/-/g, "")}`;
const connection = {
  id: "550e8400-e29b-41d4-a716-446655440901",
  user_id: user.id,
  provider: "google_calendar" as const,
  calendar_id: "primary",
  encrypted_access_token: "encrypted-access",
  encrypted_refresh_token: "encrypted-refresh",
  granted_scopes_json: [
    "https://www.googleapis.com/auth/calendar.events.owned",
  ],
  status: "connected" as const,
  first_write_warning_acknowledged_at: "2026-05-09T00:00:00.000Z",
  connected_at: "2026-05-09T00:00:00.000Z",
  credential_verified_at: "2026-05-09T00:00:00.000Z",
  disconnected_at: null,
  token_expires_at: "2026-05-09T01:00:00.000Z",
  token_type: "Bearer",
  created_at: "2026-05-09T00:00:00.000Z",
  updated_at: "2026-05-09T00:00:00.000Z",
};

type FakeEvent = {
  id: string;
  etag: string;
  status: "confirmed" | "cancelled";
  start: { dateTime: string };
  end: { dateTime: string };
  extendedProperties: { private: Record<string, string> };
};

/** In-memory Google Calendar: insert and read only, like the real API. */
function fakeGoogleCalendar() {
  const events = new Map<string, FakeEvent>();
  const requests: Array<{ method: string; url: string }> = [];
  let revision = 1;
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  const fetchImpl = vi.fn(async (input: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    requests.push({ method, url: input });
    const base =
      "https://www.googleapis.com/calendar/v3/calendars/primary/events";
    if (method === "POST" && input === base) {
      const body = JSON.parse(String(init?.body));
      if (events.has(body.id)) {
        return json(409, {
          error: {
            code: 409,
            message: "The requested identifier already exists.",
          },
        });
      }
      const event: FakeEvent = {
        id: body.id,
        etag: `"etag-${revision++}"`,
        status: "confirmed",
        start: { dateTime: body.start.dateTime },
        end: { dateTime: body.end.dateTime },
        extendedProperties: body.extendedProperties,
      };
      events.set(event.id, event);
      return json(200, event);
    }
    if (method === "GET" && input.startsWith(`${base}/`)) {
      const id = decodeURIComponent(input.slice(base.length + 1));
      const event = events.get(id);
      return event ? json(200, event) : json(404, { error: { code: 404 } });
    }
    return json(400, { error: { code: 400, message: "unexpected request" } });
  });

  return {
    events,
    requests,
    fetchImpl,
    moveTo(start: string, end: string) {
      const event = events.get(EVENT_ID)!;
      events.set(EVENT_ID, {
        ...event,
        etag: `"etag-${revision++}"`,
        start: { dateTime: start },
        end: { dateTime: end },
      });
    },
    cancel() {
      const event = events.get(EVENT_ID)!;
      events.set(EVENT_ID, {
        ...event,
        etag: `"etag-${revision++}"`,
        status: "cancelled",
      });
    },
  };
}

function approveRequest() {
  return new Request("http://localhost/api/google-calendar/create-event", {
    method: "POST",
    headers: {
      Authorization: "Bearer supabase-access-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      proposal_id: proposal.id,
      approved: true,
      approved_start: T1_START,
      approved_end: T1_END,
      timezone: "America/Toronto",
    }),
  });
}

function placementAt(start: string, end: string) {
  return {
    block: {
      id: "550e8400-e29b-41d4-a716-446655440601",
      user_id: user.id,
      area_id: proposal.area_id,
      proposal_id: proposal.id,
      task_id: proposal.task_id,
      google_event_id: EVENT_ID,
      start_at: start,
      end_at: end,
      status: "scheduled",
      created_at: "2026-05-10T15:30:00.000Z",
      updated_at: "2026-05-10T15:30:00.000Z",
    },
    proposal: { ...proposal, status: "accepted" },
    task: null,
  };
}

/** First approval: Google creates the event, the account save fails. */
async function firstApprovalWithAccountSaveFailure() {
  mocks.recordGoogleCalendarPlacementForAccessToken.mockRejectedValueOnce(
    new Error("account write timed out"),
  );
  const response = await POST(approveRequest());
  const body = await response.json();
  expect(response.status).toBe(502);
  expect(body.google_event_created).toBe(true);
  return body;
}

describe("create-event retry after a partial success (W3-16 #2)", () => {
  let google: ReturnType<typeof fakeGoogleCalendar>;

  beforeEach(() => {
    vi.clearAllMocks();
    google = fakeGoogleCalendar();
    vi.stubGlobal("fetch", google.fetchImpl);
    mocks.getGoogleCalendarConfig.mockReturnValue({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost/api/google-calendar/callback",
      tokenEncryptionKey: "token-encryption-key",
    });
    mocks.resolveGoogleCalendarAccessToken.mockResolvedValue(
      "google-access-token",
    );
    mocks.requireSupabaseServerUser.mockResolvedValue({ user });
    mocks.getGoogleCalendarStoredConnectionForAccessToken.mockResolvedValue({
      connection,
    });
    mocks.getTimeBlockProposalForAccessToken.mockResolvedValue(proposal);
    mocks.getCalendarBlockForProposalForAccessToken.mockResolvedValue(null);
    mocks.findGoogleBackedScheduledBlockForTaskForAccessToken.mockResolvedValue(
      null,
    );
    mocks.getTaskForAccessToken.mockResolvedValue({
      id: proposal.task_id,
      title: "Synthetic task",
    });
    mocks.claimGoogleCalendarApprovalForAccessToken.mockResolvedValue({
      id: "550e8400-e29b-41d4-a716-446655440701",
    });
    mocks.updateExternalWriteEventResultForAccessToken.mockResolvedValue({
      id: "550e8400-e29b-41d4-a716-446655440701",
    });
    mocks.recordGoogleCalendarPlacementForAccessToken.mockResolvedValue(
      placementAt(T1_START, T1_END),
    );
  });

  it("control: retrying an unchanged event finishes the save with one Google event", async () => {
    await firstApprovalWithAccountSaveFailure();

    const response = await POST(approveRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.google_event_id).toBe(EVENT_ID);
    expect(google.events.size).toBe(1);
    expect(
      google.requests.filter((request) => request.method === "POST"),
    ).toHaveLength(2);
    expect(
      mocks.recordGoogleCalendarPlacementForAccessToken,
    ).toHaveBeenLastCalledWith("supabase-access-token", proposal.id, EVENT_ID);
  });

  // W3-16 #2: on 409 the adapter reads the existing event and refuses
  // plainly when it no longer holds the approved time.
  it("a retry does not confirm the original time after the event moved on Google", async () => {
    await firstApprovalWithAccountSaveFailure();
    google.moveTo(T2_START, T2_END);
    mocks.recordGoogleCalendarPlacementForAccessToken.mockClear();

    const response = await POST(approveRequest());
    const body = await response.json();

    // Still one remote event: no duplicate was created.
    expect(google.events.size).toBe(1);
    // The event's current state was read before anything was recorded ...
    expect(
      google.requests.some(
        (request) =>
          request.method === "GET" && request.url.endsWith(`/${EVENT_ID}`),
      ),
    ).toBe(true);
    // ... and the original time was not confirmed.
    expect(
      mocks.recordGoogleCalendarPlacementForAccessToken,
    ).not.toHaveBeenCalled();
    expect(body.ok).toBe(false);
  });

  it("a retry does not record a placement for an event cancelled on Google", async () => {
    await firstApprovalWithAccountSaveFailure();
    google.cancel();
    mocks.recordGoogleCalendarPlacementForAccessToken.mockClear();

    const response = await POST(approveRequest());
    const body = await response.json();

    expect(google.events.size).toBe(1);
    expect(
      mocks.recordGoogleCalendarPlacementForAccessToken,
    ).not.toHaveBeenCalled();
    expect(body.ok).toBe(false);
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});
