import {
  CalendarBlockSchema,
  TaskSchema,
  TimeBlockProposalSchema,
  type CalendarBlock,
  type Task,
  type TimeBlockProposal,
} from "@lifeos/schemas";
import { requireSupabaseServerUser } from "@/lib/supabase/server";

const timeBlockProposalColumns =
  "id,user_id,area_id,task_id,proposed_start,proposed_end,rationale_json,conflict_flag,conflict_details_json,status,created_at";
const calendarBlockColumns =
  "id,user_id,area_id,proposal_id,task_id,google_event_id,start_at,end_at,status,created_at,updated_at";
const taskColumns =
  "id,user_id,area_id,project_id,source_capture_item_id,title,description,status,priority_score,priority_confidence,task_type,is_reversible,energy_type,estimated_minutes_low,estimated_minutes_high,due_at,definition_of_done,first_tiny_step,created_at,updated_at";

interface TimeBlockProposalConflictDetails {
  all_day_contexts?: {
    date: string;
    endDate: string;
    id: string;
    summary: string;
  }[];
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

function parseCalendarBlock(row: unknown): CalendarBlock {
  return CalendarBlockSchema.parse(row);
}

function parseTask(row: unknown): Task {
  return TaskSchema.parse(row);
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

export async function getTaskForAccessToken(
  accessToken: string,
  taskId: string,
) {
  assertServerRuntime();

  const { client } = await requireSupabaseServerUser(accessToken);
  const query = client.from("tasks") as unknown as {
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
    .select(taskColumns)
    .eq("id", taskId)
    .single();

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  return parseTask(data);
}

export async function getCalendarBlockForProposalForAccessToken(
  accessToken: string,
  proposalId: string,
) {
  assertServerRuntime();

  const { client } = await requireSupabaseServerUser(accessToken);
  const query = client.from("calendar_blocks") as unknown as {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };

  const { data, error } = await query
    .select(calendarBlockColumns)
    .eq("proposal_id", proposalId)
    .maybeSingle();

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  return data ? parseCalendarBlock(data) : null;
}

export async function getCalendarBlockForAccessToken(
  accessToken: string,
  blockId: string,
) {
  assertServerRuntime();

  const { client } = await requireSupabaseServerUser(accessToken);
  const query = client.from("calendar_blocks") as unknown as {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };

  const { data, error } = await query
    .select(calendarBlockColumns)
    .eq("id", blockId)
    .maybeSingle();

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  return data ? parseCalendarBlock(data) : null;
}

export async function markCalendarBlockCancelledForAccessToken(
  accessToken: string,
  blockId: string,
) {
  assertServerRuntime();

  const { client } = await requireSupabaseServerUser(accessToken);
  const query = client.from("calendar_blocks") as unknown as {
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
    .update({ status: "cancelled" })
    .eq("id", blockId)
    .select(calendarBlockColumns)
    .single();

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  return parseCalendarBlock(data);
}

export async function createCalendarBlockForProposalForAccessToken(
  accessToken: string,
  proposal: TimeBlockProposal,
  googleEventId: string,
) {
  assertServerRuntime();

  const { client } = await requireSupabaseServerUser(accessToken);
  const query = client.from("calendar_blocks") as unknown as {
    upsert: (
      row: Record<string, unknown>,
      options: { onConflict: string },
    ) => {
      select: (columns: string) => {
        single: () => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };

  const { data, error } = await query
    .upsert(
      {
        area_id: proposal.area_id,
        end_at: proposal.proposed_end,
        google_event_id: googleEventId,
        proposal_id: proposal.id,
        start_at: proposal.proposed_start,
        status: "scheduled",
        task_id: proposal.task_id,
        user_id: proposal.user_id,
      },
      { onConflict: "proposal_id" },
    )
    .select(calendarBlockColumns)
    .single();

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  return parseCalendarBlock(data);
}

export async function updateCalendarBlockGoogleEventForAccessToken(
  accessToken: string,
  blockId: string,
  googleEventId: string,
) {
  assertServerRuntime();

  const { client } = await requireSupabaseServerUser(accessToken);
  const query = client.from("calendar_blocks") as unknown as {
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
    .update({ google_event_id: googleEventId })
    .eq("id", blockId)
    .select(calendarBlockColumns)
    .single();

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  return parseCalendarBlock(data);
}

export async function markTimeBlockProposalAcceptedForAccessToken(
  accessToken: string,
  proposalId: string,
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
    .update({ status: "accepted" })
    .eq("id", proposalId)
    .select(timeBlockProposalColumns)
    .single();

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  return parseTimeBlockProposal(data);
}

/**
 * Calendar hunt #1: a scheduled, Google-backed block this task already has,
 * from any proposal — or null. Used to refuse a second Google event for one
 * task before anything is written to Google.
 */
export async function findGoogleBackedScheduledBlockForTaskForAccessToken(
  accessToken: string,
  taskId: string,
) {
  assertServerRuntime();

  const { client } = await requireSupabaseServerUser(accessToken);
  const query = client.from("calendar_blocks") as unknown as {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        eq: (
          column: string,
          value: string,
        ) => {
          not: (
            column: string,
            operator: string,
            value: null,
          ) => {
            limit: (
              count: number,
            ) => Promise<{ data: unknown; error: unknown }>;
          };
        };
      };
    };
  };

  const { data, error } = await query
    .select(calendarBlockColumns)
    .eq("task_id", taskId)
    .eq("status", "scheduled")
    .not("google_event_id", "is", null)
    .limit(1);

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  const rows = Array.isArray(data) ? data : [];
  return rows.length > 0 ? parseCalendarBlock(rows[0]) : null;
}

/**
 * Calendar hunt #1: record the account half of an approved, already-inserted
 * Google event in ONE transaction (`record_google_calendar_placement`): the
 * block gains its google_event_id, the proposal is accepted, the task's other
 * pending proposals are superseded and the task is scheduled — the same
 * semantics as `place_time_block`.
 */
export async function recordGoogleCalendarPlacementForAccessToken(
  accessToken: string,
  proposalId: string,
  googleEventId: string,
): Promise<{
  proposal: TimeBlockProposal;
  block: CalendarBlock;
  task: Task | null;
}> {
  assertServerRuntime();

  const { client } = await requireSupabaseServerUser(accessToken);
  const rpc = (
    client as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: unknown }>;
    }
  ).rpc.bind(client);

  const { data, error } = await rpc("record_google_calendar_placement", {
    p_proposal_id: proposalId,
    p_google_event_id: googleEventId,
  });

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  const payload = (data ?? {}) as Record<string, unknown>;
  return {
    proposal: parseTimeBlockProposal(payload.proposal),
    block: parseCalendarBlock(payload.block),
    task: payload.task ? parseTask(payload.task) : null,
  };
}
