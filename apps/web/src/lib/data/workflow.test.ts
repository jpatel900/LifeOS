import { describe, expect, it, vi } from "vitest";
import {
  acceptTimeBlockProposal,
  createTimeBlockProposal,
  createProject,
  createCaptureItem,
  createTask,
  editTimeBlockProposal,
  listPlanningItems,
  rejectTimeBlockProposal,
  listAreas,
  type MinimalSupabaseClient,
} from "./workflow";

const userId = "550e8400-e29b-41d4-a716-446655440001";
const areaId = "550e8400-e29b-41d4-a716-446655440101";
const taskId = "550e8400-e29b-41d4-a716-446655440301";
const proposalId = "550e8400-e29b-41d4-a716-446655440501";
const blockId = "550e8400-e29b-41d4-a716-446655440601";
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

    const result = await listAreas(
      { from, auth: { getUser } } as unknown as MinimalSupabaseClient
    );

    expect(getUser).toHaveBeenCalled();
    expect(from).toHaveBeenCalledWith("areas");
    expect(select).toHaveBeenCalledWith(
      "id,user_id,name,slug,description,color,icon,sort_order,is_active,created_at,updated_at"
    );
    expect(order).toHaveBeenCalledWith("sort_order", { ascending: true });
    expect(eq).toHaveBeenCalledWith("is_active", true);
    expect(result.provider).toBe("supabase");
    expect(result.areas[0]?.slug).toBe("main-job");
  });

  it("requires an authenticated user before reading Supabase areas", async () => {
    const from = vi.fn();
    const getUser = vi.fn().mockResolvedValue({
      data: { user: null },
      error: null,
    });

    await expect(
      listAreas({ from, auth: { getUser } } as unknown as MinimalSupabaseClient)
    ).rejects.toThrow("Sign in before loading areas from Supabase.");
    expect(from).not.toHaveBeenCalled();
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
      { raw_text: "Call dentist tomorrow", area_id: null }
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
        definition_of_done: "Complete the first useful move and note the outcome.",
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
      }
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
      definition_of_done: "Complete the first useful move and note the outcome.",
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
      }
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

    const blocksOrder = vi.fn().mockResolvedValue({ data: [blockRow], error: null });
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

  it("creates a local time_block_proposal from a persisted task", async () => {
    const taskSingle = vi.fn().mockResolvedValue({ data: taskRow, error: null });
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

  it("accepts a local proposal and creates a calendar_block without Google fields", async () => {
    const proposalSingle = vi
      .fn()
      .mockResolvedValue({ data: proposalRow, error: null });
    const proposalEq = vi.fn().mockReturnValue({ single: proposalSingle });
    const proposalSelect = vi.fn().mockReturnValue({ eq: proposalEq });

    const accepted = { ...proposalRow, status: "accepted" };
    const acceptedSingle = vi
      .fn()
      .mockResolvedValue({ data: accepted, error: null });
    const acceptedSelect = vi.fn().mockReturnValue({ single: acceptedSingle });
    const acceptedEq = vi.fn().mockReturnValue({ select: acceptedSelect });
    const proposalUpdate = vi.fn().mockReturnValue({ eq: acceptedEq });

    const blockSingle = vi.fn().mockResolvedValue({ data: blockRow, error: null });
    const blockSelect = vi.fn().mockReturnValue({ single: blockSingle });
    const blockInsert = vi.fn().mockReturnValue({ select: blockSelect });

    const from = vi.fn((table: string) => {
      if (table === "time_block_proposals") {
        return { select: proposalSelect, update: proposalUpdate };
      }
      if (table === "calendar_blocks") return { insert: blockInsert };
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await acceptTimeBlockProposal(
      authenticatedClient(from),
      proposalId,
    );

    expect(proposalEq).toHaveBeenCalledWith("id", proposalId);
    expect(proposalUpdate).toHaveBeenCalledWith({ status: "accepted" });
    expect(blockInsert).toHaveBeenCalledWith({
      user_id: userId,
      area_id: areaId,
      proposal_id: proposalId,
      task_id: taskId,
      google_event_id: null,
      start_at: start,
      end_at: end,
      status: "scheduled",
    });
    expect(result.proposal.status).toBe("accepted");
    expect(result.block.google_event_id).toBeNull();
    expect(result.block.status).toBe("scheduled");
  });
});
