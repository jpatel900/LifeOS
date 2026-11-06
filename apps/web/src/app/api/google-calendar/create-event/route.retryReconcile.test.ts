// W3-16 finding 2: retry after "Google said yes, LifeOS failed to save".
//
// Ported from #1117 onto W11-3's reservation/dispatch/atomic-finish protocol.
// Retry reads the original identity first, so a partial account save needs
// exactly one provider POST across both approvals. A mismatch stays pending
// and returns a recoverable conflict without recording unverified details.
//
// This file keeps the REAL route and the REAL event adapter. Only the token
// lookup, the account helpers and the network are fake: an in-memory Google
// Calendar that answers insert and read like the real API (a duplicate id is
// 409, a cancelled event keeps its id). No real Google write happens.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  acknowledgeGoogleCalendarFirstWriteWarningForAccessToken: vi.fn(),
  claimGoogleCalendarApprovalForAccessToken: vi.fn(),
  dispatchGoogleCalendarApprovalForAccessToken: vi.fn(),
  acknowledgeGoogleCalendarDispatchForAccessToken: vi.fn(),
  finishGoogleCalendarApprovalForAccessToken: vi.fn(),
  getCalendarBlockForProposalForAccessToken: vi.fn(),
  getGoogleCalendarConfig: vi.fn(),
  getGoogleCalendarStoredConnectionForAccessToken: vi.fn(),
  getTaskForAccessToken: vi.fn(),
  getTimeBlockProposalForAccessToken: vi.fn(),
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
  dispatchGoogleCalendarApprovalForAccessToken:
    mocks.dispatchGoogleCalendarApprovalForAccessToken,
  acknowledgeGoogleCalendarDispatchForAccessToken:
    mocks.acknowledgeGoogleCalendarDispatchForAccessToken,
  finishGoogleCalendarApprovalForAccessToken:
    mocks.finishGoogleCalendarApprovalForAccessToken,
  updateExternalWriteEventResultForAccessToken:
    mocks.updateExternalWriteEventResultForAccessToken,
}));

vi.mock("@/lib/planning/server", () => ({
  getCalendarBlockForProposalForAccessToken:
    mocks.getCalendarBlockForProposalForAccessToken,
  getTaskForAccessToken: mocks.getTaskForAccessToken,
  getTimeBlockProposalForAccessToken: mocks.getTimeBlockProposalForAccessToken,
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
const FIRST_AUDIT = "550e8400-e29b-41d4-a716-446655440701";
const RETRY_AUDIT = "550e8400-e29b-41d4-a716-446655440702";
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
  mocks.finishGoogleCalendarApprovalForAccessToken.mockRejectedValueOnce(
    new Error("account write timed out"),
  );
  const response = await POST(approveRequest());
  const body = await response.json();
  expect(response.status).toBe(502);
  expect(body.google_event_created).toBe(true);
  expect(
    mocks.dispatchGoogleCalendarApprovalForAccessToken,
  ).toHaveBeenCalledExactlyOnceWith("supabase-access-token", FIRST_AUDIT);
  expect(
    mocks.updateExternalWriteEventResultForAccessToken,
  ).not.toHaveBeenCalled();
  return body;
}

describe("create-event retry after a partial success (W3-16 #2)", () => {
  let google: ReturnType<typeof fakeGoogleCalendar>;

  beforeEach(() => {
    vi.resetAllMocks();
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
    mocks.getTaskForAccessToken.mockResolvedValue({
      id: proposal.task_id,
      title: "Synthetic task",
    });
    mocks.claimGoogleCalendarApprovalForAccessToken
      .mockResolvedValueOnce({ id: FIRST_AUDIT })
      .mockResolvedValue({ id: RETRY_AUDIT });
    mocks.dispatchGoogleCalendarApprovalForAccessToken.mockResolvedValue(
      undefined,
    );
    mocks.updateExternalWriteEventResultForAccessToken.mockResolvedValue({
      id: "550e8400-e29b-41d4-a716-446655440701",
    });
    mocks.finishGoogleCalendarApprovalForAccessToken.mockResolvedValue(
      placementAt(T1_START, T1_END),
    );
  });

  it("control: retrying an unchanged event finishes the save with one Google event", async () => {
    await firstApprovalWithAccountSaveFailure();
    expect(google.requests.map(({ method }) => method)).toEqual([
      "GET",
      "POST",
      "GET",
    ]);

    const response = await POST(approveRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.google_event_id).toBe(EVENT_ID);
    expect(google.events.size).toBe(1);
    expect(
      google.requests.filter((request) => request.method === "POST"),
    ).toHaveLength(1);
    expect(google.requests.map(({ method }) => method)).toEqual([
      "GET",
      "POST",
      "GET",
      "GET",
    ]);
    expect(
      mocks.dispatchGoogleCalendarApprovalForAccessToken,
    ).toHaveBeenCalledTimes(1);
    expect(
      mocks.updateExternalWriteEventResultForAccessToken,
    ).not.toHaveBeenCalled();
    expect(
      mocks.finishGoogleCalendarApprovalForAccessToken,
    ).toHaveBeenLastCalledWith("supabase-access-token", {
      auditId: RETRY_AUDIT,
      proposalId: proposal.id,
      connectionId: connection.id,
      connectedAt: connection.connected_at,
      calendarId: connection.calendar_id,
      googleEventId: EVENT_ID,
      googleEventEtag: google.events.get(EVENT_ID)!.etag,
      proposedStart: T1_START,
      proposedEnd: T1_END,
    });
  });

  it("returns the committed block to both requests when the retry finishes first", async () => {
    let entered!: () => void;
    let release!: () => void;
    const firstAtFinish = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const resumeFirst = new Promise<void>((resolve) => {
      release = resolve;
    });
    let committed = false;
    mocks.finishGoogleCalendarApprovalForAccessToken.mockImplementation(
      async (_token, { auditId }) => {
        if (auditId === FIRST_AUDIT) {
          entered();
          await resumeFirst;
          expect(committed).toBe(true);
        } else {
          committed = true;
        }
        return {
          ...placementAt(T1_START, T1_END),
          audit: { id: auditId, result_status: "succeeded" },
        };
      },
    );
    const first = POST(approveRequest());
    await firstAtFinish;
    let retry: Response;
    try {
      retry = await POST(approveRequest());
    } finally {
      release();
    }
    const original = await first;
    expect([original.status, retry.status]).toEqual([200, 200]);
    const [a, b] = await Promise.all([original.json(), retry.json()]);
    expect(a.block.id).toBe(b.block.id);
    expect([a.audit.id, b.audit.id]).toEqual([FIRST_AUDIT, RETRY_AUDIT]);
    expect(
      mocks.acknowledgeGoogleCalendarDispatchForAccessToken,
    ).toHaveBeenCalledExactlyOnceWith("supabase-access-token", FIRST_AUDIT);
    expect(google.requests.map(({ method }) => method)).toEqual([
      "GET",
      "POST",
      "GET",
      "GET",
    ]);
  });

  it.each(["moved", "cancelled", "wrong provenance", "missing etag"])(
    "a %s event stays unresolved with one provider write",
    async (scenario) => {
      await firstApprovalWithAccountSaveFailure();
      if (scenario === "moved") google.moveTo(T2_START, T2_END);
      if (scenario === "cancelled") google.cancel();
      if (scenario === "wrong provenance")
        google.events.get(
          EVENT_ID,
        )!.extendedProperties.private.lifeos_proposal_id = "unrelated";
      if (scenario === "missing etag") google.events.get(EVENT_ID)!.etag = "";
      mocks.finishGoogleCalendarApprovalForAccessToken.mockClear();

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
        mocks.finishGoogleCalendarApprovalForAccessToken,
      ).not.toHaveBeenCalled();
      expect(body.ok).toBe(false);
      expect(response.status).toBe(409);
      expect(body.error).toBe(
        "LifeOS could not confirm that this Google Calendar event still matches your approval. Check the event in its original Google Calendar before approving another time. Local planning remains available.",
      );
      expect(
        google.requests.filter(({ method }) => method === "POST"),
      ).toHaveLength(1);
      expect(
        mocks.dispatchGoogleCalendarApprovalForAccessToken,
      ).toHaveBeenCalledTimes(1);
      expect(
        mocks.updateExternalWriteEventResultForAccessToken,
      ).not.toHaveBeenCalled();
    },
  );

  it("keeps a provider read failure pending without leaking its response", async () => {
    await firstApprovalWithAccountSaveFailure();
    google.fetchImpl.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: "synthetic private provider diagnostic" }),
        { status: 503 },
      ),
    );
    mocks.finishGoogleCalendarApprovalForAccessToken.mockClear();

    const response = await POST(approveRequest());
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.ok).toBe(false);
    expect(body.error).not.toContain("synthetic private provider diagnostic");
    expect(
      google.requests.filter(({ method }) => method === "POST"),
    ).toHaveLength(1);
    expect(
      mocks.dispatchGoogleCalendarApprovalForAccessToken,
    ).toHaveBeenCalledTimes(1);
    expect(
      mocks.finishGoogleCalendarApprovalForAccessToken,
    ).not.toHaveBeenCalled();
    expect(
      mocks.updateExternalWriteEventResultForAccessToken,
    ).not.toHaveBeenCalled();
  });
});
