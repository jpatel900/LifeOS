import {
  TimeBlockProposalSchema,
  type TimeBlockProposal,
} from "@lifeos/schemas";
import { requireSupabaseServerUser } from "@/lib/supabase/server";

const timeBlockProposalColumns =
  "id,user_id,area_id,task_id,proposed_start,proposed_end,rationale_json,conflict_flag,conflict_details_json,status,created_at";

interface TimeBlockProposalConflictDetails {
  checked_at: string;
  has_conflict: boolean;
  provider: "google_calendar";
  status: "checked";
}

function assertServerRuntime() {
  const isTestRuntime =
    process.env.VITEST === "true" || process.env.NODE_ENV === "test";

  if (typeof window !== "undefined" && !isTestRuntime) {
    throw new Error("Planning server helpers must stay server-only.");
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

function parseTimeBlockProposal(row: unknown): TimeBlockProposal {
  return TimeBlockProposalSchema.parse(row);
}

export async function getTimeBlockProposalForAccessToken(
  accessToken: string,
  proposalId: string,
) {
  assertServerRuntime();

  const { client } = await requireSupabaseServerUser(accessToken);
  const query = client.from("time_block_proposals") as unknown as {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        single: () => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };

  const { data, error } = await query
    .select(timeBlockProposalColumns)
    .eq("id", proposalId)
    .single();

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  return parseTimeBlockProposal(data);
}

export async function updateTimeBlockProposalConflictForAccessToken(
  accessToken: string,
  proposalId: string,
  conflictDetails: TimeBlockProposalConflictDetails,
  conflictFlag: boolean,
) {
  assertServerRuntime();

  const { client } = await requireSupabaseServerUser(accessToken);
  const query = client.from("time_block_proposals") as unknown as {
    update: (row: Record<string, unknown>) => {
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
      conflict_flag: conflictFlag,
      conflict_details_json: conflictDetails,
    })
    .eq("id", proposalId)
    .select(timeBlockProposalColumns)
    .single();

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  return parseTimeBlockProposal(data);
}
