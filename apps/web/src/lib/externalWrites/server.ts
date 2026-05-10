import {
  ExternalWriteEventSchema,
  type ExternalWriteEvent,
} from "@lifeos/schemas";
import { requireSupabaseServerUser } from "@/lib/supabase/server";

const externalWriteEventColumns =
  "id,user_id,area_id,provider,operation,target_type,target_id,request_summary_json,result_summary_json,result_status,error_message,created_at";

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

  const { client } = await requireSupabaseServerUser(accessToken);
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

  const { client } = await requireSupabaseServerUser(accessToken);
  const query = client.from("external_write_events") as unknown as {
    update: (values: Record<string, unknown>) => {
      eq: (
        column: string,
        value: string,
      ) => {
        select: (columns: string) => {
          single: () => Promise<{ data: unknown; error: unknown }>;
        };
      };
    };
  };

  const { data, error } = await query
    .update({
      error_message: row.errorMessage,
      result_status: row.resultStatus,
      result_summary_json: row.resultSummary,
    })
    .eq("id", auditEventId)
    .select(externalWriteEventColumns)
    .single();

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  return parseExternalWriteEvent(data);
}
