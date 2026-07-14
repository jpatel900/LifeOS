import {
  CheckTimeBlockProposalConflictInputSchema,
  CreateGoogleCalendarEventInputSchema,
  CreateTimeBlockProposalInputSchema,
  EditTimeBlockProposalInputSchema,
  type CreateGoogleCalendarEventInput,
  type CreateTimeBlockProposalInput,
  type EditTimeBlockProposalInput,
} from "@lifeos/schemas";
import {
  GoogleCalendarEventCreateError,
  type GoogleCalendarEventCreateResult,
  type MinimalSupabaseClient,
  type TimeBlockProposalAcceptResult,
  type TimeBlockProposalConflictCheckResult,
  type TimeBlockProposalCreateResult,
  type TimeBlockProposalUpdateResult,
  getSupabaseMessage,
  mockAreas,
  mockUserId,
  parseCalendarBlock,
  parseTask,
  parseTimeBlockProposal,
  requireSupabaseUser,
  taskColumns,
  timeBlockProposalColumns,
} from "./shared";
import {
  recordOverrideFireAndForget,
  recordSuggestionFireAndForget,
} from "./metaLearning";

export async function createTimeBlockProposal(
  client: MinimalSupabaseClient | null,
  input: CreateTimeBlockProposalInput,
): Promise<TimeBlockProposalCreateResult> {
  const parsedInput = CreateTimeBlockProposalInputSchema.parse(input);

  if (!client) {
    const createdAt = new Date().toISOString();
    return {
      provider: "mock",
      proposal: parseTimeBlockProposal({
        id: crypto.randomUUID(),
        user_id: mockUserId,
        area_id: mockAreas[0]?.id,
        task_id: parsedInput.task_id,
        proposed_start: parsedInput.proposed_start,
        proposed_end: parsedInput.proposed_end,
        rationale_json: { note: parsedInput.rationale_note },
        conflict_flag: false,
        conflict_details_json: null,
        status: "proposed",
        created_at: createdAt,
      }),
    };
  }

  const user = await requireSupabaseUser(
    client,
    "Sign in before creating planning proposals.",
  );

  const taskQuery = client.from("tasks") as {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        single: () => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };

  const { data: taskData, error: taskError } = await taskQuery
    .select(taskColumns)
    .eq("id", parsedInput.task_id)
    .single();
  if (taskError) {
    throw new Error(getSupabaseMessage(taskError));
  }
  const task = parseTask(taskData);

  const proposalQuery = client.from("time_block_proposals") as {
    insert: (row: Record<string, unknown>) => {
      select: (columns: string) => {
        single: () => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };

  const { data, error } = await proposalQuery
    .insert({
      user_id: user.id,
      area_id: task.area_id,
      task_id: task.id,
      proposed_start: parsedInput.proposed_start,
      proposed_end: parsedInput.proposed_end,
      rationale_json: { note: parsedInput.rationale_note },
      conflict_flag: false,
      conflict_details_json: null,
      status: "proposed",
    })
    .select(timeBlockProposalColumns)
    .single();
  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  const proposal = parseTimeBlockProposal(data);
  recordSuggestionFireAndForget(client, {
    area_id: proposal.area_id,
    policy_identifier: "planning.default_time_block",
    suggestion_type: "time_block_proposal",
    subject_type: "time_block_proposal",
    subject_id: proposal.id,
    suggestion_json: {
      task_id: proposal.task_id,
      proposed_start: proposal.proposed_start,
      proposed_end: proposal.proposed_end,
      rationale_json: proposal.rationale_json,
    },
    confidence: null,
    status: "pending",
  });

  return {
    provider: "supabase",
    proposal,
  };
}

export async function editTimeBlockProposal(
  client: MinimalSupabaseClient | null,
  proposalId: string,
  input: EditTimeBlockProposalInput,
): Promise<TimeBlockProposalUpdateResult> {
  const parsedInput = EditTimeBlockProposalInputSchema.parse(input);

  if (!client) {
    throw new Error("Mock proposal edits use the local workflow context.");
  }

  await requireSupabaseUser(
    client,
    "Sign in before editing planning proposals.",
  );

  const query = client.from("time_block_proposals") as {
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
      proposed_start: parsedInput.proposed_start,
      proposed_end: parsedInput.proposed_end,
      status: "edited",
    })
    .eq("id", proposalId)
    .select(timeBlockProposalColumns)
    .single();
  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  const proposal = parseTimeBlockProposal(data);
  recordOverrideFireAndForget(client, {
    area_id: proposal.area_id,
    policy_identifier: "planning.default_time_block",
    subject_type: "time_block_proposal",
    subject_id: proposal.id,
    override_type: "edited",
    old_value_json: {},
    new_value_json: {
      proposed_start: proposal.proposed_start,
      proposed_end: proposal.proposed_end,
      status: proposal.status,
    },
    reason: "User edited a local time-block proposal.",
  });

  return {
    provider: "supabase",
    proposal,
  };
}

export async function rejectTimeBlockProposal(
  client: MinimalSupabaseClient | null,
  proposalId: string,
): Promise<TimeBlockProposalUpdateResult> {
  if (!client) {
    throw new Error("Mock proposal rejection uses the local workflow context.");
  }

  await requireSupabaseUser(
    client,
    "Sign in before rejecting planning proposals.",
  );

  const query = client.from("time_block_proposals") as {
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
    .update({ status: "rejected" })
    .eq("id", proposalId)
    .select(timeBlockProposalColumns)
    .single();
  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  const proposal = parseTimeBlockProposal(data);
  recordOverrideFireAndForget(client, {
    area_id: proposal.area_id,
    policy_identifier: "planning.default_time_block",
    subject_type: "time_block_proposal",
    subject_id: proposal.id,
    override_type: "rejected",
    old_value_json: { status: "proposed" },
    new_value_json: { status: proposal.status },
    reason: "User rejected a local time-block proposal.",
  });

  return {
    provider: "supabase",
    proposal,
  };
}

/**
 * #580 (one planning model — placement wins): best-effort persisted mirror of
 * the local supersede-on-place transition. Marks every still-pending
 * (proposed/edited) proposal row for the task `superseded` — retained, never
 * deleted — so a later `syncPersistedWorkflowRows` cannot resurrect a pending
 * proposal for a task that just received a scheduled block. Call it AFTER the
 * accept RPC so the accepted proposal is already out of the pending set.
 * Status "superseded" is already legal in the DB (time_block_proposals status
 * CHECK constraint) and in TIME_BLOCK_PROPOSAL_STATUSES.
 */
export async function supersedePendingTimeBlockProposalsForTask(
  client: MinimalSupabaseClient | null,
  taskId: string,
): Promise<void> {
  if (!client) {
    return;
  }

  await requireSupabaseUser(
    client,
    "Sign in before updating planning proposals.",
  );

  const query = client.from("time_block_proposals") as {
    update: (row: Record<string, unknown>) => {
      eq: (
        column: string,
        value: string,
      ) => {
        in: (
          column: string,
          values: string[],
        ) => PromiseLike<{ error: unknown }>;
      };
    };
  };

  const { error } = await query
    .update({ status: "superseded" })
    .eq("task_id", taskId)
    .in("status", ["proposed", "edited"]);
  if (error) {
    throw new Error(getSupabaseMessage(error));
  }
}

export async function acceptTimeBlockProposal(
  client: MinimalSupabaseClient | null,
  proposalId: string,
): Promise<TimeBlockProposalAcceptResult> {
  if (!client) {
    throw new Error(
      "Mock proposal acceptance uses the local workflow context.",
    );
  }

  await requireSupabaseUser(
    client,
    "Sign in before accepting planning proposals.",
  );

  if (!client.rpc) {
    throw new Error("Supabase RPC support is unavailable.");
  }

  const { data, error } = await client.rpc("accept_time_block_proposal", {
    p_proposal_id: proposalId,
  });
  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  const result = (data ?? {}) as Record<string, unknown>;
  const proposal = parseTimeBlockProposal(result.proposal);
  const block = parseCalendarBlock(result.block);
  recordOverrideFireAndForget(client, {
    area_id: proposal.area_id,
    policy_identifier: "planning.default_time_block",
    subject_type: "time_block_proposal",
    subject_id: proposal.id,
    override_type: "accepted",
    old_value_json: { status: "proposed" },
    new_value_json: {
      status: proposal.status,
      calendar_block_id: block.id,
      start_at: block.start_at,
      end_at: block.end_at,
    },
    reason: "User accepted a local time-block proposal.",
  });

  return {
    provider: "supabase",
    proposal,
    block,
    task: result.task ? parseTask(result.task) : null,
  };
}

export async function checkTimeBlockProposalConflict(
  client: MinimalSupabaseClient | null,
  proposalId: string,
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
): Promise<TimeBlockProposalConflictCheckResult> {
  const parsedInput = CheckTimeBlockProposalConflictInputSchema.parse({
    proposal_id: proposalId,
    timezone,
  });

  if (!client) {
    throw new Error(
      "Google Calendar conflict checks require Supabase configuration.",
    );
  }

  if (!client.auth?.getSession) {
    throw new Error("Supabase auth is unavailable.");
  }

  const { data, error } = await client.auth.getSession();

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  const accessToken = data.session?.access_token?.trim();

  if (!accessToken) {
    throw new Error("Sign in before checking Google Calendar conflicts.");
  }

  const response = await fetch("/api/google-calendar/freebusy", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(parsedInput),
  });
  const payload = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;

  if (!response.ok) {
    throw new Error(
      typeof payload?.error === "string"
        ? payload.error
        : "Google Calendar conflict check failed.",
    );
  }

  return {
    provider: "supabase",
    proposal: parseTimeBlockProposal(payload?.proposal),
    hasConflict: Boolean(payload?.has_conflict),
    checkedAt:
      typeof payload?.checked_at === "string"
        ? payload.checked_at
        : new Date().toISOString(),
  };
}

export async function createGoogleCalendarEventFromProposal(
  client: MinimalSupabaseClient | null,
  input: CreateGoogleCalendarEventInput,
): Promise<GoogleCalendarEventCreateResult> {
  const parsedInput = CreateGoogleCalendarEventInputSchema.parse(input);

  if (!client) {
    throw new Error(
      "Google Calendar event creation requires Supabase configuration.",
    );
  }

  if (!client.auth?.getSession) {
    throw new Error("Supabase auth is unavailable.");
  }

  const { data, error } = await client.auth.getSession();

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  const accessToken = data.session?.access_token?.trim();

  if (!accessToken) {
    throw new Error("Sign in before creating Google Calendar events.");
  }

  const response = await fetch("/api/google-calendar/create-event", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(parsedInput),
  });
  const payload = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;

  if (!response.ok) {
    throw new GoogleCalendarEventCreateError(
      typeof payload?.error === "string"
        ? payload.error
        : "Google Calendar event could not be created.",
      response.status,
    );
  }

  const block = parseCalendarBlock(payload?.block);
  const googleEventId =
    typeof payload?.google_event_id === "string"
      ? payload.google_event_id
      : block.google_event_id;

  if (!googleEventId) {
    throw new Error(
      "Google Calendar event response did not include an event id.",
    );
  }

  return {
    provider: "supabase",
    proposal: parseTimeBlockProposal(payload?.proposal),
    block,
    googleEventId,
  };
}
