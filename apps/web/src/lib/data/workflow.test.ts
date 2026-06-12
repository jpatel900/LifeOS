import { describe, expect, it, vi } from "vitest";
import {
  acceptTimeBlockProposal,
  createArea,
  createReviewEntry,
  createTimeBlockProposal,
  createProject,
  createCaptureItem,
  createExecutionSession,
  createTask,
  editTimeBlockProposal,
  listExecutionReviewItems,
  listPlanningItems,
  markExecutionSession,
  rejectTimeBlockProposal,
  listAreas,
  softDeleteArea,
  updateAreaColor,
  type MinimalSupabaseClient,
} from "./workflow";

const userId = "550e8400-e29b-41d4-a716-446655440001";
const areaId = "550e8400-e29b-41d4-a716-446655440101";
const taskId = "550e8400-e29b-41d4-a716-446655440301";
const proposalId = "550e8400-e29b-41d4-a716-446655440501";
const blockId = "550e8400-e29b-41d4-a716-446655440601";
const sessionId = "550e8400-e29b-41d4-a716-446655440701";
const reviewId = "550e8400-e29b-41d4-a716-446655440801";
const start = "2026-05-08T16:00:00.000Z";
const end = "2026-05-08T17:00:00.000Z";

const taskRow = {
  id: taskId,
  user_id: userId,
  area_id: areaId,
  project_id: null,
  source_capture_item_id: null,
  title: "Call dentist tomorrow",
  description: null,
  status: "active",
  priority_score: null,
  priority_confidence: 0.82,
  task_type: null,
  energy_type: null,
  estimated_minutes_low: 30,
  estimated_minutes_high: 60,
  due_at: null,
  definition_of_done: "Complete the first useful move and note the outcome.",
  first_tiny_step: "Find the dentist number",
  created_at: "2026-05-07T00:00:00.000Z",
  updated_at: "2026-05-07T00:00:00.000Z",
};

const proposalRow = {
  id: proposalId,
  user_id: userId,
  area_id: areaId,
  task_id: taskId,
  proposed_start: start,
  proposed_end: end,
  rationale_json: {
    note: "Local planning proposal created from task duration.",
  },
  conflict_flag: false,
  conflict_details_json: null,
  status: "proposed",
  created_at: "2026-05-08T15:00:00.000Z",
};

const blockRow = {
  id: blockId,
  user_id: userId,
  area_id: areaId,
  proposal_id: proposalId,
  task_id: taskId,
  google_event_id: null,
  start_at: start,
  end_at: end,
  status: "scheduled",
  created_at: "2026-05-08T15:05:00.000Z",
  updated_at: "2026-05-08T15:05:00.000Z",
};

const runningSessionRow = {
  id: sessionId,
  user_id: userId,
  area_id: areaId,
  task_id: taskId,
  calendar_block_id: blockId,
  planned_minutes: 60,
  actual_minutes: null,
  paused_minutes: 0,
  distraction_minutes: 0,
  productivity_rating: null,
  energy_rating: null,
  outcome: "partial",
  notes: null,
  created_at: "2026-05-08T16:05:00.000Z",
};

const reviewRow = {
  id: reviewId,
  user_id: userId,
  area_id: null,
  review_type: "daily",
  period_start: "2026-05-08",
  period_end: "2026-05-08",
  summary_json: {
    completed_sessions: 1,
    missed_sessions: 0,
    distracted_sessions: 0,
    open_tasks: 1,
    scheduled_blocks: 1,
  },
  created_at: "2026-05-08T23:00:00.000Z",
};

function authenticatedClient(from: MinimalSupabaseClient["from"]) {
  return {
    from,
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      }),
    },
  } as unknown as MinimalSupabaseClient;
}

describe("workflow data provider", () => {
  it("lists mock areas when Supabase is not configured", async () => {
    const result = await listAreas(null);

    expect(result.provider).toBe("mock");
    expect(
      result.areas.map((area) => [area.name, area.slug, area.color, area.icon]),
    ).toEqual([
      ["Main Job", "main-job", "#2563eb", "briefcase"],
      ["Personal", "personal", "#16a34a", "home"],
      ["Volunteer Work", "volunteer-work", "#9333ea", "heart"],
      ["Side Project", "side-project", "#f97316", "rocket"],
    ]);
    expect(result.areas.every((area) => area.is_active)).toBe(true);
  });

  it("reads active areas through Supabase and validates the response", async () => {
    const eq = vi.fn().mockResolvedValue({
      data: [
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          user_id: "550e8400-e29b-41d4-a716-446655440001",
          name: "Main Job",
          slug: "main-job",
          description: null,
          color: "#2563eb",
          icon: "briefcase",
          sort_order: 0,
          is_active: true,
          created_at: "2026-05-07T00:00:00.000Z",
          updated_at: "2026-05-07T00:00:00.000Z",
        },
      ],
      error: null,
    });
    const order = vi.fn().mockReturnValue({ eq });
    const select = vi.fn().mockReturnValue({ order });
    const from = vi.fn().mockReturnValue({ select });
    const getUser = vi.fn().mockResolvedValue({
      data: {
        user: { id: "550e8400-e29b-41d4-a716-446655440001" },
      },
      error: null,
    });

    const result = await listAreas({
      from,
      auth: { getUser },
    } as unknown as MinimalSupabaseClient);

    expect(getUser).toHaveBeenCalled();
    expect(from).toHaveBeenCalledWith("areas");
    expect(select).toHaveBeenCalledWith(
      "id,user_id,name,slug,description,color,icon,sort_order,is_active,created_at,updated_at",
    );
    expect(order).toHaveBeenCalledWith("sort_order", { ascending: true });
    expect(eq).toHaveBeenCalledWith("is_active", true);
    expect(result.provider).toBe("supabase");
    expect(result.areas[0]?.slug).toBe("main-job");
  });

  it("normalizes Supabase offset timestamps before validating areas", async () => {
    const eq = vi.fn().mockResolvedValue({
      data: [
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          user_id: "550e8400-e29b-41d4-a716-446655440001",
          name: "Main Job",
          slug: "main-job",
          description: null,
          color: "#2563eb",
          icon: "briefcase",
          sort_order: 0,
          is_active: true,
          created_at: "2026-05-07T00:00:00.000-04:00",
          updated_at: "2026-05-07T00:00:00.000-04:00",
        },
      ],
      error: null,
    });
    const order = vi.fn().mockReturnValue({ eq });
    const select = vi.fn().mockReturnValue({ order });
    const from = vi.fn().mockReturnValue({ select });

    const result = await listAreas(authenticatedClient(from));

    expect(result.provider).toBe("supabase");
    expect(result.areas[0]?.created_at).toBe("2026-05-07T04:00:00.000Z");
    expect(result.areas[0]?.updated_at).toBe("2026-05-07T04:00:00.000Z");
  });

  it("requires an authenticated user before reading Supabase areas", async () => {
    const from = vi.fn();
    const getUser = vi.fn().mockResolvedValue({
      data: { user: null },
      error: null,
    });

    await expect(
      listAreas({
        from,
        auth: { getUser },
      } as unknown as MinimalSupabaseClient),
    ).rejects.toThrow("Sign in before loading areas from Supabase.");
    expect(from).not.toHaveBeenCalled();
  });

  it("creates areas through Supabase with a unique slug and next sort order", async () => {
    const existingOrder = vi.fn().mockResolvedValue({
      data: [
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          user_id: userId,
          name: "Main Job",
          slug: "main-job",
          description: null,
          color: "#2563eb",
          icon: "briefcase",
          sort_order: 0,
          is_active: true,
          created_at: "2026-05-07T00:00:00.000Z",
          updated_at: "2026-05-07T00:00:00.000Z",
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440999",
          user_id: userId,
          name: "Archived Main Job",
          slug: "main-job-2",
          description: null,
          color: null,
          icon: null,
          sort_order: 5,
          is_active: false,
          created_at: "2026-05-07T00:00:00.000Z",
          updated_at: "2026-05-07T00:00:00.000Z",
        },
      ],
      error: null,
    });
    const existingSelect = vi.fn().mockReturnValue({ order: existingOrder });
    const single = vi.fn().mockResolvedValue({
      data: {
        id: "550e8400-e29b-41d4-a716-446655440777",
        user_id: userId,
        name: "Main Job",
        slug: "main-job-3",
        description: "Focus-heavy work",
        color: null,
        icon: null,
        sort_order: 6,
        is_active: true,
        created_at: "2026-05-28T16:30:00.000Z",
        updated_at: "2026-05-28T16:30:00.000Z",
      },
      error: null,
    });
    const insertSelect = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select: insertSelect });
    const from = vi
      .fn()
      .mockReturnValueOnce({ select: existingSelect })
      .mockReturnValueOnce({ insert });

    const result = await createArea(authenticatedClient(from), {
      name: "  Main Job  ",
      description: "  Focus-heavy work  ",
    });

    expect(from).toHaveBeenNthCalledWith(1, "areas");
    expect(from).toHaveBeenNthCalledWith(2, "areas");
    expect(insert).toHaveBeenCalledWith({
      user_id: userId,
      name: "Main Job",
      slug: "main-job-3",
      description: "Focus-heavy work",
      color: null,
      icon: null,
      sort_order: 6,
      is_active: true,
    });
    expect(result.provider).toBe("supabase");
    expect(result.area.slug).toBe("main-job-3");
  });

  it("soft-deletes areas through Supabase without deleting the row", async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        id: areaId,
        user_id: userId,
        name: "Main Job",
        slug: "main-job",
        description: null,
        color: "#2563eb",
        icon: "briefcase",
        sort_order: 0,
        is_active: false,
        created_at: "2026-05-07T00:00:00.000Z",
        updated_at: "2026-05-28T16:35:00.000Z",
      },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ single });
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ update });

    const result = await softDeleteArea(authenticatedClient(from), {
      area_id: areaId,
    });

    expect(from).toHaveBeenCalledWith("areas");
    expect(update).toHaveBeenCalledWith({ is_active: false });
    expect(eq).toHaveBeenCalledWith("id", areaId);
    expect(result.provider).toBe("supabase");
    expect(result.area.is_active).toBe(false);
  });

  it("updates an area's persisted accent color through Supabase", async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        id: areaId,
        user_id: userId,
        name: "Main Job",
        slug: "main-job",
        description: null,
        color: "#0f766e",
        icon: "briefcase",
        sort_order: 0,
        is_active: true,
        created_at: "2026-05-07T00:00:00.000Z",
        updated_at: "2026-05-29T03:00:00.000Z",
      },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ single });
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ update });

    const result = await updateAreaColor(authenticatedClient(from), {
      area_id: areaId,
      color: "#0f766e",
    });

    expect(from).toHaveBeenCalledWith("areas");
    expect(update).toHaveBeenCalledWith({ color: "#0f766e" });
    expect(eq).toHaveBeenCalledWith("id", areaId);
    expect(result.provider).toBe("supabase");
    expect(result.area.color).toBe("#0f766e");
  });

  it("resets an area's accent back to the default token with null color", async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        id: areaId,
        user_id: userId,
        name: "Main Job",
        slug: "main-job",
        description: null,
        color: null,
        icon: "briefcase",
        sort_order: 0,
        is_active: true,
        created_at: "2026-05-07T00:00:00.000Z",
        updated_at: "2026-05-29T03:10:00.000Z",
      },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ single });
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ update });

    const result = await updateAreaColor(authenticatedClient(from), {
      area_id: areaId,
      color: null,
    });

    expect(update).toHaveBeenCalledWith({ color: null });
    expect(result.area.color).toBeNull();
  });

  it("persists capture items through Supabase after validating input", async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        id: "550e8400-e29b-41d4-a716-446655440010",
        user_id: "550e8400-e29b-41d4-a716-446655440001",
        area_id: null,
        raw_text: "Call dentist tomorrow",
        raw_audio_ref: null,
        capture_mode: "text",
        inferred_area_confidence: null,
        status: "new",
        created_at: "2026-05-07T00:00:00.000Z",
      },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });
    const getUser = vi.fn().mockResolvedValue({
      data: {
        user: { id: "550e8400-e29b-41d4-a716-446655440001" },
      },
      error: null,
    });

    const result = await createCaptureItem(
      { from, auth: { getUser } } as unknown as MinimalSupabaseClient,
      { raw_text: "Call dentist tomorrow", area_id: null },
    );

    expect(from).toHaveBeenCalledWith("capture_items");
    expect(insert).toHaveBeenCalledWith({
      user_id: "550e8400-e29b-41d4-a716-446655440001",
      area_id: null,
      raw_text: "Call dentist tomorrow",
      capture_mode: "text",
      status: "new",
    });
    expect(result.provider).toBe("supabase");
    expect(result.capture.raw_text).toBe("Call dentist tomorrow");
  });

  it("keeps capture working in mock mode", async () => {
    const result = await createCaptureItem(null, {
      raw_text: "Brain dump for later",
      area_id: null,
    });

    expect(result.provider).toBe("mock");
    expect(result.capture.raw_text).toBe("Brain dump for later");
    expect(result.capture.status).toBe("new");
  });

  it("persists accepted task drafts through Supabase after validating input", async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        id: "550e8400-e29b-41d4-a716-446655440301",
        user_id: "550e8400-e29b-41d4-a716-446655440001",
        area_id: "550e8400-e29b-41d4-a716-446655440101",
        project_id: null,
        source_capture_item_id: "550e8400-e29b-41d4-a716-446655440201",
        title: "Call dentist tomorrow",
        description: null,
        status: "active",
        priority_score: null,
        priority_confidence: 0.82,
        task_type: null,
        energy_type: null,
        estimated_minutes_low: 10,
        estimated_minutes_high: 20,
        due_at: null,
        definition_of_done:
          "Complete the first useful move and note the outcome.",
        first_tiny_step: "Find the dentist number",
        created_at: "2026-05-07T00:00:00.000Z",
        updated_at: "2026-05-07T00:00:00.000Z",
      },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });
    const getUser = vi.fn().mockResolvedValue({
      data: {
        user: { id: "550e8400-e29b-41d4-a716-446655440001" },
      },
      error: null,
    });

    const result = await createTask(
      { from, auth: { getUser } } as unknown as MinimalSupabaseClient,
      {
        area_id: "550e8400-e29b-41d4-a716-446655440101",
        source_capture_item_id: "550e8400-e29b-41d4-a716-446655440201",
        title: "Call dentist tomorrow",
        description: null,
        priority_confidence: 0.82,
        estimated_minutes_low: 10,
        estimated_minutes_high: 20,
        first_tiny_step: "Find the dentist number",
      },
    );

    expect(from).toHaveBeenCalledWith("tasks");
    expect(insert).toHaveBeenCalledWith({
      user_id: "550e8400-e29b-41d4-a716-446655440001",
      area_id: "550e8400-e29b-41d4-a716-446655440101",
      project_id: null,
      source_capture_item_id: "550e8400-e29b-41d4-a716-446655440201",
      title: "Call dentist tomorrow",
      description: null,
      status: "active",
      priority_score: null,
      priority_confidence: 0.82,
      task_type: null,
      energy_type: null,
      estimated_minutes_low: 10,
      estimated_minutes_high: 20,
      due_at: null,
      definition_of_done:
        "Complete the first useful move and note the outcome.",
      first_tiny_step: "Find the dentist number",
    });
    expect(result.provider).toBe("supabase");
    expect(result.task.status).toBe("active");
  });

  it("persists accepted project drafts through Supabase after validating input", async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        id: "550e8400-e29b-41d4-a716-446655440401",
        user_id: "550e8400-e29b-41d4-a716-446655440001",
        area_id: "550e8400-e29b-41d4-a716-446655440101",
        title: "Volunteer ops cleanup",
        description: "Bring the event prep system under control.",
        status: "active",
        created_at: "2026-05-07T00:00:00.000Z",
        updated_at: "2026-05-07T00:00:00.000Z",
      },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });
    const getUser = vi.fn().mockResolvedValue({
      data: {
        user: { id: "550e8400-e29b-41d4-a716-446655440001" },
      },
      error: null,
    });

    const result = await createProject(
      { from, auth: { getUser } } as unknown as MinimalSupabaseClient,
      {
        area_id: "550e8400-e29b-41d4-a716-446655440101",
        title: "Volunteer ops cleanup",
        description: "Bring the event prep system under control.",
      },
    );

    expect(from).toHaveBeenCalledWith("projects");
    expect(insert).toHaveBeenCalledWith({
      user_id: "550e8400-e29b-41d4-a716-446655440001",
      area_id: "550e8400-e29b-41d4-a716-446655440101",
      title: "Volunteer ops cleanup",
      description: "Bring the event prep system under control.",
      status: "active",
    });
    expect(result.provider).toBe("supabase");
    expect(result.project.status).toBe("active");
  });

  it("keeps accepted task persistence working in mock mode", async () => {
    const result = await createTask(null, {
      area_id: "550e8400-e29b-41d4-a716-446655440101",
      source_capture_item_id: null,
      title: "Mock accepted task",
      description: null,
      priority_confidence: 0.7,
      estimated_minutes_low: 10,
      estimated_minutes_high: 20,
      first_tiny_step: "Open the notes",
    });

    expect(result.provider).toBe("mock");
    expect(result.task.title).toBe("Mock accepted task");
    expect(result.task.status).toBe("active");
  });

  it("keeps accepted project persistence working in mock mode", async () => {
    const result = await createProject(null, {
      area_id: "550e8400-e29b-41d4-a716-446655440101",
      title: "Mock project",
      description: null,
    });

    expect(result.provider).toBe("mock");
    expect(result.project.title).toBe("Mock project");
    expect(result.project.status).toBe("active");
  });

  it("lists persisted planning tasks, proposals, and local blocks", async () => {
    const tasksEq = vi.fn().mockResolvedValue({ data: [taskRow], error: null });
    const tasksOrder = vi.fn().mockReturnValue({ eq: tasksEq });
    const tasksSelect = vi.fn().mockReturnValue({ order: tasksOrder });

    const proposalsOrder = vi
      .fn()
      .mockResolvedValue({ data: [proposalRow], error: null });
    const proposalsSelect = vi.fn().mockReturnValue({ order: proposalsOrder });

    const blocksOrder = vi
      .fn()
      .mockResolvedValue({ data: [blockRow], error: null });
    const blocksSelect = vi.fn().mockReturnValue({ order: blocksOrder });

    const from = vi.fn((table: string) => {
      if (table === "tasks") return { select: tasksSelect };
      if (table === "time_block_proposals") return { select: proposalsSelect };
      if (table === "calendar_blocks") return { select: blocksSelect };
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await listPlanningItems(authenticatedClient(from));

    expect(from).toHaveBeenCalledWith("tasks");
    expect(from).toHaveBeenCalledWith("time_block_proposals");
    expect(from).toHaveBeenCalledWith("calendar_blocks");
    expect(tasksEq).toHaveBeenCalledWith("status", "active");
    expect(result.provider).toBe("supabase");
    expect(result.tasks).toEqual([taskRow]);
    expect(result.proposals).toEqual([proposalRow]);
    expect(result.blocks).toEqual([blockRow]);
  });

  it("normalizes Supabase offset timestamps across persisted planning rows", async () => {
    const tasksEq = vi.fn().mockResolvedValue({
      data: [
        {
          ...taskRow,
          created_at: "2026-05-07T00:00:00.000-04:00",
          updated_at: "2026-05-07T00:00:00.000-04:00",
        },
      ],
      error: null,
    });
    const tasksOrder = vi.fn().mockReturnValue({ eq: tasksEq });
    const tasksSelect = vi.fn().mockReturnValue({ order: tasksOrder });

    const proposalsOrder = vi.fn().mockResolvedValue({
      data: [
        {
          ...proposalRow,
          proposed_start: "2026-05-08T12:00:00.000-04:00",
          proposed_end: "2026-05-08T13:00:00.000-04:00",
          created_at: "2026-05-08T11:00:00.000-04:00",
        },
      ],
      error: null,
    });
    const proposalsSelect = vi.fn().mockReturnValue({ order: proposalsOrder });

    const blocksOrder = vi.fn().mockResolvedValue({
      data: [
        {
          ...blockRow,
          start_at: "2026-05-08T12:00:00.000-04:00",
          end_at: "2026-05-08T13:00:00.000-04:00",
          created_at: "2026-05-08T11:05:00.000-04:00",
          updated_at: "2026-05-08T11:05:00.000-04:00",
        },
      ],
      error: null,
    });
    const blocksSelect = vi.fn().mockReturnValue({ order: blocksOrder });

    const from = vi.fn((table: string) => {
      if (table === "tasks") return { select: tasksSelect };
      if (table === "time_block_proposals") return { select: proposalsSelect };
      if (table === "calendar_blocks") return { select: blocksSelect };
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await listPlanningItems(authenticatedClient(from));

    expect(result.tasks[0]?.created_at).toBe("2026-05-07T04:00:00.000Z");
    expect(result.tasks[0]?.updated_at).toBe("2026-05-07T04:00:00.000Z");
    expect(result.proposals[0]?.proposed_start).toBe(start);
    expect(result.proposals[0]?.proposed_end).toBe(end);
    expect(result.proposals[0]?.created_at).toBe("2026-05-08T15:00:00.000Z");
    expect(result.blocks[0]?.start_at).toBe(start);
    expect(result.blocks[0]?.end_at).toBe(end);
    expect(result.blocks[0]?.created_at).toBe("2026-05-08T15:05:00.000Z");
    expect(result.blocks[0]?.updated_at).toBe("2026-05-08T15:05:00.000Z");
  });

  it("creates a local time_block_proposal from a persisted task", async () => {
    const taskSingle = vi
      .fn()
      .mockResolvedValue({ data: taskRow, error: null });
    const taskEq = vi.fn().mockReturnValue({ single: taskSingle });
    const taskSelect = vi.fn().mockReturnValue({ eq: taskEq });

    const proposalSingle = vi.fn().mockResolvedValue({
      data: proposalRow,
      error: null,
    });
    const proposalSelect = vi.fn().mockReturnValue({ single: proposalSingle });
    const proposalInsert = vi.fn().mockReturnValue({ select: proposalSelect });

    const from = vi.fn((table: string) => {
      if (table === "tasks") return { select: taskSelect };
      if (table === "time_block_proposals") return { insert: proposalInsert };
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await createTimeBlockProposal(authenticatedClient(from), {
      task_id: taskId,
      proposed_start: start,
      proposed_end: end,
    });

    expect(taskEq).toHaveBeenCalledWith("id", taskId);
    expect(proposalInsert).toHaveBeenCalledWith({
      user_id: userId,
      area_id: areaId,
      task_id: taskId,
      proposed_start: start,
      proposed_end: end,
      rationale_json: {
        note: "Local planning proposal created from task duration.",
      },
      conflict_flag: false,
      conflict_details_json: null,
      status: "proposed",
    });
    expect(result.provider).toBe("supabase");
    expect(result.proposal.status).toBe("proposed");
  });

  it("edits proposal start and end before acceptance", async () => {
    const edited = {
      ...proposalRow,
      proposed_start: "2026-05-08T18:00:00.000Z",
      proposed_end: "2026-05-08T19:00:00.000Z",
      status: "edited",
    };
    const single = vi.fn().mockResolvedValue({ data: edited, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ update });

    const result = await editTimeBlockProposal(
      authenticatedClient(from),
      proposalId,
      {
        proposed_start: edited.proposed_start,
        proposed_end: edited.proposed_end,
      },
    );

    expect(from).toHaveBeenCalledWith("time_block_proposals");
    expect(update).toHaveBeenCalledWith({
      proposed_start: edited.proposed_start,
      proposed_end: edited.proposed_end,
      status: "edited",
    });
    expect(eq).toHaveBeenCalledWith("id", proposalId);
    expect(result.proposal.status).toBe("edited");
  });

  it("rejects a local proposal through persisted status", async () => {
    const rejected = { ...proposalRow, status: "rejected" };
    const single = vi.fn().mockResolvedValue({ data: rejected, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ update });

    const result = await rejectTimeBlockProposal(
      authenticatedClient(from),
      proposalId,
    );

    expect(update).toHaveBeenCalledWith({ status: "rejected" });
    expect(result.proposal.status).toBe("rejected");
  });

  it("accepts a local proposal and creates a calendar_block atomically via rpc", async () => {
    const accepted = { ...proposalRow, status: "accepted" };
    const rpc = vi.fn().mockResolvedValue({
      data: { proposal: accepted, block: blockRow },
      error: null,
    });
    const from = vi.fn(() => {
      throw new Error("Acceptance must use the transactional rpc.");
    });
    const client = {
      ...authenticatedClient(from),
      rpc,
    } as MinimalSupabaseClient;

    const result = await acceptTimeBlockProposal(client, proposalId);

    expect(rpc).toHaveBeenCalledWith("accept_time_block_proposal", {
      p_proposal_id: proposalId,
    });
    expect(result.proposal.status).toBe("accepted");
    expect(result.block.google_event_id).toBeNull();
    expect(result.block.status).toBe("scheduled");
  });

  it("surfaces rpc errors when proposal acceptance fails", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "Only proposed or edited proposals can be accepted." },
    });
    const client = {
      ...authenticatedClient(vi.fn()),
      rpc,
    } as MinimalSupabaseClient;

    await expect(
      acceptTimeBlockProposal(client, proposalId),
    ).rejects.toThrow("Only proposed or edited proposals can be accepted.");
  });

  it("starts an execution_session for a persisted task and block", async () => {
    const taskSingle = vi
      .fn()
      .mockResolvedValue({ data: taskRow, error: null });
    const taskEq = vi.fn().mockReturnValue({ single: taskSingle });
    const taskSelect = vi.fn().mockReturnValue({ eq: taskEq });

    const blockSingle = vi
      .fn()
      .mockResolvedValue({ data: blockRow, error: null });
    const blockEq = vi.fn().mockReturnValue({ single: blockSingle });
    const blockSelect = vi.fn().mockReturnValue({ eq: blockEq });

    const runningBlock = { ...blockRow, status: "running" };
    const blockUpdateSingle = vi.fn().mockResolvedValue({
      data: runningBlock,
      error: null,
    });
    const blockUpdateSelect = vi
      .fn()
      .mockReturnValue({ single: blockUpdateSingle });
    const blockUpdateEq = vi
      .fn()
      .mockReturnValue({ select: blockUpdateSelect });
    const blockUpdate = vi.fn().mockReturnValue({ eq: blockUpdateEq });

    const sessionSingle = vi.fn().mockResolvedValue({
      data: runningSessionRow,
      error: null,
    });
    const sessionSelect = vi.fn().mockReturnValue({ single: sessionSingle });
    const sessionInsert = vi.fn().mockReturnValue({ select: sessionSelect });

    const from = vi.fn((table: string) => {
      if (table === "tasks") return { select: taskSelect };
      if (table === "calendar_blocks") {
        return { select: blockSelect, update: blockUpdate };
      }
      if (table === "execution_sessions") return { insert: sessionInsert };
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await createExecutionSession(authenticatedClient(from), {
      task_id: taskId,
      calendar_block_id: blockId,
    });

    expect(sessionInsert).toHaveBeenCalledWith({
      user_id: userId,
      area_id: areaId,
      task_id: taskId,
      calendar_block_id: blockId,
      planned_minutes: 60,
      actual_minutes: null,
      paused_minutes: 0,
      distraction_minutes: 0,
      productivity_rating: null,
      energy_rating: null,
      outcome: "partial",
      notes: null,
    });
    expect(blockUpdate).toHaveBeenCalledWith({ status: "running" });
    expect(blockUpdateEq).toHaveBeenCalledWith("id", blockId);
    expect(result.provider).toBe("supabase");
    expect(result.session.outcome).toBe("partial");
    expect(result.block?.status).toBe("running");
  });

  it("rejects starting a session when the selected block belongs to another task", async () => {
    const otherTaskId = "550e8400-e29b-41d4-a716-446655440399";
    const mismatchedBlock = { ...blockRow, task_id: otherTaskId };

    const taskSingle = vi
      .fn()
      .mockResolvedValue({ data: taskRow, error: null });
    const taskEq = vi.fn().mockReturnValue({ single: taskSingle });
    const taskSelect = vi.fn().mockReturnValue({ eq: taskEq });

    const blockSingle = vi.fn().mockResolvedValue({
      data: mismatchedBlock,
      error: null,
    });
    const blockEq = vi.fn().mockReturnValue({ single: blockSingle });
    const blockSelect = vi.fn().mockReturnValue({ eq: blockEq });

    const sessionSingle = vi.fn().mockResolvedValue({
      data: { ...runningSessionRow, calendar_block_id: blockId },
      error: null,
    });
    const sessionSelect = vi.fn().mockReturnValue({ single: sessionSingle });
    const sessionInsert = vi.fn().mockReturnValue({ select: sessionSelect });

    const runningMismatchedBlock = { ...mismatchedBlock, status: "running" };
    const blockUpdateSingle = vi.fn().mockResolvedValue({
      data: runningMismatchedBlock,
      error: null,
    });
    const blockUpdateSelect = vi
      .fn()
      .mockReturnValue({ single: blockUpdateSingle });
    const blockUpdateEq = vi
      .fn()
      .mockReturnValue({ select: blockUpdateSelect });
    const blockUpdate = vi.fn().mockReturnValue({ eq: blockUpdateEq });
    const from = vi.fn((table: string) => {
      if (table === "tasks") return { select: taskSelect };
      if (table === "calendar_blocks") {
        return { select: blockSelect, update: blockUpdate };
      }
      if (table === "execution_sessions") return { insert: sessionInsert };
      throw new Error(`Unexpected table ${table}`);
    });

    await expect(
      createExecutionSession(authenticatedClient(from), {
        task_id: taskId,
        calendar_block_id: blockId,
      }),
    ).rejects.toThrow("Selected calendar block does not belong to this task.");

    expect(sessionInsert).not.toHaveBeenCalled();
    expect(blockUpdate).not.toHaveBeenCalled();
  });

  it("completes an execution_session and marks task and block done", async () => {
    const completedSession = {
      ...runningSessionRow,
      actual_minutes: 53,
      productivity_rating: 5,
      outcome: "completed",
      notes: "Finished with minor context switching.",
    };
    const completedBlock = { ...blockRow, status: "completed" };
    const completedTask = { ...taskRow, status: "done" };

    const sessionSingle = vi.fn().mockResolvedValue({
      data: runningSessionRow,
      error: null,
    });
    const sessionEq = vi.fn().mockReturnValue({ single: sessionSingle });
    const sessionSelect = vi.fn().mockReturnValue({ eq: sessionEq });

    const rpc = vi.fn().mockResolvedValue({
      data: {
        session: completedSession,
        block: completedBlock,
        task: completedTask,
      },
      error: null,
    });

    const from = vi.fn((table: string) => {
      if (table === "execution_sessions") {
        return { select: sessionSelect };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const client = {
      ...authenticatedClient(from),
      rpc,
    } as MinimalSupabaseClient;

    const result = await markExecutionSession(client, sessionId, {
      status: "completed",
      outcome: "completed",
      actual_minutes: 53,
      productivity_rating: 5,
      notes: "Finished with minor context switching.",
    });

    expect(rpc).toHaveBeenCalledWith("apply_execution_session_outcome", {
      p_session_id: sessionId,
      p_outcome: "completed",
      p_actual_minutes: 53,
      p_paused_minutes: 0,
      p_distraction_minutes: 0,
      p_productivity_rating: 5,
      p_notes: "Finished with minor context switching.",
    });
    expect(result.session.outcome).toBe("completed");
    expect(result.block?.status).toBe("completed");
    expect(result.task?.status).toBe("done");
  });

  it("marks missed execution sessions and updates the related block only", async () => {
    const missedSession = {
      ...runningSessionRow,
      outcome: "skipped",
      actual_minutes: 8,
      productivity_rating: 2,
      notes: "Short attempt before interruption.",
    };
    const missedBlock = { ...blockRow, status: "missed" };

    const sessionSingle = vi.fn().mockResolvedValue({
      data: runningSessionRow,
      error: null,
    });
    const sessionEq = vi.fn().mockReturnValue({ single: sessionSingle });
    const sessionSelect = vi.fn().mockReturnValue({ eq: sessionEq });

    const rpc = vi.fn().mockResolvedValue({
      data: { session: missedSession, block: missedBlock, task: null },
      error: null,
    });

    const from = vi.fn((table: string) => {
      if (table === "execution_sessions") {
        return { select: sessionSelect };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const client = {
      ...authenticatedClient(from),
      rpc,
    } as MinimalSupabaseClient;

    const result = await markExecutionSession(client, sessionId, {
      status: "missed",
      outcome: "skipped",
      actual_minutes: 8,
      productivity_rating: 2,
      notes: "Short attempt before interruption.",
    });

    expect(rpc).toHaveBeenCalledWith("apply_execution_session_outcome", {
      p_session_id: sessionId,
      p_outcome: "skipped",
      p_actual_minutes: 8,
      p_paused_minutes: 0,
      p_distraction_minutes: 0,
      p_productivity_rating: 2,
      p_notes: "Short attempt before interruption.",
    });
    expect(result.session.outcome).toBe("skipped");
    expect(result.block?.status).toBe("missed");
    expect(result.task).toBeNull();
  });

  it("lists persisted tasks, blocks, sessions, and review entries for review", async () => {
    const tasksOrder = vi
      .fn()
      .mockResolvedValue({ data: [taskRow], error: null });
    const tasksSelect = vi.fn().mockReturnValue({ order: tasksOrder });
    const blocksOrder = vi
      .fn()
      .mockResolvedValue({ data: [blockRow], error: null });
    const blocksSelect = vi.fn().mockReturnValue({ order: blocksOrder });
    const sessionsOrder = vi
      .fn()
      .mockResolvedValue({ data: [runningSessionRow], error: null });
    const sessionsSelect = vi.fn().mockReturnValue({ order: sessionsOrder });
    const reviewsOrder = vi
      .fn()
      .mockResolvedValue({ data: [reviewRow], error: null });
    const reviewsSelect = vi.fn().mockReturnValue({ order: reviewsOrder });

    const from = vi.fn((table: string) => {
      if (table === "tasks") return { select: tasksSelect };
      if (table === "calendar_blocks") return { select: blocksSelect };
      if (table === "execution_sessions") return { select: sessionsSelect };
      if (table === "review_entries") return { select: reviewsSelect };
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await listExecutionReviewItems(authenticatedClient(from));

    expect(result.provider).toBe("supabase");
    expect(result.tasks).toEqual([taskRow]);
    expect(result.blocks).toEqual([blockRow]);
    expect(result.sessions).toEqual([runningSessionRow]);
    expect(result.reviewEntries).toEqual([reviewRow]);
  });

  it("creates a persisted daily review entry from validated summary data", async () => {
    const single = vi.fn().mockResolvedValue({ data: reviewRow, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });

    const result = await createReviewEntry(authenticatedClient(from), {
      review_type: "daily",
      period_start: "2026-05-08",
      period_end: "2026-05-08",
      area_id: null,
      summary_json: reviewRow.summary_json,
    });

    expect(from).toHaveBeenCalledWith("review_entries");
    expect(insert).toHaveBeenCalledWith({
      user_id: userId,
      area_id: null,
      review_type: "daily",
      period_start: "2026-05-08",
      period_end: "2026-05-08",
      summary_json: reviewRow.summary_json,
    });
    expect(result.provider).toBe("supabase");
    expect(result.reviewEntry.review_type).toBe("daily");
  });

  it("keeps execution and review helpers working in mock mode", async () => {
    const sessionResult = await createExecutionSession(null, {
      task_id: taskId,
      calendar_block_id: blockId,
    });
    const reviewResult = await createReviewEntry(null, {
      review_type: "daily",
      period_start: "2026-05-08",
      period_end: "2026-05-08",
      area_id: null,
      summary_json: reviewRow.summary_json,
    });

    expect(sessionResult.provider).toBe("mock");
    expect(sessionResult.session.task_id).toBe(taskId);
    expect(reviewResult.provider).toBe("mock");
    expect(reviewResult.reviewEntry.summary_json).toEqual(
      reviewRow.summary_json,
    );
  });
});
