import {
  CreateDurationProfileInputSchema,
  CreateRollupSummaryInputSchema,
  CreateWinRecordInputSchema,
  ProjectSchema,
  type CreateDurationProfileInput,
  type CreateRollupSummaryInput,
  type CreateWinRecordInput,
} from "@lifeos/schemas";
import { normalizeSupabaseRows } from "../supabaseRowNormalization";
import {
  type DurationProfileUpsertResult,
  type DurationProfilesResult,
  type MinimalSupabaseClient,
  type RollupSummariesResult,
  type RollupSummaryCreateResult,
  type WinHarvestCandidate,
  type WinHarvestCandidatesResult,
  type WinRecordCreateResult,
  type WinRecordsResult,
  durationProfileColumns,
  getSupabaseMessage,
  mockUserId,
  parseDurationProfile,
  parseDurationProfiles,
  parseRollupSummaries,
  parseRollupSummary,
  parseTasks,
  parseWinRecord,
  parseWinRecords,
  projectColumns,
  requireSupabaseUser,
  rollupSummaryColumns,
  taskColumns,
  winRecordColumns,
} from "./shared";

// Wins are only ever written on explicit user confirm (issue #259). No AI drafts
// or auto-harvest here: this records a single user-confirmed win.
export async function createWinRecord(
  client: MinimalSupabaseClient | null,
  input: CreateWinRecordInput,
): Promise<WinRecordCreateResult> {
  const parsedInput = CreateWinRecordInputSchema.parse(input);

  if (!client) {
    return {
      provider: "mock",
      winRecord: parseWinRecord({
        id: crypto.randomUUID(),
        user_id: mockUserId,
        area_id: parsedInput.area_id,
        source_task_id: parsedInput.source_task_id,
        source_project_id: parsedInput.source_project_id,
        title: parsedInput.title,
        detail: parsedInput.detail,
        occurred_at: parsedInput.occurred_at,
        review_entry_id: parsedInput.review_entry_id,
        created_at: new Date().toISOString(),
      }),
    };
  }

  const user = await requireSupabaseUser(
    client,
    "Sign in before recording wins.",
  );

  const query = client.from("win_records") as {
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
      source_task_id: parsedInput.source_task_id,
      source_project_id: parsedInput.source_project_id,
      title: parsedInput.title,
      detail: parsedInput.detail,
      occurred_at: parsedInput.occurred_at,
      review_entry_id: parsedInput.review_entry_id,
    })
    .select(winRecordColumns)
    .single();
  if (error) throw new Error(getSupabaseMessage(error));

  return {
    provider: "supabase",
    winRecord: parseWinRecord(data),
  };
}

// Candidate wins for the weekly-review harvest step: tasks and projects the user
// marked done since `since` (the review period start) that have not already been
// harvested into a win_record. RLS bounds every read to the signed-in user.
export async function listWinHarvestCandidates(
  client: MinimalSupabaseClient | null,
  since: string,
): Promise<WinHarvestCandidatesResult> {
  if (!client) {
    return { provider: "mock", candidates: [] };
  }

  await requireSupabaseUser(client, "Sign in before harvesting wins.");

  type DoneQuery = {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
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
    };
  };
  const tasksQuery = client.from("tasks") as DoneQuery;
  const projectsQuery = client.from("projects") as DoneQuery;
  const winsQuery = client.from("win_records") as {
    select: (columns: string) => Promise<{ data: unknown; error: unknown }>;
  };

  const { data: tasks, error: tasksError } = await tasksQuery
    .select(taskColumns)
    .eq("status", "done")
    .gte("updated_at", since)
    .order("updated_at", { ascending: false });
  if (tasksError) throw new Error(getSupabaseMessage(tasksError));

  const { data: projects, error: projectsError } = await projectsQuery
    .select(projectColumns)
    .eq("status", "done")
    .gte("updated_at", since)
    .order("updated_at", { ascending: false });
  if (projectsError) throw new Error(getSupabaseMessage(projectsError));

  const { data: existingWins, error: winsError } = await winsQuery.select(
    "source_task_id,source_project_id",
  );
  if (winsError) throw new Error(getSupabaseMessage(winsError));

  const harvestedTaskIds = new Set<string>();
  const harvestedProjectIds = new Set<string>();
  for (const row of normalizeSupabaseRows(existingWins) as Array<
    Record<string, unknown>
  >) {
    if (typeof row.source_task_id === "string")
      harvestedTaskIds.add(row.source_task_id);
    if (typeof row.source_project_id === "string")
      harvestedProjectIds.add(row.source_project_id);
  }

  const toCalendarDate = (iso: string) =>
    new Date(iso).toISOString().slice(0, 10);

  const candidates: WinHarvestCandidate[] = [
    ...parseTasks(tasks)
      .filter((task) => !harvestedTaskIds.has(task.id))
      .map((task) => ({
        source_type: "task" as const,
        source_id: task.id,
        area_id: task.area_id,
        title: task.title,
        occurred_at: toCalendarDate(task.updated_at),
      })),
    ...ProjectSchema.array()
      .parse(normalizeSupabaseRows(projects))
      .filter((project) => !harvestedProjectIds.has(project.id))
      .map((project) => ({
        source_type: "project" as const,
        source_id: project.id,
        area_id: project.area_id,
        title: project.title,
        occurred_at: toCalendarDate(project.updated_at),
      })),
  ];

  return { provider: "supabase", candidates };
}

// The wins reading section for weekly/monthly review: most-recent first.
export async function listWinRecords(
  client: MinimalSupabaseClient | null,
): Promise<WinRecordsResult> {
  if (!client) {
    return { provider: "mock", winRecords: [] };
  }

  await requireSupabaseUser(client, "Sign in before loading wins.");

  const query = client.from("win_records") as {
    select: (columns: string) => {
      order: (
        column: string,
        options: { ascending: boolean },
      ) => Promise<{ data: unknown; error: unknown }>;
    };
  };
  const { data, error } = await query
    .select(winRecordColumns)
    .order("occurred_at", { ascending: false });
  if (error) throw new Error(getSupabaseMessage(error));

  return { provider: "supabase", winRecords: parseWinRecords(data) };
}

// S8 (#260): persist a user-APPROVED rollup (NS-INV-4 — drafts never reach
// here; only an approved rollup is written). Weekly or monthly.
export async function createRollupSummary(
  client: MinimalSupabaseClient | null,
  input: CreateRollupSummaryInput,
): Promise<RollupSummaryCreateResult> {
  const parsedInput = CreateRollupSummaryInputSchema.parse(input);

  if (!client) {
    return {
      provider: "mock",
      rollupSummary: parseRollupSummary({
        id: crypto.randomUUID(),
        user_id: mockUserId,
        area_id: parsedInput.area_id,
        period_type: parsedInput.period_type,
        period_start: parsedInput.period_start,
        period_end: parsedInput.period_end,
        summary: parsedInput.summary,
        created_at: new Date().toISOString(),
      }),
    };
  }

  const user = await requireSupabaseUser(
    client,
    "Sign in before saving rollups.",
  );

  const query = client.from("rollup_summaries") as {
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
      period_type: parsedInput.period_type,
      period_start: parsedInput.period_start,
      period_end: parsedInput.period_end,
      summary: parsedInput.summary,
    })
    .select(rollupSummaryColumns)
    .single();
  if (error) throw new Error(getSupabaseMessage(error));

  return {
    provider: "supabase",
    rollupSummary: parseRollupSummary(data),
  };
}

// Approved rollups for the review reading section (week-vs-week / month-over-
// month) and as the rollup context source (NS-INV-1). Most-recent first.
export async function listRollupSummaries(
  client: MinimalSupabaseClient | null,
): Promise<RollupSummariesResult> {
  if (!client) {
    return { provider: "mock", rollupSummaries: [] };
  }

  await requireSupabaseUser(client, "Sign in before loading rollups.");

  const query = client.from("rollup_summaries") as {
    select: (columns: string) => {
      order: (
        column: string,
        options: { ascending: boolean },
      ) => Promise<{ data: unknown; error: unknown }>;
    };
  };
  const { data, error } = await query
    .select(rollupSummaryColumns)
    .order("period_start", { ascending: false });
  if (error) throw new Error(getSupabaseMessage(error));

  return {
    provider: "supabase",
    rollupSummaries: parseRollupSummaries(data),
  };
}

export async function listDurationProfiles(
  client: MinimalSupabaseClient | null,
): Promise<DurationProfilesResult> {
  if (!client) {
    return { provider: "mock", durationProfiles: [] };
  }

  await requireSupabaseUser(
    client,
    "Sign in before loading duration profiles.",
  );

  const query = client.from("duration_profiles") as {
    select: (columns: string) => {
      order: (
        column: string,
        options: { ascending: boolean },
      ) => Promise<{ data: unknown; error: unknown }>;
    };
  };
  const { data, error } = await query
    .select(durationProfileColumns)
    .order("last_updated_at", { ascending: false });
  if (error) throw new Error(getSupabaseMessage(error));

  return {
    provider: "supabase",
    durationProfiles: parseDurationProfiles(data),
  };
}

export async function upsertDurationProfile(
  client: MinimalSupabaseClient | null,
  input: CreateDurationProfileInput,
): Promise<DurationProfileUpsertResult> {
  const parsedInput = CreateDurationProfileInputSchema.parse(input);

  if (!client) {
    return {
      provider: "mock",
      durationProfile: parseDurationProfile({
        id: crypto.randomUUID(),
        user_id: mockUserId,
        area_id: parsedInput.area_id,
        task_type: parsedInput.task_type,
        estimate_stats_json: parsedInput.estimate_stats,
        sample_count: parsedInput.sample_count,
        last_updated_at: new Date().toISOString(),
      }),
    };
  }

  const user = await requireSupabaseUser(
    client,
    "Sign in before saving duration profiles.",
  );

  const query = client.from("duration_profiles") as {
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
        user_id: user.id,
        area_id: parsedInput.area_id,
        task_type: parsedInput.task_type,
        estimate_stats_json: parsedInput.estimate_stats,
        sample_count: parsedInput.sample_count,
      },
      { onConflict: "user_id,area_id,task_type" },
    )
    .select(durationProfileColumns)
    .single();
  if (error) throw new Error(getSupabaseMessage(error));

  return {
    provider: "supabase",
    durationProfile: parseDurationProfile(data),
  };
}
