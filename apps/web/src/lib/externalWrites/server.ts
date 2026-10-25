import {
  ExternalWriteEventSchema,
  type ExternalWriteEvent,
} from "@lifeos/schemas";
import { z } from "zod";
import {
  requireSupabaseServiceRoleClient,
  requireSupabaseServerUser,
} from "@/lib/supabase/server";

const externalWriteEventColumns =
  "id,user_id,area_id,provider,operation,target_type,target_id,request_summary_json,result_summary_json,result_status,error_message,created_at";

export const EXTERNAL_WRITE_FAILURE_INCIDENT_WINDOW_MS = 30 * 60 * 1000;
export const EXTERNAL_WRITE_FAILURE_INCIDENT_THRESHOLD = 3;

export const CalendarAbsenceAttemptsSchema = z.array(
  z
    .object({
      auditId: z.string().uuid(),
      proposalId: z.string().uuid(),
      connectionId: z.string().uuid(),
      connectedAt: z.string().datetime({ offset: true }),
      calendarId: z.string().min(1),
    })
    .strict(),
);
export type CalendarAbsenceAttempt = z.infer<
  typeof CalendarAbsenceAttemptsSchema
>[number];

function parseCalendarAbsenceAttempts(details: string) {
  if (!details.startsWith("checkable-v2:")) return [];
  try {
    return CalendarAbsenceAttemptsSchema.parse(JSON.parse(details.slice(13)));
  } catch {
    return [];
  }
}

type ExternalWriteUpdateChain = {
  eq: (column: string, value: string) => ExternalWriteUpdateChain;
  select: (columns: string) => {
    single: () => Promise<{ data: unknown; error: unknown }>;
  };
};

function assertServerRuntime() {
  const isTestRuntime =
    process.env.VITEST === "true" || process.env.NODE_ENV === "test";

  if (typeof window !== "undefined" && !isTestRuntime) {
    throw new Error("External write audit helpers must stay server-only.");
  }
}

function getSupabaseMessage(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "Supabase request failed.";
}

function parseExternalWriteEvent(row: unknown): ExternalWriteEvent {
  return ExternalWriteEventSchema.parse(row);
}

async function applyExternalWriteFailureIncidentRule(row: ExternalWriteEvent) {
  const client = requireSupabaseServiceRoleClient();
  const incidentCode = `${row.provider}:${row.operation}:repeated_failure`;
  const openedIncidentQuery = client.from("health_incidents") as unknown as {
    update: (values: Record<string, unknown>) => {
      eq: (
        column: string,
        value: string,
      ) => {
        eq: (
          column: string,
          value: string,
        ) => {
          eq: (column: string, value: string) => Promise<{ error: unknown }>;
        };
      };
    };
    insert: (values: Record<string, unknown>) => Promise<{ error: unknown }>;
  };

  if (row.result_status === "succeeded") {
    const { error } = await openedIncidentQuery
      .update({
        closed_at: new Date().toISOString(),
        status: "closed",
      })
      .eq("user_id", row.user_id)
      .eq("incident_code", incidentCode)
      .eq("status", "open");

    if (error) throw new Error(getSupabaseMessage(error));
    return;
  }

  if (row.result_status !== "failed") return;

  const windowStart = new Date(
    new Date(row.created_at).getTime() -
      EXTERNAL_WRITE_FAILURE_INCIDENT_WINDOW_MS,
  ).toISOString();
  type HistoryQueryChain = {
    eq: (column: string, value: string) => HistoryQueryChain;
    gte: (
      column: string,
      value: string,
    ) => {
      order: (
        column: string,
        options: { ascending: boolean },
      ) => Promise<{ data: unknown; error: unknown }>;
    };
  };
  const historyQuery = client.from("external_write_events") as unknown as {
    select: (columns: string) => HistoryQueryChain;
  };
  const { data, error } = await historyQuery
    .select("id,result_status,created_at")
    .eq("user_id", row.user_id)
    .eq("provider", row.provider)
    .eq("operation", row.operation)
    .gte("created_at", windowStart)
    .order("created_at", { ascending: false });

  if (error) throw new Error(getSupabaseMessage(error));

  const rows = Array.isArray(data) ? data : [];
  let consecutiveFailures = 0;
  for (const item of rows) {
    const status =
      item && typeof item === "object" && "result_status" in item
        ? item.result_status
        : null;

    if (status !== "failed") break;
    consecutiveFailures += 1;
  }

  if (consecutiveFailures < EXTERNAL_WRITE_FAILURE_INCIDENT_THRESHOLD) return;

  const { error: insertError } = await openedIncidentQuery.insert({
    area_id: row.area_id,
    details_json: {
      consecutive_failure_count: consecutiveFailures,
      operation: row.operation,
      provider: row.provider,
      window_minutes: EXTERNAL_WRITE_FAILURE_INCIDENT_WINDOW_MS / 60000,
    },
    incident_code: incidentCode,
    opened_at: new Date().toISOString(),
    severity: "watch",
    status: "open",
    subsystem: "external writes",
    user_id: row.user_id,
  });

  if (insertError) throw new Error(getSupabaseMessage(insertError));
}

export async function createPendingExternalWriteEventForAccessToken(
  accessToken: string,
  row: {
    areaId: string | null;
    operation: string;
    requestSummary: Record<string, unknown>;
    targetId: string | null;
    targetType: string;
    userId: string;
  },
) {
  assertServerRuntime();

  const { user } = await requireSupabaseServerUser(accessToken);

  if (user.id !== row.userId) {
    throw new Error("External write audit user mismatch.");
  }

  const client = requireSupabaseServiceRoleClient();
  const query = client.from("external_write_events") as unknown as {
    insert: (values: Record<string, unknown>) => {
      select: (columns: string) => {
        single: () => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };

  const { data, error } = await query
    .insert({
      area_id: row.areaId,
      error_message: null,
      operation: row.operation,
      provider: "google_calendar",
      request_summary_json: row.requestSummary,
      result_status: "pending",
      result_summary_json: {},
      target_id: row.targetId,
      target_type: row.targetType,
      user_id: row.userId,
    })
    .select(externalWriteEventColumns)
    .single();

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  return parseExternalWriteEvent(data);
}

/** Commit the durable winner and audit before attempting a provider write.
 * A failed audit is not proof that Google received nothing, so only the RPC
 * may decide whether a different approval can proceed.
 */
export async function claimGoogleCalendarApprovalForAccessToken(
  accessToken: string,
  row: {
    userId: string;
    proposalId: string;
    taskId: string | null;
    proposedStart: string;
    proposedEnd: string;
    connectionId: string;
    connectedAt: string | null;
    calendarId: string;
    requestSummary: Record<string, unknown>;
    /** Exact finished attempts whose originating events Google confirmed gone. */
    absentAttemptIds?: string[];
  },
) {
  assertServerRuntime();
  const { user } = await requireSupabaseServerUser(accessToken);
  if (user.id !== row.userId) {
    throw new Error("External write audit user mismatch.");
  }
  const client = requireSupabaseServiceRoleClient();
  const { data, error } = await client.rpc("claim_google_calendar_approval", {
    p_user_id: user.id,
    p_proposal_id: row.proposalId,
    p_task_id: row.taskId,
    p_start: row.proposedStart,
    p_end: row.proposedEnd,
    p_connection_id: row.connectionId,
    p_connected_at: row.connectedAt,
    p_calendar_id: row.calendarId,
    p_request_summary: row.requestSummary,
    ...(row.absentAttemptIds?.length
      ? { p_absent_attempt_ids: row.absentAttemptIds }
      : {}),
  });
  if (error) {
    if (error.code === "PCA01") {
      // Legacy proposal-wide vouchers and malformed origin data fail closed.
      const details =
        "details" in error && typeof error.details === "string"
          ? error.details
          : "";
      throw Object.assign(new Error("Calendar approval conflict."), {
        code: "CALENDAR_APPROVAL_CONFLICT",
        checkableAttempts: parseCalendarAbsenceAttempts(details),
      });
    }
    throw new Error(getSupabaseMessage(error));
  }
  return parseExternalWriteEvent(data);
}

export async function updateExternalWriteEventResultForAccessToken(
  accessToken: string,
  auditEventId: string,
  row: {
    errorMessage: string | null;
    resultStatus: "succeeded" | "failed";
    resultSummary: Record<string, unknown>;
  },
) {
  assertServerRuntime();

  const { user } = await requireSupabaseServerUser(accessToken);
  const client = requireSupabaseServiceRoleClient();
  const query = client.from("external_write_events") as unknown as {
    update: (values: Record<string, unknown>) => ExternalWriteUpdateChain;
  };

  const { data, error } = await query
    .update({
      error_message: row.errorMessage,
      result_status: row.resultStatus,
      result_summary_json: row.resultSummary,
    })
    .eq("id", auditEventId)
    .eq("user_id", user.id)
    .select(externalWriteEventColumns)
    .single();

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  const parsed = parseExternalWriteEvent(data);
  await applyExternalWriteFailureIncidentRule(parsed);
  return parsed;
}
