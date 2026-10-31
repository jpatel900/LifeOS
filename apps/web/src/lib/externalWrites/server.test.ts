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
  claimGoogleCalendarApprovalForAccessToken,
  dispatchGoogleCalendarApprovalForAccessToken,
  finishGoogleCalendarApprovalForAccessToken,
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

function makeUpdate(status: "failed" | "succeeded") {
  const single = vi.fn().mockResolvedValue({
    data: {
      ...auditRow,
      result_status: status,
      created_at: "2026-05-09T00:20:00.000Z",
    },
    error: null,
  });
  const select = vi.fn().mockReturnValue({ single });
  const eq = vi.fn();
  const chain = { eq, select };
  eq.mockReturnValue(chain);
  return { eq, update: vi.fn().mockReturnValue(chain) };
}

function makeIncidentEq() {
  const eq = vi.fn();
  const chain = { eq };
  eq.mockReturnValue(chain);
  return eq;
}

describe("external write audit helpers", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireSupabaseServerUser.mockResolvedValue({ user });
  });

  const approval = {
    userId: user.id,
    proposalId: "550e8400-e29b-41d4-a716-446655440501",
    taskId: "550e8400-e29b-41d4-a716-446655440301",
    proposedStart: "2026-05-10T16:00:00.000Z",
    proposedEnd: "2026-05-10T17:00:00.000Z",
    connectionId: "550e8400-e29b-41d4-a716-446655440901",
    connectedAt: "2026-05-09T00:00:00.000Z",
    calendarId: "primary",
    requestSummary: { timezone: "America/Toronto" },
  };

  it("reserves approval and its pending audit in one service-only RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: auditRow, error: null });
    mocks.requireSupabaseServiceRoleClient.mockReturnValue({ rpc });
    expect(
      await claimGoogleCalendarApprovalForAccessToken("token", approval),
    ).toEqual(auditRow);
    expect(rpc).toHaveBeenCalledWith("reserve_google_calendar_approval", {
      p_user_id: user.id,
      p_proposal_id: approval.proposalId,
      p_task_id: approval.taskId,
      p_start: approval.proposedStart,
      p_end: approval.proposedEnd,
      p_connection_id: approval.connectionId,
      p_connected_at: approval.connectedAt,
      p_calendar_id: "primary",
      p_request_summary: approval.requestSummary,
    });
  });

  const recoveryProof = {
    auditId: auditRow.id,
    proposalId: approval.proposalId,
    connectionId: approval.connectionId,
    connectedAt: approval.connectedAt,
    calendarId: approval.calendarId,
    googleEventId: "lifeos550e8400e29b41d4a716446655440501",
    proposedStart: approval.proposedStart,
    proposedEnd: approval.proposedEnd,
    googleEventEtag: "synthetic-etag",
  };

  it("uses only the authenticated owner for the one-use dispatch", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    mocks.requireSupabaseServiceRoleClient.mockReturnValue({ rpc });
    await dispatchGoogleCalendarApprovalForAccessToken("token", auditRow.id);
    expect(rpc).toHaveBeenCalledWith("dispatch_google_calendar_approval", {
      p_user_id: user.id,
      p_audit_id: auditRow.id,
    });
  });

  it("passes the exact origin and verified event to the transactional finalizer", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "private backend detail" },
    });
    mocks.requireSupabaseServiceRoleClient.mockReturnValue({ rpc });
    await expect(
      finishGoogleCalendarApprovalForAccessToken("token", recoveryProof),
    ).rejects.toThrow("Calendar approval conflict.");
    expect(rpc).toHaveBeenCalledWith("finish_google_calendar_approval", {
      p_user_id: user.id,
      p_audit_id: auditRow.id,
      p_proposal_id: approval.proposalId,
      p_connection_id: approval.connectionId,
      p_connected_at: approval.connectedAt,
      p_calendar_id: "primary",
      p_google_event_id: recoveryProof.googleEventId,
      p_start: approval.proposedStart,
      p_end: approval.proposedEnd,
      p_etag: "synthetic-etag",
    });
  });

  it.each(["dispatch", "finish"])(
    "requires authentication before privileged %s",
    async (kind) => {
      mocks.requireSupabaseServerUser.mockRejectedValue(new Error("Sign in"));
      const call =
        kind === "dispatch"
          ? dispatchGoogleCalendarApprovalForAccessToken("token", auditRow.id)
          : finishGoogleCalendarApprovalForAccessToken("token", recoveryProof);
      await expect(call).rejects.toThrow("Sign in");
      expect(mocks.requireSupabaseServiceRoleClient).not.toHaveBeenCalled();
    },
  );

  it("rejects a forged owner before obtaining the privileged client", async () => {
    await expect(
      claimGoogleCalendarApprovalForAccessToken("token", {
        ...approval,
        userId: "550e8400-e29b-41d4-a716-446655440002",
      }),
    ).rejects.toThrow("user mismatch");
    expect(mocks.requireSupabaseServiceRoleClient).not.toHaveBeenCalled();
  });

  it("propagates a typed conflict without leaking database copy", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "PCA01", message: "private database detail" },
    });
    mocks.requireSupabaseServiceRoleClient.mockReturnValue({ rpc });
    await expect(
      claimGoogleCalendarApprovalForAccessToken("token", approval),
    ).rejects.toMatchObject({
      code: "CALENDAR_APPROVAL_CONFLICT",
      message: "Calendar approval conflict.",
    });
  });

  it("preserves exact attempt identity and origin in provider absence evidence", async () => {
    const attempt = {
      auditId: "550e8400-e29b-41d4-a716-446655440711",
      proposalId: "550e8400-e29b-41d4-a716-446655440511",
      connectionId: approval.connectionId,
      connectedAt: approval.connectedAt,
      calendarId: "primary",
    };
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: {
          code: "PCA01",
          details: `checkable-v2:${JSON.stringify([attempt])}`,
        },
      })
      .mockResolvedValueOnce({ data: auditRow, error: null });
    mocks.requireSupabaseServiceRoleClient.mockReturnValue({ rpc });
    await expect(
      claimGoogleCalendarApprovalForAccessToken("token", approval),
    ).rejects.toMatchObject({ checkableAttempts: [attempt] });
    await claimGoogleCalendarApprovalForAccessToken("token", {
      ...approval,
      absentAttemptIds: [attempt.auditId],
    });
    expect(rpc).toHaveBeenLastCalledWith(
      "reserve_google_calendar_approval",
      expect.objectContaining({ p_absent_attempt_ids: [attempt.auditId] }),
    );
  });

  it.each([
    "checkable-v2:not-json",
    "checkable-v2:[]",
    'checkable-v2:[{"auditId":"invalid"}]',
    "checkable:550e8400-e29b-41d4-a716-446655440511",
  ])("refuses incomplete or legacy absence evidence: %s", async (details) => {
    mocks.requireSupabaseServiceRoleClient.mockReturnValue({
      rpc: vi
        .fn()
        .mockResolvedValue({ data: null, error: { code: "PCA01", details } }),
    });
    await expect(
      claimGoogleCalendarApprovalForAccessToken("token", approval),
    ).rejects.toMatchObject({ checkableAttempts: [] });
  });

  // Review round 3: the conflict names finished sibling attempts the route
  // may check against Google, and a vouched retry passes them back.
  it("exposes every checkable attempt and forwards exact vouched absences", async () => {
    const first = "550e8400-e29b-41d4-a716-446655440511";
    const second = "550e8400-e29b-41d4-a716-446655440512";
    const attempts = [first, second].map((auditId) => ({
      auditId,
      proposalId: approval.proposalId,
      connectionId: approval.connectionId,
      connectedAt: approval.connectedAt,
      calendarId: approval.calendarId,
    }));
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: {
          code: "PCA01",
          message: "Calendar approval conflict",
          details: `checkable-v2:${JSON.stringify(attempts)}`,
        },
      })
      .mockResolvedValueOnce({ data: auditRow, error: null });
    mocks.requireSupabaseServiceRoleClient.mockReturnValue({ rpc });
    await expect(
      claimGoogleCalendarApprovalForAccessToken("token", approval),
    ).rejects.toMatchObject({
      code: "CALENDAR_APPROVAL_CONFLICT",
      checkableAttempts: attempts,
    });
    await claimGoogleCalendarApprovalForAccessToken("token", {
      ...approval,
      absentAttemptIds: [first, second],
    });
    expect(rpc).toHaveBeenLastCalledWith(
      "reserve_google_calendar_approval",
      expect.objectContaining({ p_absent_attempt_ids: [first, second] }),
    );
  });

  it("does not expose checkable ids for a conflict without them", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "PCA01", message: "Calendar approval conflict" },
    });
    mocks.requireSupabaseServiceRoleClient.mockReturnValue({ rpc });
    await expect(
      claimGoogleCalendarApprovalForAccessToken("token", approval),
    ).rejects.toMatchObject({ checkableAttempts: [] });
  });

  it.each([
    { data: null, error: { message: "database unavailable" } },
    { data: null, error: null },
    { data: {}, error: null },
  ])(
    "fails closed on a failed or malformed claim response: %j",
    async (result) => {
      mocks.requireSupabaseServiceRoleClient.mockReturnValue({
        rpc: vi.fn().mockResolvedValue(result),
      });
      await expect(
        claimGoogleCalendarApprovalForAccessToken("token", approval),
      ).rejects.toThrow();
    },
  );

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
    const { eq, update } = makeUpdate("failed");
    const incidentEq = makeIncidentEq();
    const incidentUpdate = vi.fn().mockReturnValue({ eq: incidentEq });
    const historyOrder = vi.fn().mockResolvedValue({ data: [], error: null });
    const historyGte = vi.fn().mockReturnValue({ order: historyOrder });
    const historyEq = vi.fn();
    historyEq.mockReturnValue({ eq: historyEq, gte: historyGte });
    const historySelect = vi.fn().mockReturnValue({ eq: historyEq });
    const serviceClient = {
      from: vi.fn((table: string) => {
        if (table === "health_incidents") {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
            update: incidentUpdate,
          };
        }
        return { select: historySelect, update };
      }),
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

  it("opens incidents only after three consecutive failures and closes them on success", async () => {
    const insertIncident = vi.fn().mockResolvedValue({ error: null });
    const incidentEq = makeIncidentEq();
    const incidentUpdate = vi.fn().mockReturnValue({ eq: incidentEq });
    const historyOrder = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          { result_status: "failed" },
          { result_status: "failed" },
          { result_status: "succeeded" },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          { result_status: "failed" },
          { result_status: "failed" },
          { result_status: "failed" },
        ],
        error: null,
      });
    const historyGte = vi.fn().mockReturnValue({ order: historyOrder });
    const historyEq = vi.fn();
    historyEq.mockReturnValue({ eq: historyEq, gte: historyGte });
    const historySelect = vi.fn().mockReturnValue({ eq: historyEq });
    let current = makeUpdate("failed");
    const serviceClient = {
      from: vi.fn((table: string) => {
        if (table === "health_incidents") {
          return { insert: insertIncident, update: incidentUpdate };
        }
        return { select: historySelect, update: current.update };
      }),
    };
    mocks.requireSupabaseServiceRoleClient.mockReturnValue(serviceClient);

    await updateExternalWriteEventResultForAccessToken(
      "supabase-access-token",
      auditRow.id,
      { errorMessage: "failed", resultStatus: "failed", resultSummary: {} },
    );
    expect(insertIncident).not.toHaveBeenCalled();

    await updateExternalWriteEventResultForAccessToken(
      "supabase-access-token",
      auditRow.id,
      { errorMessage: "failed", resultStatus: "failed", resultSummary: {} },
    );
    expect(insertIncident).toHaveBeenCalledWith(
      expect.objectContaining({ status: "open" }),
    );

    current = makeUpdate("succeeded");
    await updateExternalWriteEventResultForAccessToken(
      "supabase-access-token",
      auditRow.id,
      { errorMessage: null, resultStatus: "succeeded", resultSummary: {} },
    );
    expect(incidentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "closed" }),
    );
  });
});
