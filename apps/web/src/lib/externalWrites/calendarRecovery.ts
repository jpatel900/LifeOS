import type { ExternalWriteEvent, TimeBlockProposal } from "@lifeos/schemas";
import type { GoogleCalendarStoredConnection } from "@/lib/googleCalendar/server";

function sameTime(left: unknown, right: unknown) {
  return (
    typeof left === "string" &&
    typeof right === "string" &&
    Number.isFinite(Date.parse(left)) &&
    Date.parse(left) === Date.parse(right)
  );
}

/** A reconnect and the word "primary" do not identify the original account. */
export function isCalendarRecoveryOriginCurrent(
  audit: ExternalWriteEvent,
  proposal: TimeBlockProposal,
  connection: GoogleCalendarStoredConnection,
) {
  const value = audit.request_summary_json;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const original = value as Record<string, unknown>;
  return (
    connection.status === "connected" &&
    Boolean(connection.encrypted_refresh_token) &&
    sameTime(connection.credential_verified_at, connection.connected_at) &&
    audit.user_id === proposal.user_id &&
    connection.user_id === audit.user_id &&
    audit.target_id === proposal.id &&
    original.proposal_id === proposal.id &&
    Object.hasOwn(original, "claim_task_id") &&
    original.claim_task_id === proposal.task_id &&
    original.claim_connection_id === connection.id &&
    original.calendar_id === connection.calendar_id &&
    sameTime(original.claim_connected_at, connection.connected_at) &&
    sameTime(original.proposed_start, proposal.proposed_start) &&
    sameTime(original.proposed_end, proposal.proposed_end)
  );
}
