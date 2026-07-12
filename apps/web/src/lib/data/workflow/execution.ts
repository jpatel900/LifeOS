import {
  CreateExecutionSessionInputSchema,
  CreateReviewEntryInputSchema,
  MarkExecutionSessionInputSchema,
  type CreateExecutionSessionInput,
  type CreateReviewEntryInput,
  type ExecutionSession,
  type MarkExecutionSessionInput,
} from "@lifeos/schemas";
import {
  type CalendarBlockUnplanResult,
  type ExecutionReviewItemsResult,
  type ExecutionSessionCreateResult,
  type ExecutionSessionMarkResult,
  type MinimalSupabaseClient,
  type ReviewEntryCreateResult,
  type ReviewTaskTargetStatus,
  type TaskReviewTransitionResult,
  calendarBlockColumns,
  executionSessionColumns,
  getSupabaseMessage,
  mockAreas,
  mockUserId,
  parseCalendarBlock,
  parseCalendarBlocks,
  parseExecutionSession,
  parseExecutionSessions,
  parseReviewEntries,
  parseReviewEntry,
  parseTask,
  parseTasks,
  requireSupabaseUser,
  reviewEntryColumns,
  taskColumns,
} from "./shared";

function mockExecutionSession(input: CreateExecutionSessionInput) {
  return parseExecutionSession({
    id: crypto.randomUUID(),
    user_id: mockUserId,
    area_id: mockAreas[0]?.id,
    task_id: input.task_id,
    calendar_block_id: input.calendar_block_id ?? null,
    planned_minutes: null,
    actual_minutes: null,
    paused_minutes: 0,
    distraction_minutes: 0,
    productivity_rating: null,
    energy_rating: null,
    outcome: "partial",
    cap_outcome: null,
    notes: null,
    created_at: new Date().toISOString(),
  });
}

export async function listExecutionReviewItems(
  client: MinimalSupabaseClient | null,
): Promise<ExecutionReviewItemsResult> {
  if (!client) {
    return {
      provider: "mock",
      tasks: [],
      blocks: [],
      sessions: [],
      reviewEntries: [],
    };
  }

  await requireSupabaseUser(client, "Sign in before loading execution rows.");

  const tasksQuery = client.from("tasks") as {
    select: (columns: string) => {
      order: (
        column: string,
        options: { ascending: boolean },
      ) => Promise<{ data: unknown; error: unknown }>;
    };
  };
  const blocksQuery = client.from("calendar_blocks") as {
    select: (columns: string) => {
      order: (
        column: string,
        options: { ascending: boolean },
      ) => Promise<{ data: unknown; error: unknown }>;
    };
  };
  const sessionsQuery = client.from("execution_sessions") as {
    select: (columns: string) => {
      order: (
        column: string,
        options: { ascending: boolean },
      ) => Promise<{ data: unknown; error: unknown }>;
    };
  };
  const reviewsQuery = client.from("review_entries") as {
    select: (columns: string) => {
      order: (
        column: string,
        options: { ascending: boolean },
      ) => Promise<{ data: unknown; error: unknown }>;
    };
  };

  const { data: tasks, error: tasksError } = await tasksQuery
    .select(taskColumns)
    .order("updated_at", { ascending: false });
  if (tasksError) throw new Error(getSupabaseMessage(tasksError));

  const { data: blocks, error: blocksError } = await blocksQuery
    .select(calendarBlockColumns)
    .order("start_at", { ascending: true });
  if (blocksError) throw new Error(getSupabaseMessage(blocksError));

  const { data: sessions, error: sessionsError } = await sessionsQuery
    .select(executionSessionColumns)
    .order("created_at", { ascending: false });
  if (sessionsError) throw new Error(getSupabaseMessage(sessionsError));

  const { data: reviews, error: reviewsError } = await reviewsQuery
    .select(reviewEntryColumns)
    .order("created_at", { ascending: false });
  if (reviewsError) throw new Error(getSupabaseMessage(reviewsError));

  return {
    provider: "supabase",
    tasks: parseTasks(tasks),
    blocks: parseCalendarBlocks(blocks),
    sessions: parseExecutionSessions(sessions),
    reviewEntries: parseReviewEntries(reviews),
  };
}

export async function createExecutionSession(
  client: MinimalSupabaseClient | null,
  input: CreateExecutionSessionInput,
): Promise<ExecutionSessionCreateResult> {
  const parsedInput = CreateExecutionSessionInputSchema.parse(input);

  if (!client) {
    return {
      provider: "mock",
      session: mockExecutionSession(parsedInput),
      block: null,
    };
  }

  await requireSupabaseUser(
    client,
    "Sign in before starting execution sessions.",
  );

  if (!client.rpc) {
    throw new Error("Supabase RPC support is unavailable.");
  }

  const { data, error } = await client.rpc("start_execution_session", {
    p_task_id: parsedInput.task_id,
    p_calendar_block_id: parsedInput.calendar_block_id ?? null,
  });
  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  const result = (data ?? {}) as Record<string, unknown>;
  return {
    provider: "supabase",
    session: parseExecutionSession(result.session),
    block: result.block ? parseCalendarBlock(result.block) : null,
  };
}

function executionMarkPatch(
  session: ExecutionSession,
  input: MarkExecutionSessionInput,
) {
  if (input.status === "paused") {
    return {
      outcome: "partial",
      actual_minutes: session.actual_minutes,
      paused_minutes: session.paused_minutes ?? 0,
      distraction_minutes: session.distraction_minutes ?? 0,
      productivity_rating: session.productivity_rating,
      cap_outcome: session.cap_outcome ?? null,
      notes: session.notes,
    };
  }

  return {
    outcome: input.outcome,
    actual_minutes: input.actual_minutes,
    paused_minutes: session.paused_minutes ?? 0,
    distraction_minutes: session.distraction_minutes ?? 0,
    productivity_rating: input.productivity_rating,
    cap_outcome: input.cap_outcome ?? null,
    notes: input.notes,
  };
}

export async function markExecutionSession(
  client: MinimalSupabaseClient | null,
  sessionId: string,
  input: MarkExecutionSessionInput,
): Promise<ExecutionSessionMarkResult> {
  const parsedInput = MarkExecutionSessionInputSchema.parse(input);

  if (!client) {
    const mockBaseSession = mockExecutionSession({
      task_id: crypto.randomUUID(),
    });
    const mockPatch = executionMarkPatch(mockBaseSession, parsedInput);
    const session = parseExecutionSession({
      id: sessionId,
      user_id: mockUserId,
      area_id: mockAreas[0]?.id,
      task_id: null,
      calendar_block_id: null,
      planned_minutes: null,
      actual_minutes: mockPatch.actual_minutes,
      paused_minutes: 0,
      distraction_minutes: 0,
      productivity_rating: mockPatch.productivity_rating,
      energy_rating: null,
      outcome: mockPatch.outcome,
      cap_outcome: mockPatch.cap_outcome,
      notes: mockPatch.notes,
      created_at: new Date().toISOString(),
    });
    return { provider: "mock", session, block: null, task: null };
  }

  await requireSupabaseUser(
    client,
    "Sign in before updating execution sessions.",
  );

  const sessionReadQuery = client.from("execution_sessions") as {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        single: () => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };
  const { data: sessionData, error: sessionReadError } = await sessionReadQuery
    .select(executionSessionColumns)
    .eq("id", sessionId)
    .single();
  if (sessionReadError) throw new Error(getSupabaseMessage(sessionReadError));
  const currentSession = parseExecutionSession(sessionData);

  const patch = executionMarkPatch(currentSession, parsedInput);

  if (!client.rpc) {
    throw new Error("Supabase RPC support is unavailable.");
  }

  const { data, error } = await client.rpc("apply_execution_session_outcome", {
    p_session_id: sessionId,
    p_outcome: patch.outcome,
    p_actual_minutes: patch.actual_minutes,
    p_paused_minutes: patch.paused_minutes,
    p_distraction_minutes: patch.distraction_minutes,
    p_productivity_rating: patch.productivity_rating,
    p_notes: patch.notes,
    p_cap_outcome: patch.cap_outcome,
  });
  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  const result = (data ?? {}) as Record<string, unknown>;
  return {
    provider: "supabase",
    session: parseExecutionSession(result.session),
    block: result.block ? parseCalendarBlock(result.block) : null,
    task: result.task ? parseTask(result.task) : null,
  };
}

export async function unplanCalendarBlock(
  client: MinimalSupabaseClient | null,
  blockId: string,
): Promise<CalendarBlockUnplanResult> {
  if (!client) {
    throw new Error("Mock unplanning uses the local workflow context.");
  }

  await requireSupabaseUser(client, "Sign in before unplanning blocks.");

  if (!client.rpc) {
    throw new Error("Supabase RPC support is unavailable.");
  }

  const { data, error } = await client.rpc("unplan_calendar_block", {
    p_block_id: blockId,
  });
  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  const result = (data ?? {}) as Record<string, unknown>;
  return {
    provider: "supabase",
    block: parseCalendarBlock(result.block),
    task: result.task ? parseTask(result.task) : null,
  };
}

export async function applyTaskReviewTransition(
  client: MinimalSupabaseClient | null,
  taskId: string,
  targetStatus: ReviewTaskTargetStatus,
): Promise<TaskReviewTransitionResult> {
  if (!client) {
    throw new Error("Mock review task transitions use local workflow state.");
  }

  if (!["active", "backlog", "dropped"].includes(targetStatus)) {
    throw new Error("Review task target status is not supported.");
  }

  await requireSupabaseUser(
    client,
    "Sign in before saving review task choices.",
  );

  if (!client.rpc) {
    throw new Error("Supabase RPC support is unavailable.");
  }

  const { data, error } = await client.rpc("apply_task_review_transition", {
    p_task_id: taskId,
    p_target_status: targetStatus,
  });
  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  const result = (data ?? {}) as Record<string, unknown>;
  return {
    provider: "supabase",
    task: parseTask(result.task),
    blocks: parseCalendarBlocks(result.blocks ?? []),
  };
}

export async function createReviewEntry(
  client: MinimalSupabaseClient | null,
  input: CreateReviewEntryInput,
): Promise<ReviewEntryCreateResult> {
  const parsedInput = CreateReviewEntryInputSchema.parse(input);

  if (!client) {
    return {
      provider: "mock",
      reviewEntry: parseReviewEntry({
        id: crypto.randomUUID(),
        user_id: mockUserId,
        area_id: parsedInput.area_id,
        review_type: parsedInput.review_type,
        period_start: parsedInput.period_start,
        period_end: parsedInput.period_end,
        summary_json: parsedInput.summary_json,
        created_at: new Date().toISOString(),
      }),
    };
  }

  const user = await requireSupabaseUser(
    client,
    "Sign in before creating review entries.",
  );

  const query = client.from("review_entries") as {
    insert: (row: Record<string, unknown>) => {
      select: (columns: string) => {
        single: () => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };
  const { data, error } = await query
    .insert({
      user_id: user.id,
      area_id: parsedInput.area_id,
      review_type: parsedInput.review_type,
      period_start: parsedInput.period_start,
      period_end: parsedInput.period_end,
      summary_json: parsedInput.summary_json,
    })
    .select(reviewEntryColumns)
    .single();
  if (error) throw new Error(getSupabaseMessage(error));

  return {
    provider: "supabase",
    reviewEntry: parseReviewEntry(data),
  };
}
