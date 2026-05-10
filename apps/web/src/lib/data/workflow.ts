import {
  AreaSchema,
  CalendarBlockSchema,
  CheckTimeBlockProposalConflictInputSchema,
  CaptureItemSchema,
  CreateExecutionSessionInputSchema,
  CreateGoogleCalendarEventInputSchema,
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
  TaskSchema,
  TimeBlockProposalSchema,
  type Area,
  type CalendarBlock,
  type CaptureItem,
  type CreateExecutionSessionInput,
  type CreateGoogleCalendarEventInput,
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
  type Task,
  type TimeBlockProposal,
} from "@lifeos/schemas";

export type DataProvider = "mock" | "supabase";

export interface DataResult<T> {
  provider: DataProvider;
  data: T;
}

export interface AreaListResult {
  provider: DataProvider;
  areas: Area[];
}

export interface CaptureCreateResult {
  provider: DataProvider;
  capture: CaptureItem;
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

export interface MinimalSupabaseClient {
  from: (table: string) => unknown;
  auth?: {
    getSession?: () => Promise<{
      data: {
        session:
          | {
              access_token: string;
            }
          | null;
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

function parseAreas(rows: unknown) {
  return AreaSchema.array().parse(rows);
}

function parseCapture(row: unknown) {
  return CaptureItemSchema.parse(row);
}

function parseTask(row: unknown) {
  return TaskSchema.parse(row);
}

function parseProject(row: unknown) {
  return ProjectSchema.parse(row);
}

function parseTimeBlockProposal(row: unknown) {
  return TimeBlockProposalSchema.parse(row);
}

function parseTimeBlockProposals(rows: unknown) {
  return TimeBlockProposalSchema.array().parse(rows);
}

function parseCalendarBlock(row: unknown) {
  return CalendarBlockSchema.parse(row);
}

function parseCalendarBlocks(rows: unknown) {
  return CalendarBlockSchema.array().parse(rows);
}

function parseExecutionSession(row: unknown) {
  return ExecutionSessionSchema.parse(row);
}

function parseExecutionSessions(rows: unknown) {
  return ExecutionSessionSchema.array().parse(rows);
}

function parseReviewEntry(row: unknown) {
  return ReviewEntrySchema.parse(row);
}

function parseReviewEntries(rows: unknown) {
  return ReviewEntrySchema.array().parse(rows);
}

function parseTasks(rows: unknown) {
  return TaskSchema.array().parse(rows);
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

export async function listAreas(
  client: MinimalSupabaseClient | null
): Promise<AreaListResult> {
  if (!client) {
    return { provider: "mock", areas: mockAreas };
  }

  await requireSupabaseUser(client, "Sign in before loading areas from Supabase.");

  const query = client.from("areas") as {
    select: (columns: string) => {
      order: (
        column: string,
        options: { ascending: boolean }
      ) => {
        eq: (
          column: string,
          value: boolean
        ) => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };

  const { data, error } = await query
    .select(areaColumns)
    .order("sort_order", { ascending: true })
    .eq("is_active", true);

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  return {
    provider: "supabase",
    areas: parseAreas(data),
  };
}

export async function createCaptureItem(
  client: MinimalSupabaseClient | null,
  input: CreateCaptureItemInput
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
        status: "active",
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
      status: "active",
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

  return {
    provider: "supabase",
    task: parseTask(data),
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

  return {
    provider: "supabase",
    proposal: parseTimeBlockProposal(data),
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

  await requireSupabaseUser(client, "Sign in before editing planning proposals.");

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

  return {
    provider: "supabase",
    proposal: parseTimeBlockProposal(data),
  };
}

export async function rejectTimeBlockProposal(
  client: MinimalSupabaseClient | null,
  proposalId: string,
): Promise<TimeBlockProposalUpdateResult> {
  if (!client) {
    throw new Error("Mock proposal rejection uses the local workflow context.");
  }

  await requireSupabaseUser(client, "Sign in before rejecting planning proposals.");

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

  return {
    provider: "supabase",
    proposal: parseTimeBlockProposal(data),
  };
}

export async function acceptTimeBlockProposal(
  client: MinimalSupabaseClient | null,
  proposalId: string,
): Promise<TimeBlockProposalAcceptResult> {
  if (!client) {
    throw new Error("Mock proposal acceptance uses the local workflow context.");
  }

  const user = await requireSupabaseUser(
    client,
    "Sign in before accepting planning proposals.",
  );

  const proposalReadQuery = client.from("time_block_proposals") as {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        single: () => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };
  const { data: proposalData, error: proposalReadError } = await proposalReadQuery
    .select(timeBlockProposalColumns)
    .eq("id", proposalId)
    .single();
  if (proposalReadError) {
    throw new Error(getSupabaseMessage(proposalReadError));
  }
  const proposal = parseTimeBlockProposal(proposalData);
  if (proposal.status !== "proposed" && proposal.status !== "edited") {
    throw new Error("Only proposed or edited proposals can be accepted.");
  }

  const proposalUpdateQuery = client.from("time_block_proposals") as {
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
  const { data: acceptedData, error: acceptError } = await proposalUpdateQuery
    .update({ status: "accepted" })
    .eq("id", proposalId)
    .select(timeBlockProposalColumns)
    .single();
  if (acceptError) {
    throw new Error(getSupabaseMessage(acceptError));
  }

  const blockQuery = client.from("calendar_blocks") as {
    insert: (row: Record<string, unknown>) => {
      select: (columns: string) => {
        single: () => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };
  const { data: blockData, error: blockError } = await blockQuery
    .insert({
      user_id: user.id,
      area_id: proposal.area_id,
      proposal_id: proposal.id,
      task_id: proposal.task_id,
      google_event_id: null,
      start_at: proposal.proposed_start,
      end_at: proposal.proposed_end,
      status: "scheduled",
    })
    .select(calendarBlockColumns)
    .single();
  if (blockError) {
    throw new Error(getSupabaseMessage(blockError));
  }

  return {
    provider: "supabase",
    proposal: parseTimeBlockProposal(acceptedData),
    block: parseCalendarBlock(blockData),
  };
}

export async function checkTimeBlockProposalConflict(
  client: MinimalSupabaseClient | null,
  proposalId: string,
): Promise<TimeBlockProposalConflictCheckResult> {
  const parsedInput = CheckTimeBlockProposalConflictInputSchema.parse({
    proposal_id: proposalId,
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
  const payload = (await response.json().catch(() => null)) as
    | Record<string, unknown>
    | null;

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
  const payload = (await response.json().catch(() => null)) as
    | Record<string, unknown>
    | null;

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
    throw new Error("Google Calendar event response did not include an event id.");
  }

  return {
    provider: "supabase",
    proposal: parseTimeBlockProposal(payload?.proposal),
    block,
    googleEventId,
  };
}

function plannedMinutesFrom(task: Task, block: CalendarBlock | null) {
  if (block) {
    const startMs = new Date(block.start_at).getTime();
    const endMs = new Date(block.end_at).getTime();
    const minutes = Math.max(0, Math.round((endMs - startMs) / 60000));
    return minutes;
  }

  return task.estimated_minutes_high ?? task.estimated_minutes_low ?? null;
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

  const user = await requireSupabaseUser(
    client,
    "Sign in before starting execution sessions.",
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
  if (taskError) throw new Error(getSupabaseMessage(taskError));
  const task = parseTask(taskData);

  let block: CalendarBlock | null = null;
  if (parsedInput.calendar_block_id) {
    const blockQuery = client.from("calendar_blocks") as {
      select: (columns: string) => {
        eq: (
          column: string,
          value: string,
        ) => {
          single: () => Promise<{ data: unknown; error: unknown }>;
        };
      };
    };
    const { data: blockData, error: blockError } = await blockQuery
      .select(calendarBlockColumns)
      .eq("id", parsedInput.calendar_block_id)
      .single();
    if (blockError) throw new Error(getSupabaseMessage(blockError));
    block = parseCalendarBlock(blockData);
    if (block.task_id !== task.id || block.area_id !== task.area_id) {
      throw new Error("Selected calendar block does not belong to this task.");
    }
  }

  const sessionQuery = client.from("execution_sessions") as {
    insert: (row: Record<string, unknown>) => {
      select: (columns: string) => {
        single: () => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };
  const { data: sessionData, error: sessionError } = await sessionQuery
    .insert({
      user_id: user.id,
      area_id: task.area_id,
      task_id: task.id,
      calendar_block_id: block?.id ?? null,
      planned_minutes: plannedMinutesFrom(task, block),
      actual_minutes: null,
      paused_minutes: 0,
      distraction_minutes: 0,
      productivity_rating: null,
      energy_rating: null,
      outcome: "partial",
      notes: null,
    })
    .select(executionSessionColumns)
    .single();
  if (sessionError) throw new Error(getSupabaseMessage(sessionError));

  let updatedBlock: CalendarBlock | null = null;
  if (block) {
    const blockUpdateQuery = client.from("calendar_blocks") as {
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
    const { data: blockUpdateData, error: blockUpdateError } =
      await blockUpdateQuery
        .update({ status: "running" })
        .eq("id", block.id)
        .select(calendarBlockColumns)
        .single();
    if (blockUpdateError) throw new Error(getSupabaseMessage(blockUpdateError));
    updatedBlock = parseCalendarBlock(blockUpdateData);
  }

  return {
    provider: "supabase",
    session: parseExecutionSession(sessionData),
    block: updatedBlock,
  };
}

function executionMarkPatch(
  session: ExecutionSession,
  status: MarkExecutionSessionInput["status"],
) {
  if (status === "completed") {
    return {
      outcome: "completed",
      actual_minutes: session.planned_minutes,
      paused_minutes: session.paused_minutes ?? 0,
      distraction_minutes: session.distraction_minutes ?? 0,
      productivity_rating: 4,
      notes: session.notes,
    };
  }

  if (status === "missed") {
    return {
      outcome: "skipped",
      actual_minutes: session.actual_minutes,
      paused_minutes: session.paused_minutes ?? 0,
      distraction_minutes: session.distraction_minutes ?? 0,
      productivity_rating: session.productivity_rating,
      notes: session.notes,
    };
  }

  if (status === "distracted") {
    return {
      outcome: "distracted",
      actual_minutes: session.actual_minutes,
      paused_minutes: session.paused_minutes ?? 0,
      distraction_minutes: Math.max(session.distraction_minutes ?? 0, 10),
      productivity_rating: session.productivity_rating,
      notes: session.notes,
    };
  }

  if (status === "paused") {
    return {
      outcome: "partial",
      actual_minutes: session.actual_minutes,
      paused_minutes: Math.max(session.paused_minutes ?? 0, 5),
      distraction_minutes: session.distraction_minutes ?? 0,
      productivity_rating: session.productivity_rating,
      notes: session.notes,
    };
  }

  return {
    outcome: "blocked",
    actual_minutes: session.actual_minutes,
    paused_minutes: session.paused_minutes ?? 0,
    distraction_minutes: session.distraction_minutes ?? 0,
    productivity_rating: session.productivity_rating,
    notes: "Need a smaller next step.",
  };
}

export async function markExecutionSession(
  client: MinimalSupabaseClient | null,
  sessionId: string,
  input: MarkExecutionSessionInput,
): Promise<ExecutionSessionMarkResult> {
  const parsedInput = MarkExecutionSessionInputSchema.parse(input);

  if (!client) {
    const session = parseExecutionSession({
      id: sessionId,
      user_id: mockUserId,
      area_id: mockAreas[0]?.id,
      task_id: null,
      calendar_block_id: null,
      planned_minutes: null,
      actual_minutes: null,
      paused_minutes: 0,
      distraction_minutes: 0,
      productivity_rating: null,
      energy_rating: null,
      outcome: executionMarkPatch(
        mockExecutionSession({ task_id: crypto.randomUUID() }),
        parsedInput.status,
      ).outcome,
      notes: null,
      created_at: new Date().toISOString(),
    });
    return { provider: "mock", session, block: null, task: null };
  }

  await requireSupabaseUser(client, "Sign in before updating execution sessions.");

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

  const patch = executionMarkPatch(currentSession, parsedInput.status);
  const sessionUpdateQuery = client.from("execution_sessions") as {
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
  const { data: updatedSessionData, error: sessionUpdateError } =
    await sessionUpdateQuery
      .update(patch)
      .eq("id", sessionId)
      .select(executionSessionColumns)
      .single();
  if (sessionUpdateError) throw new Error(getSupabaseMessage(sessionUpdateError));

  let updatedBlock: CalendarBlock | null = null;
  if (
    currentSession.calendar_block_id &&
    (parsedInput.status === "completed" || parsedInput.status === "missed")
  ) {
    const blockStatus = parsedInput.status === "completed" ? "completed" : "missed";
    const blockUpdateQuery = client.from("calendar_blocks") as {
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
    const { data: blockData, error: blockError } = await blockUpdateQuery
      .update({ status: blockStatus })
      .eq("id", currentSession.calendar_block_id)
      .select(calendarBlockColumns)
      .single();
    if (blockError) throw new Error(getSupabaseMessage(blockError));
    updatedBlock = parseCalendarBlock(blockData);
  }

  let updatedTask: Task | null = null;
  if (
    currentSession.task_id &&
    (parsedInput.status === "completed" || parsedInput.status === "stuck")
  ) {
    const taskStatus = parsedInput.status === "completed" ? "done" : "blocked";
    const taskUpdateQuery = client.from("tasks") as {
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
    const { data: taskData, error: taskError } = await taskUpdateQuery
      .update({ status: taskStatus })
      .eq("id", currentSession.task_id)
      .select(taskColumns)
      .single();
    if (taskError) throw new Error(getSupabaseMessage(taskError));
    updatedTask = parseTask(taskData);
  }

  return {
    provider: "supabase",
    session: parseExecutionSession(updatedSessionData),
    block: updatedBlock,
    task: updatedTask,
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
