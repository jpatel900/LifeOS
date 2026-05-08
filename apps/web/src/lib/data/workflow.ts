import {
  AreaSchema,
  CalendarBlockSchema,
  CaptureItemSchema,
  CreateTimeBlockProposalInputSchema,
  EditTimeBlockProposalInputSchema,
  CreateProjectInputSchema,
  CreateCaptureItemInputSchema,
  CreateTaskInputSchema,
  ProjectSchema,
  TaskSchema,
  TimeBlockProposalSchema,
  type Area,
  type CalendarBlock,
  type CaptureItem,
  type CreateTimeBlockProposalInput,
  type EditTimeBlockProposalInput,
  type CreateProjectInput,
  type CreateCaptureItemInput,
  type CreateTaskInput,
  type Project,
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

export interface MinimalSupabaseClient {
  from: (table: string) => unknown;
  auth?: {
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
