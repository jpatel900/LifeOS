import {
  AreaSchema,
  CalendarBlockSchema,
  CheckTimeBlockProposalConflictInputSchema,
  CaptureItemSchema,
  CreateAreaInputSchema,
  CreateExecutionSessionInputSchema,
  CreateGoogleCalendarEventInputSchema,
  CreateOverrideRecordInputSchema,
  CreateSuggestionRecordInputSchema,
  CreateTimeBlockProposalInputSchema,
  EditTimeBlockProposalInputSchema,
  CreateProjectInputSchema,
  CreateCaptureItemInputSchema,
  CreateReviewEntryInputSchema,
  CreateTaskInputSchema,
  ExecutionSessionSchema,
  MarkExecutionSessionInputSchema,
  ProjectSchema,
  ReviewEntrySchema,
  SoftDeleteAreaInputSchema,
  TaskSchema,
  TimeBlockProposalSchema,
  UpdateAreaColorInputSchema,
  type Area,
  type CalendarBlock,
  type CaptureItem,
  type CreateAreaInput,
  type CreateExecutionSessionInput,
  type CreateGoogleCalendarEventInput,
  type CreateOverrideRecordInput,
  type CreateSuggestionRecordInput,
  type CreateTimeBlockProposalInput,
  type EditTimeBlockProposalInput,
  type CreateProjectInput,
  type CreateCaptureItemInput,
  type CreateReviewEntryInput,
  type CreateTaskInput,
  type ExecutionSession,
  type MarkExecutionSessionInput,
  type Project,
  type ReviewEntry,
  type SoftDeleteAreaInput,
  type Task,
  type TimeBlockProposal,
  type UpdateAreaColorInput,
} from "@lifeos/schemas";
import {
  normalizeSupabaseRow,
  normalizeSupabaseRows,
} from "./supabaseRowNormalization";

export type DataProvider = "mock" | "supabase";

export interface DataResult<T> {
  provider: DataProvider;
  data: T;
}

export interface AreaListResult {
  provider: DataProvider;
  areas: Area[];
}

export interface AreaCreateResult {
  provider: DataProvider;
  area: Area;
}

export interface AreaSoftDeleteResult {
  provider: DataProvider;
  area: Area;
}

export interface AreaColorUpdateResult {
  provider: DataProvider;
  area: Area;
}

export interface CaptureCreateResult {
  provider: DataProvider;
  capture: CaptureItem;
}

export interface CaptureListResult {
  provider: DataProvider;
  captures: CaptureItem[];
}

export interface TaskCreateResult {
  provider: DataProvider;
  task: Task;
}

export interface ProjectCreateResult {
  provider: DataProvider;
  project: Project;
}

export interface PlanningItemsResult {
  provider: DataProvider;
  tasks: Task[];
  proposals: TimeBlockProposal[];
  blocks: CalendarBlock[];
}

export interface TimeBlockProposalCreateResult {
  provider: DataProvider;
  proposal: TimeBlockProposal;
}

export interface TimeBlockProposalUpdateResult {
  provider: DataProvider;
  proposal: TimeBlockProposal;
}

export interface TimeBlockProposalAcceptResult {
  provider: DataProvider;
  proposal: TimeBlockProposal;
  block: CalendarBlock;
  task: Task | null;
}

export interface TimeBlockProposalConflictCheckResult {
  provider: DataProvider;
  proposal: TimeBlockProposal;
  hasConflict: boolean;
  checkedAt: string;
}

export interface GoogleCalendarEventCreateResult {
  provider: DataProvider;
  proposal: TimeBlockProposal;
  block: CalendarBlock;
  googleEventId: string;
}

export interface ExecutionReviewItemsResult {
  provider: DataProvider;
  tasks: Task[];
  blocks: CalendarBlock[];
  sessions: ExecutionSession[];
  reviewEntries: ReviewEntry[];
}

export interface ExecutionSessionCreateResult {
  provider: DataProvider;
  session: ExecutionSession;
  block: CalendarBlock | null;
}

export interface ExecutionSessionMarkResult {
  provider: DataProvider;
  session: ExecutionSession;
  block: CalendarBlock | null;
  task: Task | null;
}

export interface ReviewEntryCreateResult {
  provider: DataProvider;
  reviewEntry: ReviewEntry;
}

export type ReviewTaskTargetStatus = Extract<
  Task["status"],
  "active" | "backlog" | "dropped"
>;

export interface CalendarBlockUnplanResult {
  provider: DataProvider;
  block: CalendarBlock;
  task: Task | null;
}

export interface TaskReviewTransitionResult {
  provider: DataProvider;
  task: Task;
  blocks: CalendarBlock[];
}

export interface MinimalSupabaseClient {
  from: (table: string) => unknown;
  rpc?: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
  auth?: {
    getSession?: () => Promise<{
      data: {
        session: {
          access_token: string;
        } | null;
      };
      error: { message: string } | null;
    }>;
    getUser: () => Promise<{
      data: { user: { id: string } | null };
      error: { message: string } | null;
    }>;
  };
}

const mockUserId = "00000000-0000-4000-8000-000000000001";

export const mockAreas: Area[] = [
  {
    id: "00000000-0000-4000-8000-000000000101",
    user_id: mockUserId,
    name: "Main Job",
    slug: "main-job",
    description: "Work commitments and job-related projects.",
    color: "#2563eb",
    icon: "briefcase",
    sort_order: 0,
    is_active: true,
    created_at: "2026-05-07T00:00:00.000Z",
    updated_at: "2026-05-07T00:00:00.000Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000102",
    user_id: mockUserId,
    name: "Personal",
    slug: "personal",
    description: "Home, health, errands, and personal admin.",
    color: "#16a34a",
    icon: "home",
    sort_order: 1,
    is_active: true,
    created_at: "2026-05-07T00:00:00.000Z",
    updated_at: "2026-05-07T00:00:00.000Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000103",
    user_id: mockUserId,
    name: "Volunteer Work",
    slug: "volunteer-work",
    description: "Community commitments and volunteer follow-ups.",
    color: "#9333ea",
    icon: "heart",
    sort_order: 2,
    is_active: true,
    created_at: "2026-05-07T00:00:00.000Z",
    updated_at: "2026-05-07T00:00:00.000Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000104",
    user_id: mockUserId,
    name: "Side Project",
    slug: "side-project",
    description: "Independent builds, experiments, and optional projects.",
    color: "#f97316",
    icon: "rocket",
    sort_order: 3,
    is_active: true,
    created_at: "2026-05-07T00:00:00.000Z",
    updated_at: "2026-05-07T00:00:00.000Z",
  },
];

const areaColumns =
  "id,user_id,name,slug,description,color,icon,sort_order,is_active,created_at,updated_at";

const captureColumns =
  "id,user_id,area_id,raw_text,raw_audio_ref,capture_mode,inferred_area_confidence,status,created_at";

const taskColumns =
  "id,user_id,area_id,project_id,source_capture_item_id,title,description,status,priority_score,priority_confidence,task_type,energy_type,estimated_minutes_low,estimated_minutes_high,due_at,definition_of_done,first_tiny_step,created_at,updated_at";

const projectColumns =
  "id,user_id,area_id,title,description,status,created_at,updated_at";

const timeBlockProposalColumns =
  "id,user_id,area_id,task_id,proposed_start,proposed_end,rationale_json,conflict_flag,conflict_details_json,status,created_at";

const calendarBlockColumns =
  "id,user_id,area_id,proposal_id,task_id,google_event_id,start_at,end_at,status,created_at,updated_at";

const executionSessionColumns =
  "id,user_id,area_id,task_id,calendar_block_id,planned_minutes,actual_minutes,paused_minutes,distraction_minutes,productivity_rating,energy_rating,outcome,notes,created_at";

const reviewEntryColumns =
  "id,user_id,area_id,review_type,period_start,period_end,summary_json,created_at";

const suggestionRecordColumns =
  "id,user_id,area_id,policy_identifier,schema_version,suggestion_type,subject_type,subject_id,suggestion_json,confidence,status,created_at,resolved_at";

const overrideRecordColumns =
  "id,user_id,area_id,policy_identifier,schema_version,subject_type,subject_id,override_type,old_value_json,new_value_json,reason,created_at";

function parseAreas(rows: unknown) {
  return AreaSchema.array().parse(normalizeSupabaseRows(rows));
}

function slugifyAreaName(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return base.length > 0 ? base : "area";
}

function uniqueAreaSlug(name: string, existingSlugs: string[]) {
  const normalizedExisting = new Set(existingSlugs);
  const base = slugifyAreaName(name);

  if (!normalizedExisting.has(base)) {
    return base;
  }

  let suffix = 2;
  while (normalizedExisting.has(`${base}-${suffix}`)) {
    suffix += 1;
  }

  return `${base}-${suffix}`;
}

function parseCapture(row: unknown) {
  return CaptureItemSchema.parse(normalizeSupabaseRow(row));
}

function parseCaptures(rows: unknown) {
  return CaptureItemSchema.array().parse(normalizeSupabaseRows(rows));
}

function parseTask(row: unknown) {
  return TaskSchema.parse(normalizeSupabaseRow(row));
}

function parseProject(row: unknown) {
  return ProjectSchema.parse(normalizeSupabaseRow(row));
}

function parseTimeBlockProposal(row: unknown) {
  return TimeBlockProposalSchema.parse(normalizeSupabaseRow(row));
}

function parseTimeBlockProposals(rows: unknown) {
  return TimeBlockProposalSchema.array().parse(normalizeSupabaseRows(rows));
}

function parseCalendarBlock(row: unknown) {
  return CalendarBlockSchema.parse(normalizeSupabaseRow(row));
}

function parseCalendarBlocks(rows: unknown) {
  return CalendarBlockSchema.array().parse(normalizeSupabaseRows(rows));
}

function parseExecutionSession(row: unknown) {
  return ExecutionSessionSchema.parse(normalizeSupabaseRow(row));
}

function parseExecutionSessions(rows: unknown) {
  return ExecutionSessionSchema.array().parse(normalizeSupabaseRows(rows));
}

function parseReviewEntry(row: unknown) {
  return ReviewEntrySchema.parse(normalizeSupabaseRow(row));
}

function parseReviewEntries(rows: unknown) {
  return ReviewEntrySchema.array().parse(normalizeSupabaseRows(rows));
}

function parseTasks(rows: unknown) {
  return TaskSchema.array().parse(normalizeSupabaseRows(rows));
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

async function requireSupabaseUser(
  client: MinimalSupabaseClient,
  unauthenticatedMessage: string,
) {
  if (!client.auth) {
    throw new Error("Supabase auth is unavailable.");
  }

  const { data: userData, error: userError } = await client.auth.getUser();

  if (userError) {
    throw new Error(getSupabaseMessage(userError));
  }

  if (!userData.user) {
    throw new Error(unauthenticatedMessage);
  }

  return userData.user;
}

function logLearningWriteFailure(
  error: unknown,
  context: Record<string, unknown>,
) {
  console.warn("LifeOS meta-learning write failed; user action preserved.", {
    error: getSupabaseMessage(error),
    ...context,
  });
}

export async function createSuggestionRecord(
  client: MinimalSupabaseClient | null,
  input: CreateSuggestionRecordInput,
) {
  const parsedInput = CreateSuggestionRecordInputSchema.parse(input);

  if (!client) return { provider: "mock" as const, record: null };

  const user = await requireSupabaseUser(
    client,
    "Sign in before recording learning suggestions.",
  );

  const query = client.from("suggestion_records") as {
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
      policy_identifier: parsedInput.policy_identifier,
      schema_version: "meta-learning-event-v1",
      suggestion_type: parsedInput.suggestion_type,
      subject_type: parsedInput.subject_type,
      subject_id: parsedInput.subject_id ?? null,
      suggestion_json: parsedInput.suggestion_json,
      confidence: parsedInput.confidence ?? null,
      status: parsedInput.status,
      resolved_at: parsedInput.resolved_at ?? null,
    })
    .select(suggestionRecordColumns)
    .single();

  if (error) throw new Error(getSupabaseMessage(error));
  return { provider: "supabase" as const, record: data };
}

export async function createOverrideRecord(
  client: MinimalSupabaseClient | null,
  input: CreateOverrideRecordInput,
) {
  const parsedInput = CreateOverrideRecordInputSchema.parse(input);

  if (!client) return { provider: "mock" as const, record: null };

  const user = await requireSupabaseUser(
    client,
    "Sign in before recording learning overrides.",
  );

  const query = client.from("override_records") as {
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
      policy_identifier: parsedInput.policy_identifier,
      schema_version: "meta-learning-event-v1",
      subject_type: parsedInput.subject_type,
      subject_id: parsedInput.subject_id,
      override_type: parsedInput.override_type,
      old_value_json: parsedInput.old_value_json,
      new_value_json: parsedInput.new_value_json,
      reason: parsedInput.reason ?? null,
    })
    .select(overrideRecordColumns)
    .single();

  if (error) throw new Error(getSupabaseMessage(error));
  return { provider: "supabase" as const, record: data };
}

function recordSuggestionFireAndForget(
  client: MinimalSupabaseClient,
  input: CreateSuggestionRecordInput,
) {
  void createSuggestionRecord(client, input).catch((error) => {
    logLearningWriteFailure(error, {
      table: "suggestion_records",
      policy_identifier: input.policy_identifier,
      suggestion_type: input.suggestion_type,
    });
  });
}

function recordOverrideFireAndForget(
  client: MinimalSupabaseClient,
  input: CreateOverrideRecordInput,
) {
  void createOverrideRecord(client, input).catch((error) => {
    logLearningWriteFailure(error, {
      table: "override_records",
      policy_identifier: input.policy_identifier,
      override_type: input.override_type,
    });
  });
}

// Local triage draft ids are not persisted rows; only uuid ids qualify as subject_id.
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface RejectedTaskDraftInput {
  area_id: string | null;
  draft_id: string;
  title: string;
  confidence?: number | null;
}

export function recordRejectedTaskDraft(
  client: MinimalSupabaseClient | null,
  input: RejectedTaskDraftInput,
): void {
  if (!client) return;

  recordSuggestionFireAndForget(client, {
    area_id: input.area_id,
    policy_identifier: "triage.default_accept_task",
    suggestion_type: "triage_suggestion",
    subject_type: "task_draft",
    subject_id: uuidPattern.test(input.draft_id) ? input.draft_id : null,
    suggestion_json: {
      draft_id: input.draft_id,
      title: input.title,
      status: "rejected",
    },
    confidence: input.confidence ?? null,
    status: "rejected",
    resolved_at: new Date().toISOString(),
  });
}

export async function listAreas(
  client: MinimalSupabaseClient | null,
  options: { includeInactive?: boolean } = {},
): Promise<AreaListResult> {
  if (!client) {
    return {
      provider: "mock",
      areas: options.includeInactive
        ? mockAreas
        : mockAreas.filter((area) => area.is_active),
    };
  }

  await requireSupabaseUser(
    client,
    "Sign in before loading areas from Supabase.",
  );

  let data: unknown;
  let error: unknown;

  if (options.includeInactive) {
    const query = client.from("areas") as {
      select: (columns: string) => {
        order: (
          column: string,
          options: { ascending: boolean },
        ) => Promise<{ data: unknown; error: unknown }>;
      };
    };

    ({ data, error } = await query
      .select(areaColumns)
      .order("sort_order", { ascending: true }));
  } else {
    const query = client.from("areas") as {
      select: (columns: string) => {
        order: (
          column: string,
          options: { ascending: boolean },
        ) => {
          eq: (
            column: string,
            value: boolean,
          ) => Promise<{ data: unknown; error: unknown }>;
        };
      };
    };

    ({ data, error } = await query
      .select(areaColumns)
      .order("sort_order", { ascending: true })
      .eq("is_active", true));
  }

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  return {
    provider: "supabase",
    areas: parseAreas(data),
  };
}

export async function createArea(
  client: MinimalSupabaseClient | null,
  input: CreateAreaInput,
): Promise<AreaCreateResult> {
  const parsedInput = CreateAreaInputSchema.parse(input);

  if (!client) {
    const now = new Date().toISOString();
    const slug = uniqueAreaSlug(
      parsedInput.name,
      mockAreas.map((area) => area.slug),
    );

    return {
      provider: "mock",
      area: AreaSchema.parse({
        id: crypto.randomUUID(),
        user_id: mockUserId,
        name: parsedInput.name,
        slug,
        description: parsedInput.description,
        color: parsedInput.color ?? null,
        icon: null,
        sort_order: mockAreas.length,
        is_active: true,
        created_at: now,
        updated_at: now,
      }),
    };
  }

  const user = await requireSupabaseUser(
    client,
    "Sign in before creating areas in Supabase.",
  );

  const listQuery = client.from("areas") as {
    select: (columns: string) => {
      order: (
        column: string,
        options: { ascending: boolean },
      ) => Promise<{ data: unknown; error: unknown }>;
    };
  };

  const { data: existingData, error: existingError } = await listQuery
    .select(areaColumns)
    .order("sort_order", { ascending: true });

  if (existingError) {
    throw new Error(getSupabaseMessage(existingError));
  }

  const existingAreas = parseAreas(existingData);
  const slug = uniqueAreaSlug(
    parsedInput.name,
    existingAreas.map((area) => area.slug),
  );
  const sortOrder =
    existingAreas.reduce(
      (maxSortOrder, area) => Math.max(maxSortOrder, area.sort_order),
      -1,
    ) + 1;

  const query = client.from("areas") as {
    insert: (row: Record<string, unknown>) => {
      select: (columns: string) => {
        single: () => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };

  const { data, error } = await query
    .insert({
      user_id: user.id,
      name: parsedInput.name,
      slug,
      description: parsedInput.description,
      color: parsedInput.color ?? null,
      icon: null,
      sort_order: sortOrder,
      is_active: true,
    })
    .select(areaColumns)
    .single();

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  return {
    provider: "supabase",
    area: AreaSchema.parse(normalizeSupabaseRow(data)),
  };
}

export async function softDeleteArea(
  client: MinimalSupabaseClient | null,
  input: SoftDeleteAreaInput,
): Promise<AreaSoftDeleteResult> {
  const parsedInput = SoftDeleteAreaInputSchema.parse(input);

  if (!client) {
    const area = mockAreas.find((item) => item.id === parsedInput.area_id);

    if (!area) {
      throw new Error("Area not found.");
    }

    return {
      provider: "mock",
      area: AreaSchema.parse({
        ...area,
        is_active: false,
        updated_at: new Date().toISOString(),
      }),
    };
  }

  await requireSupabaseUser(
    client,
    "Sign in before removing areas from Supabase.",
  );

  const query = client.from("areas") as {
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
      is_active: false,
    })
    .eq("id", parsedInput.area_id)
    .select(areaColumns)
    .single();

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  return {
    provider: "supabase",
    area: AreaSchema.parse(normalizeSupabaseRow(data)),
  };
}

export async function updateAreaColor(
  client: MinimalSupabaseClient | null,
  input: UpdateAreaColorInput,
): Promise<AreaColorUpdateResult> {
  const parsedInput = UpdateAreaColorInputSchema.parse(input);

  if (!client) {
    const area = mockAreas.find((item) => item.id === parsedInput.area_id);

    if (!area) {
      throw new Error("Area not found.");
    }

    const updatedArea = AreaSchema.parse({
      ...area,
      color: parsedInput.color,
      updated_at: new Date().toISOString(),
    });
    const index = mockAreas.findIndex(
      (item) => item.id === parsedInput.area_id,
    );
    mockAreas.splice(index, 1, updatedArea);

    return {
      provider: "mock",
      area: updatedArea,
    };
  }

  await requireSupabaseUser(
    client,
    "Sign in before updating area colors in Supabase.",
  );

  const query = client.from("areas") as {
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
      color: parsedInput.color,
    })
    .eq("id", parsedInput.area_id)
    .select(areaColumns)
    .single();

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  return {
    provider: "supabase",
    area: AreaSchema.parse(normalizeSupabaseRow(data)),
  };
}

export async function createCaptureItem(
  client: MinimalSupabaseClient | null,
  input: CreateCaptureItemInput,
): Promise<CaptureCreateResult> {
  const parsedInput = CreateCaptureItemInputSchema.parse(input);

  if (!client) {
    return {
      provider: "mock",
      capture: parseCapture({
        id: crypto.randomUUID(),
        user_id: mockUserId,
        area_id: parsedInput.area_id,
        raw_text: parsedInput.raw_text,
        raw_audio_ref: null,
        capture_mode: "text",
        inferred_area_confidence: null,
        status: "new",
        created_at: new Date().toISOString(),
      }),
    };
  }

  const user = await requireSupabaseUser(
    client,
    "Sign in before saving captures to Supabase.",
  );

  const query = client.from("capture_items") as {
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
      raw_text: parsedInput.raw_text,
      capture_mode: "text",
      status: "new",
    })
    .select(captureColumns)
    .single();

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  return {
    provider: "supabase",
    capture: parseCapture(data),
  };
}

export async function listCaptureItems(
  client: MinimalSupabaseClient | null,
): Promise<CaptureListResult> {
  if (!client) {
    return { provider: "mock", captures: [] };
  }

  await requireSupabaseUser(
    client,
    "Sign in before loading captures from Supabase.",
  );

  const query = client.from("capture_items") as {
    select: (columns: string) => {
      order: (
        column: string,
        options: { ascending: boolean },
      ) => Promise<{ data: unknown; error: unknown }>;
    };
  };

  const { data, error } = await query
    .select(captureColumns)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  return {
    provider: "supabase",
    captures: parseCaptures(data),
  };
}

export async function createTask(
  client: MinimalSupabaseClient | null,
  input: CreateTaskInput,
): Promise<TaskCreateResult> {
  const parsedInput = CreateTaskInputSchema.parse(input);

  if (!client) {
    const createdAt = new Date().toISOString();
    return {
      provider: "mock",
      task: parseTask({
        id: crypto.randomUUID(),
        user_id: mockUserId,
        area_id: parsedInput.area_id,
        project_id: parsedInput.project_id,
        source_capture_item_id: parsedInput.source_capture_item_id,
        title: parsedInput.title,
        description: parsedInput.description,
        status: parsedInput.status,
        priority_score: parsedInput.priority_score,
        priority_confidence: parsedInput.priority_confidence,
        task_type: parsedInput.task_type,
        energy_type: parsedInput.energy_type,
        estimated_minutes_low: parsedInput.estimated_minutes_low,
        estimated_minutes_high: parsedInput.estimated_minutes_high,
        due_at: parsedInput.due_at,
        definition_of_done: parsedInput.definition_of_done,
        first_tiny_step: parsedInput.first_tiny_step,
        created_at: createdAt,
        updated_at: createdAt,
      }),
    };
  }

  const user = await requireSupabaseUser(
    client,
    "Sign in before saving tasks to Supabase.",
  );

  const query = client.from("tasks") as {
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
      project_id: parsedInput.project_id,
      source_capture_item_id: parsedInput.source_capture_item_id,
      title: parsedInput.title,
      description: parsedInput.description,
      status: parsedInput.status,
      priority_score: parsedInput.priority_score,
      priority_confidence: parsedInput.priority_confidence,
      task_type: parsedInput.task_type,
      energy_type: parsedInput.energy_type,
      estimated_minutes_low: parsedInput.estimated_minutes_low,
      estimated_minutes_high: parsedInput.estimated_minutes_high,
      due_at: parsedInput.due_at,
      definition_of_done: parsedInput.definition_of_done,
      first_tiny_step: parsedInput.first_tiny_step,
    })
    .select(taskColumns)
    .single();

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  const task = parseTask(data);
  recordSuggestionFireAndForget(client, {
    area_id: task.area_id,
    policy_identifier: "triage.default_accept_task",
    suggestion_type: "triage_suggestion",
    subject_type: "task",
    subject_id: task.id,
    suggestion_json: {
      title: task.title,
      status: task.status,
      source_capture_item_id: task.source_capture_item_id,
    },
    confidence: task.priority_confidence,
    status: "accepted",
    resolved_at: new Date().toISOString(),
  });

  return {
    provider: "supabase",
    task,
  };
}

export async function createProject(
  client: MinimalSupabaseClient | null,
  input: CreateProjectInput,
): Promise<ProjectCreateResult> {
  const parsedInput = CreateProjectInputSchema.parse(input);

  if (!client) {
    const createdAt = new Date().toISOString();
    return {
      provider: "mock",
      project: parseProject({
        id: crypto.randomUUID(),
        user_id: mockUserId,
        area_id: parsedInput.area_id,
        title: parsedInput.title,
        description: parsedInput.description,
        status: "active",
        created_at: createdAt,
        updated_at: createdAt,
      }),
    };
  }

  const user = await requireSupabaseUser(
    client,
    "Sign in before saving projects to Supabase.",
  );

  const query = client.from("projects") as {
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
      title: parsedInput.title,
      description: parsedInput.description,
      status: "active",
    })
    .select(projectColumns)
    .single();

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  return {
    provider: "supabase",
    project: parseProject(data),
  };
}

export async function listPlanningItems(
  client: MinimalSupabaseClient | null,
): Promise<PlanningItemsResult> {
  if (!client) {
    return {
      provider: "mock",
      tasks: [],
      proposals: [],
      blocks: [],
    };
  }

  await requireSupabaseUser(client, "Sign in before loading planning rows.");

  const tasksQuery = client.from("tasks") as {
    select: (columns: string) => {
      order: (
        column: string,
        options: { ascending: boolean },
      ) => {
        eq: (
          column: string,
          value: string,
        ) => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };
  const proposalsQuery = client.from("time_block_proposals") as {
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

  const { data: tasks, error: tasksError } = await tasksQuery
    .select(taskColumns)
    .order("updated_at", { ascending: false })
    .eq("status", "active");
  if (tasksError) {
    throw new Error(getSupabaseMessage(tasksError));
  }

  const { data: proposals, error: proposalsError } = await proposalsQuery
    .select(timeBlockProposalColumns)
    .order("proposed_start", { ascending: true });
  if (proposalsError) {
    throw new Error(getSupabaseMessage(proposalsError));
  }

  const { data: blocks, error: blocksError } = await blocksQuery
    .select(calendarBlockColumns)
    .order("start_at", { ascending: true });
  if (blocksError) {
    throw new Error(getSupabaseMessage(blocksError));
  }

  return {
    provider: "supabase",
    tasks: parseTasks(tasks),
    proposals: parseTimeBlockProposals(proposals),
    blocks: parseCalendarBlocks(blocks),
  };
}

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
    throw new Error(
      typeof payload?.error === "string"
        ? payload.error
        : "Google Calendar event could not be created.",
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
      notes: session.notes,
    };
  }

  return {
    outcome: input.outcome,
    actual_minutes: input.actual_minutes,
    paused_minutes: session.paused_minutes ?? 0,
    distraction_minutes: session.distraction_minutes ?? 0,
    productivity_rating: input.productivity_rating,
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
