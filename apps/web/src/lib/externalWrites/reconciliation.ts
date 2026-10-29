import type { ExternalWriteEvent } from "@lifeos/schemas";
import { ExternalWriteEventSchema } from "@lifeos/schemas";
import { getGoogleCalendarStoredConnectionForAccessToken } from "@/lib/googleCalendar/server";
import {
  buildDeterministicGoogleEventId,
  getGoogleCalendarEventForConnection,
  requireApprovedGoogleCalendarEvent,
} from "@/lib/googleCalendar/events";
import { getTimeBlockProposalForAccessToken } from "@/lib/planning/server";
import {
  requireSupabaseServiceRoleClient,
  requireSupabaseServerUser,
} from "@/lib/supabase/server";
import { finishGoogleCalendarApprovalForAccessToken } from "./server";
import { isCalendarRecoveryOriginCurrent } from "./calendarRecovery";

export const EXTERNAL_WRITE_RECONCILIATION_PENDING_AFTER_MS = 60 * 60 * 1000;

const externalWriteEventColumns =
  "id,user_id,area_id,provider,operation,target_type,target_id,request_summary_json,result_summary_json,result_status,error_message,created_at";

export interface ExternalWriteReconciliationResult {
  checked: number;
  failed: number;
  leftPending: number;
  succeeded: number;
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

function parseRows(data: unknown): ExternalWriteEvent[] {
  return ExternalWriteEventSchema.array().parse(data ?? []);
}

async function readStalePendingExternalWrites(
  userId: string,
  cutoffIso: string,
) {
  const client = requireSupabaseServiceRoleClient();
  type PendingQueryChain = {
    eq: (column: string, value: string) => PendingQueryChain;
    lte: (
      column: string,
      value: string,
    ) => {
      order: (
        column: string,
        options: { ascending: boolean },
      ) => Promise<{ data: unknown; error: unknown }>;
    };
  };
  const query = client.from("external_write_events") as unknown as {
    select: (columns: string) => PendingQueryChain;
  };

  const { data, error } = await query
    .select(externalWriteEventColumns)
    .eq("user_id", userId)
    .eq("result_status", "pending")
    .lte("created_at", cutoffIso)
    .order("created_at", { ascending: true });

  if (error) throw new Error(getSupabaseMessage(error));

  return parseRows(data).filter(
    (row) =>
      row.provider === "google_calendar" &&
      row.operation === "calendar.events.insert" &&
      row.target_type === "time_block_proposal" &&
      row.target_id,
  );
}

export async function reconcilePendingGoogleCalendarInsertAuditsForAccessToken(
  accessToken: string,
  options: { now?: () => Date } = {},
): Promise<ExternalWriteReconciliationResult> {
  const { user } = await requireSupabaseServerUser(accessToken);
  const cutoffIso = new Date(
    (options.now ?? (() => new Date()))().getTime() -
      EXTERNAL_WRITE_RECONCILIATION_PENDING_AFTER_MS,
  ).toISOString();
  const pendingRows = await readStalePendingExternalWrites(user.id, cutoffIso);
  const result: ExternalWriteReconciliationResult = {
    checked: pendingRows.length,
    failed: 0,
    leftPending: 0,
    succeeded: 0,
  };

  for (const audit of pendingRows) {
    const proposalId = audit.target_id;
    if (!proposalId) continue;

    try {
      const [{ connection }, proposal] = await Promise.all([
        getGoogleCalendarStoredConnectionForAccessToken(accessToken),
        getTimeBlockProposalForAccessToken(accessToken, proposalId),
      ]);

      if (
        !connection ||
        !isCalendarRecoveryOriginCurrent(audit, proposal, connection)
      ) {
        result.leftPending += 1;
        continue;
      }

      const expectedEventId = buildDeterministicGoogleEventId(proposalId);
      const remote = await getGoogleCalendarEventForConnection({
        connection,
        eventId: expectedEventId,
        supabaseAccessToken: accessToken,
      });

      // Absence cannot prove that a paused request will never reach Google.
      const confirmed = requireApprovedGoogleCalendarEvent(remote, {
        proposalId: proposal.id,
        proposedStart: proposal.proposed_start,
        proposedEnd: proposal.proposed_end,
      });
      await finishGoogleCalendarApprovalForAccessToken(accessToken, {
        auditId: audit.id,
        proposalId: proposal.id,
        connectionId: connection.id,
        connectedAt: connection.connected_at!,
        calendarId: connection.calendar_id,
        googleEventId: confirmed.googleEventId,
        googleEventEtag: confirmed.googleEventEtag!,
        proposedStart: proposal.proposed_start,
        proposedEnd: proposal.proposed_end,
      });
      result.succeeded += 1;
    } catch {
      result.leftPending += 1;
    }
  }

  return result;
}
