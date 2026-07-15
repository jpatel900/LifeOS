import { describe, expect, it, vi } from "vitest";
import {
  acceptTimeBlockProposal,
  applyTaskReviewTransition,
  createArea,
  createReviewEntry,
  createWinRecord,
  listWinHarvestCandidates,
  listWinRecords,
  createRollupSummary,
  listRollupSummaries,
  listDurationProfiles,
  upsertDurationProfile,
  listOverrideRecords,
  listSuggestionRecords,
  createTimeBlockProposal,
  createProject,
  createCaptureItem,
  syncQueuedCapture,
  createExecutionSession,
  createTask,
  deferExecutionSessionWithTask,
  editTimeBlockProposal,
  findOrCreatePerson,
  listExecutionReviewItems,
  listPlanningItems,
  markExecutionSession,
  getOperatorProfile,
  listPeople,
  recordCommitmentProposal,
  recordPersonLinkAcceptance,
  recordPersonLinkRejection,
  recordPersonMentionProposal,
  recordRejectedTaskDraft,
  recordPolicyProposalDecision,
  recordDurationRecalibrationDecision,
  rejectTimeBlockProposal,
  unplanCalendarBlock,
  listAreas,
  softDeleteArea,
  updateAreaColor,
  COMMITMENT_POLICY_ID,
  PERSON_LINK_POLICY_ID,
  DURATION_RECALIBRATION_POLICY_ID,
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
      "id,user_id,name,slug,description,color,icon,sort_order,is_active,charter_text,charter_updated_at,created_at,updated_at",
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
      color: "#3f8fd6",
    });

    expect(from).toHaveBeenNthCalledWith(1, "areas");
    expect(from).toHaveBeenNthCalledWith(2, "areas");
    expect(insert).toHaveBeenCalledWith({
      user_id: userId,
      name: "Main Job",
      slug: "main-job-3",
      description: "Focus-heavy work",
      color: "#3f8fd6",
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
      return_hook: null,
      client_capture_id: null,
      capture_mode: "text",
      status: "new",
    });
    expect(result.provider).toBe("supabase");
    expect(result.capture.raw_text).toBe("Call dentist tomorrow");
  });

  it("forwards a client_capture_id for idempotent offline-queue sync", async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        id: "550e8400-e29b-41d4-a716-446655440900",
        user_id: "550e8400-e29b-41d4-a716-446655440001",
        area_id: null,
        raw_text: "Buy milk",
        raw_audio_ref: null,
        client_capture_id: "queued-abc123",
        capture_mode: "text",
        inferred_area_confidence: null,
        status: "new",
        created_at: "2026-07-06T00:00:00.000Z",
      },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });
    const getUser = vi.fn().mockResolvedValue({
      data: { user: { id: "550e8400-e29b-41d4-a716-446655440001" } },
      error: null,
    });

    await createCaptureItem(
      { from, auth: { getUser } } as unknown as MinimalSupabaseClient,
      {
        raw_text: "Buy milk",
        area_id: null,
        client_capture_id: "queued-abc123",
      },
    );

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ client_capture_id: "queued-abc123" }),
    );
  });

  it("syncs a queued capture idempotently via upsert-ignore-duplicates", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ upsert });
    const getUser = vi.fn().mockResolvedValue({
      data: { user: { id: "550e8400-e29b-41d4-a716-446655440001" } },
      error: null,
    });

    const result = await syncQueuedCapture(
      { from, auth: { getUser } } as unknown as MinimalSupabaseClient,
      {
        raw_text: "Buy milk",
        area_id: null,
        return_hook: null,
        client_capture_id: "queued-abc123",
      },
    );

    expect(result.provider).toBe("supabase");
    expect(from).toHaveBeenCalledWith("capture_items");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "550e8400-e29b-41d4-a716-446655440001",
        raw_text: "Buy milk",
        client_capture_id: "queued-abc123",
        status: "new",
      }),
      { onConflict: "user_id,client_capture_id", ignoreDuplicates: true },
    );
  });

  it("keeps queued-capture sync a no-op in mock mode", async () => {
    const result = await syncQueuedCapture(null, {
      raw_text: "Buy milk",
      area_id: null,
      return_hook: null,
      client_capture_id: "queued-abc123",
    });
    expect(result.provider).toBe("mock");
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
      is_reversible: null,
      energy_type: null,
      estimated_minutes_low: 10,
      estimated_minutes_high: 20,
      due_at: null,
      definition_of_done:
        "Complete the first useful move and note the outcome.",
      first_tiny_step: "Find the dentist number",
      waiting_on_person_id: null,
      waiting_on_since: null,
      is_commitment: false,
      committed_to_person_id: null,
    });
    expect(result.provider).toBe("supabase");
    expect(result.task.status).toBe("active");
  });

  it("persists Someday task drafts with backlog status", async () => {
    const backlogTask = { ...taskRow, status: "backlog" };
    const single = vi.fn().mockResolvedValue({
      data: backlogTask,
      error: null,
    });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });

    const result = await createTask(authenticatedClient(from), {
      area_id: areaId,
      source_capture_item_id: "550e8400-e29b-41d4-a716-446655440201",
      title: "Review long-term idea",
      description: null,
      status: "backlog",
      priority_confidence: 0.72,
      estimated_minutes_low: 20,
      estimated_minutes_high: 40,
      first_tiny_step: "Name the next decision",
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ status: "backlog" }),
    );
    expect(result.task.status).toBe("backlog");
  });

  it("records a rejected triage suggestion when the user drops a draft", async () => {
    const suggestionSingle = vi.fn().mockResolvedValue({
      data: {},
      error: null,
    });
    const suggestionSelect = vi
      .fn()
      .mockReturnValue({ single: suggestionSingle });
    const suggestionInsert = vi.fn().mockReturnValue({
      select: suggestionSelect,
    });
    const from = vi.fn((table: string) => {
      if (table === "suggestion_records") return { insert: suggestionInsert };
      throw new Error(`Unexpected table ${table}`);
    });

    recordRejectedTaskDraft(authenticatedClient(from), {
      area_id: areaId,
      draft_id: "task-draft-550e8400-e29b-41d4-a716-446655440901",
      title: "Call dentist tomorrow",
      confidence: 0.82,
    });

    await vi.waitFor(() => {
      expect(suggestionInsert).toHaveBeenCalledWith({
        user_id: userId,
        area_id: areaId,
        policy_identifier: "triage.default_accept_task",
        schema_version: "meta-learning-event-v2",
        suggestion_type: "triage_suggestion",
        subject_type: "task_draft",
        subject_id: null,
        suggestion_json: {
          draft_id: "task-draft-550e8400-e29b-41d4-a716-446655440901",
          title: "Call dentist tomorrow",
          status: "rejected",
        },
        confidence: 0.82,
        status: "rejected",
        resolution_reason: null,
        decided_by: "user",
        resolved_at: expect.any(String),
      });
    });
  });

  it("points the rejection record subject_id at uuid draft ids", async () => {
    const draftUuid = "550e8400-e29b-41d4-a716-446655440901";
    const suggestionSingle = vi.fn().mockResolvedValue({
      data: {},
      error: null,
    });
    const suggestionSelect = vi
      .fn()
      .mockReturnValue({ single: suggestionSingle });
    const suggestionInsert = vi.fn().mockReturnValue({
      select: suggestionSelect,
    });
    const from = vi.fn().mockReturnValue({ insert: suggestionInsert });

    recordRejectedTaskDraft(authenticatedClient(from), {
      area_id: null,
      draft_id: draftUuid,
      title: "Review long-term idea",
    });

    await vi.waitFor(() => {
      expect(suggestionInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          area_id: null,
          subject_id: draftUuid,
          confidence: null,
          status: "rejected",
        }),
      );
    });
  });

  it("preserves the user rejection when the meta-learning write fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const suggestionSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "learning table unavailable" },
    });
    const suggestionSelect = vi
      .fn()
      .mockReturnValue({ single: suggestionSingle });
    const suggestionInsert = vi.fn().mockReturnValue({
      select: suggestionSelect,
    });
    const from = vi.fn().mockReturnValue({ insert: suggestionInsert });

    expect(() =>
      recordRejectedTaskDraft(authenticatedClient(from), {
        area_id: areaId,
        draft_id: "task-draft-550e8400-e29b-41d4-a716-446655440901",
        title: "Call dentist tomorrow",
        confidence: 0.82,
      }),
    ).not.toThrow();

    await vi.waitFor(() => {
      expect(warn).toHaveBeenCalledWith(
        "LifeOS meta-learning write failed; user action preserved.",
        expect.objectContaining({
          error: "learning table unavailable",
          table: "suggestion_records",
          policy_identifier: "triage.default_accept_task",
        }),
      );
    });
    warn.mockRestore();
  });

  it("skips rejection learning writes in mock mode", () => {
    expect(() =>
      recordRejectedTaskDraft(null, {
        area_id: null,
        draft_id: "task-draft-550e8400-e29b-41d4-a716-446655440901",
        title: "Mock rejected draft",
      }),
    ).not.toThrow();
  });

  it("records a policy-change proposal decision as a resolved suggestion", async () => {
    const single = vi.fn().mockResolvedValue({ data: {}, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });

    recordPolicyProposalDecision(authenticatedClient(from), {
      area_id: null,
      policy_identifier: "planning.default_time_block",
      decision: "accepted",
      evidence: "overridden 3 of the last 5",
      examined: 5,
      override_count: 3,
      latest_override_type: "edited",
      resolved_at: "2026-07-06T12:00:00.000Z",
    });

    await vi.waitFor(() => {
      expect(from).toHaveBeenCalledWith("suggestion_records");
      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({
          policy_identifier: "planning.default_time_block",
          suggestion_type: "policy_change",
          subject_type: "policy",
          status: "accepted",
          decided_by: "user",
          resolved_at: "2026-07-06T12:00:00.000Z",
        }),
      );
    });
  });

  it("records a declined policy proposal with rejected status", async () => {
    const single = vi.fn().mockResolvedValue({ data: {}, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });

    recordPolicyProposalDecision(authenticatedClient(from), {
      area_id: null,
      policy_identifier: "planning.default_time_block",
      decision: "declined",
      evidence: "overridden 3 of the last 5",
      examined: 5,
      override_count: 3,
      latest_override_type: "rejected",
      resolved_at: "2026-07-06T12:00:00.000Z",
    });

    await vi.waitFor(() => {
      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({
          suggestion_type: "policy_change",
          status: "rejected",
          decided_by: "user",
        }),
      );
    });
  });

  it("records a duration-recalibration decision under the planning policy id", async () => {
    const single = vi.fn().mockResolvedValue({ data: {}, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });

    recordDurationRecalibrationDecision(authenticatedClient(from), {
      area_id: null,
      decision: "accepted",
      multiplier: 1.4,
      sample_count: 3,
      estimate_minutes: 60,
      adjusted_minutes: 84,
      resolved_at: "2026-07-06T12:00:00.000Z",
    });

    await vi.waitFor(() => {
      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({
          policy_identifier: DURATION_RECALIBRATION_POLICY_ID,
          suggestion_type: "duration_recalibration",
          status: "accepted",
          decided_by: "user",
        }),
      );
    });
  });

  it("skips S9 learning-decision writes in mock mode", () => {
    expect(() =>
      recordPolicyProposalDecision(null, {
        area_id: null,
        policy_identifier: "planning.default_time_block",
        decision: "accepted",
        evidence: "overridden 3 of the last 5",
        examined: 5,
        override_count: 3,
        latest_override_type: "edited",
        resolved_at: "2026-07-06T12:00:00.000Z",
      }),
    ).not.toThrow();
    expect(() =>
      recordDurationRecalibrationDecision(null, {
        area_id: null,
        decision: "dismissed",
        multiplier: 1.4,
        sample_count: 3,
        estimate_minutes: 60,
        adjusted_minutes: 84,
        resolved_at: "2026-07-06T12:00:00.000Z",
      }),
    ).not.toThrow();
  });

  it("records a pending person-link suggestion under the person policy id", async () => {
    const single = vi.fn().mockResolvedValue({ data: {}, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });

    recordPersonMentionProposal(authenticatedClient(from), {
      area_id: areaId,
      draft_id: "550e8400-e29b-41d4-a716-446655440901",
      name: "Sarah",
      role: "committed_to",
      confidence: 0.94,
      match: "new",
    });

    await vi.waitFor(() => {
      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({
          policy_identifier: PERSON_LINK_POLICY_ID,
          suggestion_type: "parse_result",
          subject_type: "person_mention",
          subject_id: "550e8400-e29b-41d4-a716-446655440901",
          status: "pending",
          confidence: 0.94,
        }),
      );
    });
  });

  it("records a pending commitment suggestion under the commitment policy id", async () => {
    const single = vi.fn().mockResolvedValue({ data: {}, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });

    recordCommitmentProposal(authenticatedClient(from), {
      area_id: areaId,
      draft_id: "550e8400-e29b-41d4-a716-446655440901",
      title: "Send Sarah the deck",
      confidence: 0.9,
    });

    await vi.waitFor(() => {
      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({
          policy_identifier: COMMITMENT_POLICY_ID,
          subject_type: "task_draft",
          status: "pending",
        }),
      );
    });
  });

  it("records a rejection suggestion and an override for a persisted (uuid) subject", async () => {
    const single = vi.fn().mockResolvedValue({ data: {}, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const suggestionInsert = vi.fn().mockReturnValue({ select });
    const overrideInsert = vi.fn().mockReturnValue({ select });
    const from = vi.fn((table: string) => {
      if (table === "suggestion_records") return { insert: suggestionInsert };
      if (table === "override_records") return { insert: overrideInsert };
      throw new Error(`Unexpected table ${table}`);
    });

    recordPersonLinkRejection(authenticatedClient(from), {
      area_id: areaId,
      draft_id: "550e8400-e29b-41d4-a716-446655440901",
      name: "Sarah",
      role: "committed_to",
    });

    await vi.waitFor(() => {
      expect(suggestionInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          policy_identifier: PERSON_LINK_POLICY_ID,
          subject_type: "person_mention",
          status: "rejected",
        }),
      );
      expect(overrideInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          policy_identifier: PERSON_LINK_POLICY_ID,
          subject_type: "person_mention",
          override_type: "rejected",
        }),
      );
    });
  });

  it("records a rejection suggestion (no override) for a non-uuid local draft", async () => {
    const single = vi.fn().mockResolvedValue({ data: {}, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const suggestionInsert = vi.fn().mockReturnValue({ select });
    const from = vi.fn((table: string) => {
      if (table === "suggestion_records") return { insert: suggestionInsert };
      throw new Error(`Unexpected table ${table}`);
    });

    recordPersonLinkRejection(authenticatedClient(from), {
      area_id: null,
      draft_id: "task-draft-abc123",
      name: "Sarah",
      role: "committed_to",
    });

    await vi.waitFor(() => {
      expect(suggestionInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          subject_id: null,
          status: "rejected",
        }),
      );
    });
    // No override write for a local draft (override_records would throw above).
    expect(from).not.toHaveBeenCalledWith("override_records");
  });

  it("preserves the user action when a person-link learning write fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const single = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "learning table unavailable" },
    });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });

    expect(() =>
      recordPersonMentionProposal(authenticatedClient(from), {
        area_id: areaId,
        draft_id: "550e8400-e29b-41d4-a716-446655440901",
        name: "Sarah",
        role: "committed_to",
        confidence: 0.9,
        match: "new",
      }),
    ).not.toThrow();

    await vi.waitFor(() => {
      expect(warn).toHaveBeenCalledWith(
        "LifeOS meta-learning write failed; user action preserved.",
        expect.objectContaining({
          policy_identifier: PERSON_LINK_POLICY_ID,
        }),
      );
    });
    warn.mockRestore();
  });

  it("skips person/commitment learning writes in mock mode", () => {
    expect(() =>
      recordPersonMentionProposal(null, {
        area_id: null,
        draft_id: "task-draft-local-1",
        name: "Sarah",
        role: "mention",
        confidence: 0.5,
        match: "new",
      }),
    ).not.toThrow();
    expect(() =>
      recordCommitmentProposal(null, {
        area_id: null,
        draft_id: "task-draft-local-1",
        title: "Local commitment",
      }),
    ).not.toThrow();
  });

  it("reads the operator profile live for the parse context read path", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: "550e8400-e29b-41d4-a716-446655440a01",
        user_id: userId,
        profile_text: "Strong at synthesis, weak at starting.",
        compensation_rules: [
          { trait: "starting friction", rule: "require a concrete first move" },
        ],
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-01T00:00:00.000Z",
      },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ maybeSingle });
    const from = vi.fn((table: string) => {
      if (table === "operator_profiles") return { select };
      throw new Error(`Unexpected table ${table}`);
    });

    const profile = await getOperatorProfile(authenticatedClient(from));
    expect(profile?.profile_text).toBe(
      "Strong at synthesis, weak at starting.",
    );
    expect(profile?.compensation_rules?.[0]?.trait).toBe("starting friction");
  });

  it("returns a null operator profile when no row exists (empty-profile parity)", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const select = vi.fn().mockReturnValue({ maybeSingle });
    const from = vi.fn().mockReturnValue({ select });

    await expect(
      getOperatorProfile(authenticatedClient(from)),
    ).resolves.toBeNull();
  });

  it("reads no operator profile in mock mode", async () => {
    await expect(getOperatorProfile(null)).resolves.toBeNull();
  });

  it("lists people live for person-mention resolution", async () => {
    const select = vi.fn().mockResolvedValue({
      data: [
        {
          id: "550e8400-e29b-41d4-a716-446655440b01",
          user_id: userId,
          display_name: "Sarah Lee",
          normalized_name: "sarah lee",
          notes: null,
          created_at: "2026-07-01T00:00:00.000Z",
          updated_at: "2026-07-01T00:00:00.000Z",
          archived_at: null,
        },
      ],
      error: null,
    });
    const from = vi.fn((table: string) => {
      if (table === "people") return { select };
      throw new Error(`Unexpected table ${table}`);
    });

    const people = await listPeople(authenticatedClient(from));
    expect(people).toHaveLength(1);
    expect(people[0]?.normalized_name).toBe("sarah lee");
  });

  it("returns an empty people list in mock mode", async () => {
    await expect(listPeople(null)).resolves.toEqual([]);
  });

  const personRow = {
    id: "550e8400-e29b-41d4-a716-446655440b01",
    user_id: userId,
    display_name: "Sarah Lee",
    normalized_name: "sarah lee",
    notes: null,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    archived_at: null,
  };

  it("reuses an existing person by normalized_name instead of inserting (idempotent)", async () => {
    const maybeSingle = vi
      .fn()
      .mockResolvedValue({ data: personRow, error: null });
    const eqNormalized = vi.fn().mockReturnValue({ maybeSingle });
    const eqUser = vi.fn().mockReturnValue({ eq: eqNormalized });
    const select = vi.fn().mockReturnValue({ eq: eqUser });
    const insert = vi.fn();
    const from = vi.fn((table: string) => {
      if (table === "people") return { select, insert };
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await findOrCreatePerson(authenticatedClient(from), {
      display_name: "Sarah Lee",
      normalized_name: "sarah lee",
    });

    expect(eqUser).toHaveBeenCalledWith("user_id", userId);
    expect(eqNormalized).toHaveBeenCalledWith("normalized_name", "sarah lee");
    // Re-check found a match, so no insert — idempotent per normalized_name.
    expect(insert).not.toHaveBeenCalled();
    expect(result.provider).toBe("supabase");
    expect(result.person?.id).toBe(personRow.id);
  });

  it("inserts a new person when no normalized_name match exists (FR-017)", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eqNormalized = vi.fn().mockReturnValue({ maybeSingle });
    const eqUser = vi.fn().mockReturnValue({ eq: eqNormalized });
    const select = vi.fn().mockReturnValue({ eq: eqUser });
    const insertSingle = vi
      .fn()
      .mockResolvedValue({ data: personRow, error: null });
    const insertSelect = vi.fn().mockReturnValue({ single: insertSingle });
    const insert = vi.fn().mockReturnValue({ select: insertSelect });
    const from = vi.fn((table: string) => {
      if (table === "people") return { select, insert };
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await findOrCreatePerson(authenticatedClient(from), {
      display_name: "Sarah Lee",
      normalized_name: "sarah lee",
    });

    expect(insert).toHaveBeenCalledWith({
      user_id: userId,
      display_name: "Sarah Lee",
      normalized_name: "sarah lee",
    });
    expect(result.provider).toBe("supabase");
    expect(result.person?.normalized_name).toBe("sarah lee");
  });

  it("creates no person in mock mode (local demo degrades to no-link)", async () => {
    const result = await findOrCreatePerson(null, {
      display_name: "Sarah Lee",
      normalized_name: "sarah lee",
    });
    expect(result.provider).toBe("mock");
    expect(result.person).toBeNull();
  });

  it("records an accepted person-link suggestion that resolves the pending proposal", async () => {
    const single = vi.fn().mockResolvedValue({ data: {}, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const suggestionInsert = vi.fn().mockReturnValue({ select });
    const from = vi.fn((table: string) => {
      if (table === "suggestion_records") return { insert: suggestionInsert };
      throw new Error(`Unexpected table ${table}`);
    });

    recordPersonLinkAcceptance(authenticatedClient(from), {
      area_id: areaId,
      draft_id: "550e8400-e29b-41d4-a716-446655440901",
      name: "Sarah Lee",
      role: "waiting_on",
      matched_person_id: personRow.id,
    });

    await vi.waitFor(() => {
      expect(suggestionInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          policy_identifier: PERSON_LINK_POLICY_ID,
          subject_type: "person_mention",
          subject_id: "550e8400-e29b-41d4-a716-446655440901",
          status: "accepted",
          suggestion_json: expect.objectContaining({
            status: "accepted",
            linked_person_id: personRow.id,
          }),
        }),
      );
    });
  });

  it("skips person-link acceptance learning writes in mock mode", () => {
    expect(() =>
      recordPersonLinkAcceptance(null, {
        area_id: null,
        draft_id: "task-draft-local-1",
        name: "Sarah Lee",
        role: "committed_to",
      }),
    ).not.toThrow();
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

  it("preserves proposal creation when the meta-learning suggestion write fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
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

    const suggestionSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "learning table unavailable" },
    });
    const suggestionSelect = vi
      .fn()
      .mockReturnValue({ single: suggestionSingle });
    const suggestionInsert = vi.fn().mockReturnValue({
      select: suggestionSelect,
    });

    const from = vi.fn((table: string) => {
      if (table === "tasks") return { select: taskSelect };
      if (table === "time_block_proposals") return { insert: proposalInsert };
      if (table === "suggestion_records") return { insert: suggestionInsert };
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await createTimeBlockProposal(authenticatedClient(from), {
      task_id: taskId,
      proposed_start: start,
      proposed_end: end,
    });

    await vi.waitFor(() => {
      expect(warn).toHaveBeenCalledWith(
        "LifeOS meta-learning write failed; user action preserved.",
        expect.objectContaining({
          error: "learning table unavailable",
          table: "suggestion_records",
        }),
      );
    });
    expect(result.proposal.id).toBe(proposalId);
    expect(suggestionInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        policy_identifier: "planning.default_time_block",
        schema_version: "meta-learning-event-v2",
      }),
    );
    warn.mockRestore();
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
    const scheduledTask = { ...taskRow, status: "scheduled" };
    const rpc = vi.fn().mockResolvedValue({
      data: { proposal: accepted, block: blockRow, task: scheduledTask },
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
    expect(result.task?.status).toBe("scheduled");
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

    await expect(acceptTimeBlockProposal(client, proposalId)).rejects.toThrow(
      "Only proposed or edited proposals can be accepted.",
    );
  });

  it("starts an execution_session for a persisted task and block atomically via rpc", async () => {
    const runningBlock = { ...blockRow, status: "running" };
    const rpc = vi.fn().mockResolvedValue({
      data: { session: runningSessionRow, block: runningBlock },
      error: null,
    });
    const from = vi.fn(() => {
      throw new Error("Session start must use the transactional rpc.");
    });
    const client = {
      ...authenticatedClient(from),
      rpc,
    } as MinimalSupabaseClient;

    const result = await createExecutionSession(client, {
      task_id: taskId,
      calendar_block_id: blockId,
    });

    expect(rpc).toHaveBeenCalledWith("start_execution_session", {
      p_task_id: taskId,
      p_calendar_block_id: blockId,
    });
    expect(result.provider).toBe("supabase");
    expect(result.session.outcome).toBe("partial");
    expect(result.block?.status).toBe("running");
  });

  it("surfaces session-start rpc errors", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        message: "Selected calendar block does not belong to this task.",
      },
    });
    const client = {
      ...authenticatedClient(vi.fn()),
      rpc,
    } as MinimalSupabaseClient;

    await expect(
      createExecutionSession(client, {
        task_id: taskId,
        calendar_block_id: blockId,
      }),
    ).rejects.toThrow("Selected calendar block does not belong to this task.");
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
      p_cap_outcome: null,
    });
    expect(result.session.outcome).toBe("completed");
    expect(result.block?.status).toBe("completed");
    expect(result.task?.status).toBe("done");
  });

  it("records DoD-cap outcomes on execution sessions", async () => {
    const cappedSession = {
      ...runningSessionRow,
      outcome: "completed",
      actual_minutes: 45,
      productivity_rating: 4,
      cap_outcome: "cut_scope",
      notes: "dod_cap.v1 cut_scope: ship the smaller result.",
    };
    const sessionSingle = vi.fn().mockResolvedValue({
      data: runningSessionRow,
      error: null,
    });
    const sessionEq = vi.fn().mockReturnValue({ single: sessionSingle });
    const sessionSelect = vi.fn().mockReturnValue({ eq: sessionEq });
    const rpc = vi.fn().mockResolvedValue({
      data: { session: cappedSession, block: null, task: null },
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
      actual_minutes: 45,
      productivity_rating: 4,
      cap_outcome: "cut_scope",
      notes: "dod_cap.v1 cut_scope: ship the smaller result.",
    });

    expect(rpc).toHaveBeenCalledWith("apply_execution_session_outcome", {
      p_session_id: sessionId,
      p_outcome: "completed",
      p_actual_minutes: 45,
      p_paused_minutes: 0,
      p_distraction_minutes: 0,
      p_productivity_rating: 4,
      p_notes: "dod_cap.v1 cut_scope: ship the smaller result.",
      p_cap_outcome: "cut_scope",
    });
    expect(result.session.cap_outcome).toBe("cut_scope");
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
      p_cap_outcome: null,
    });
    expect(result.session.outcome).toBe("skipped");
    expect(result.block?.status).toBe("missed");
    expect(result.task).toBeNull();
  });

  // #613: the atomic cap-DEFER RPC — one call carries both the session
  // outcome (blocked/deferred) and the task deferral (backlog) so a caller
  // never sees a state where one committed and the other didn't.
  it("defers a task and its execution session atomically via rpc", async () => {
    const deferredSession = {
      ...runningSessionRow,
      outcome: "blocked",
      cap_outcome: "deferred",
      actual_minutes: 25,
      notes: "dod_cap.v1 deferred: Continue from section two.",
    };
    const backlogTask = { ...taskRow, status: "backlog" };
    const rpc = vi.fn().mockResolvedValue({
      data: { session: deferredSession, task: backlogTask },
      error: null,
    });
    const client = {
      ...authenticatedClient(vi.fn()),
      rpc,
    } as MinimalSupabaseClient;

    const result = await deferExecutionSessionWithTask(
      client,
      sessionId,
      taskId,
      {
        actual_minutes: 25,
        notes: "dod_cap.v1 deferred: Continue from section two.",
      },
    );

    expect(rpc).toHaveBeenCalledWith("apply_execution_session_defer", {
      p_session_id: sessionId,
      p_task_id: taskId,
      p_actual_minutes: 25,
      p_paused_minutes: 0,
      p_distraction_minutes: 0,
      p_notes: "dod_cap.v1 deferred: Continue from section two.",
    });
    expect(result.session.outcome).toBe("blocked");
    expect(result.session.cap_outcome).toBe("deferred");
    expect(result.task.status).toBe("backlog");
  });

  it("surfaces atomic defer rpc errors without a partial write", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "Execution session was not found." },
    });
    const client = {
      ...authenticatedClient(vi.fn()),
      rpc,
    } as MinimalSupabaseClient;

    await expect(
      deferExecutionSessionWithTask(client, sessionId, taskId, {
        actual_minutes: 10,
        notes: null,
      }),
    ).rejects.toThrow("Execution session was not found.");
  });

  it("unplans a persisted local block atomically via rpc", async () => {
    const cancelledBlock = { ...blockRow, status: "cancelled" };
    const activeTask = { ...taskRow, status: "active" };
    const rpc = vi.fn().mockResolvedValue({
      data: { block: cancelledBlock, task: activeTask },
      error: null,
    });
    const client = {
      ...authenticatedClient(vi.fn()),
      rpc,
    } as MinimalSupabaseClient;

    const result = await unplanCalendarBlock(client, blockId);

    expect(rpc).toHaveBeenCalledWith("unplan_calendar_block", {
      p_block_id: blockId,
    });
    expect(result.block.status).toBe("cancelled");
    expect(result.task?.status).toBe("active");
  });

  it("applies review task transitions and cancels open local blocks via rpc", async () => {
    const backlogTask = { ...taskRow, status: "backlog" };
    const cancelledBlock = { ...blockRow, status: "cancelled" };
    const rpc = vi.fn().mockResolvedValue({
      data: { task: backlogTask, blocks: [cancelledBlock] },
      error: null,
    });
    const client = {
      ...authenticatedClient(vi.fn()),
      rpc,
    } as MinimalSupabaseClient;

    const result = await applyTaskReviewTransition(client, taskId, "backlog");

    expect(rpc).toHaveBeenCalledWith("apply_task_review_transition", {
      p_task_id: taskId,
      p_target_status: "backlog",
    });
    expect(result.task.status).toBe("backlog");
    expect(result.blocks[0]?.status).toBe("cancelled");
  });

  it("surfaces Google-backed unplan guard errors from rpc", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        message:
          "Google-backed blocks require calendar approval before unplanning.",
      },
    });
    const client = {
      ...authenticatedClient(vi.fn()),
      rpc,
    } as MinimalSupabaseClient;

    await expect(unplanCalendarBlock(client, blockId)).rejects.toThrow(
      "Google-backed blocks require calendar approval before unplanning.",
    );
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
    expect(result.sessions).toEqual([
      { ...runningSessionRow, cap_outcome: null },
    ]);
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

  const winId = "550e8400-e29b-41d4-a716-446655440901";
  const winRow = {
    id: winId,
    user_id: userId,
    area_id: areaId,
    source_task_id: taskId,
    source_project_id: null,
    title: "Shipped the onboarding flow",
    detail: null,
    occurred_at: "2026-05-08",
    review_entry_id: reviewId,
    created_at: "2026-05-08T18:00:00.000Z",
  };

  it("persists a user-confirmed win through Supabase", async () => {
    const single = vi.fn().mockResolvedValue({ data: winRow, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });

    const result = await createWinRecord(authenticatedClient(from), {
      area_id: areaId,
      source_task_id: taskId,
      title: "Shipped the onboarding flow",
      occurred_at: "2026-05-08",
      review_entry_id: reviewId,
    });

    expect(from).toHaveBeenCalledWith("win_records");
    expect(insert).toHaveBeenCalledWith({
      user_id: userId,
      area_id: areaId,
      source_task_id: taskId,
      source_project_id: null,
      title: "Shipped the onboarding flow",
      detail: null,
      occurred_at: "2026-05-08",
      review_entry_id: reviewId,
    });
    expect(result.provider).toBe("supabase");
    expect(result.winRecord.title).toBe("Shipped the onboarding flow");
  });

  it("rejects a win with no source task or project", async () => {
    await expect(
      createWinRecord(null, {
        area_id: areaId,
        title: "Untethered win",
        occurred_at: "2026-05-08",
      }),
    ).rejects.toThrow(/task or project/);
  });

  it("records a win in mock mode without a client", async () => {
    const result = await createWinRecord(null, {
      area_id: areaId,
      source_project_id: "550e8400-e29b-41d4-a716-446655440111",
      title: "Closed the quarter",
      occurred_at: "2026-05-08",
    });

    expect(result.provider).toBe("mock");
    expect(result.winRecord.source_project_id).toBe(
      "550e8400-e29b-41d4-a716-446655440111",
    );
    expect(result.winRecord.source_task_id).toBeNull();
  });

  it("harvests done tasks and projects since the review, excluding already-harvested sources", async () => {
    const doneTaskFresh = {
      ...taskRow,
      id: "550e8400-e29b-41d4-a716-446655440311",
      title: "Fresh done task",
      status: "done",
      updated_at: "2026-05-09T10:00:00.000Z",
    };
    const doneTaskHarvested = {
      ...taskRow,
      id: "550e8400-e29b-41d4-a716-446655440312",
      title: "Already harvested task",
      status: "done",
      updated_at: "2026-05-09T11:00:00.000Z",
    };
    const doneProject = {
      id: "550e8400-e29b-41d4-a716-446655440411",
      user_id: userId,
      area_id: areaId,
      title: "Launched project",
      description: null,
      status: "done",
      created_at: "2026-05-01T00:00:00.000Z",
      updated_at: "2026-05-09T12:00:00.000Z",
    };

    const from = vi.fn((table: string) => {
      if (table === "win_records") {
        return {
          select: vi.fn().mockResolvedValue({
            data: [
              { source_task_id: doneTaskHarvested.id, source_project_id: null },
            ],
            error: null,
          }),
        };
      }
      const rows =
        table === "tasks" ? [doneTaskFresh, doneTaskHarvested] : [doneProject];
      const order = vi.fn().mockResolvedValue({ data: rows, error: null });
      const gte = vi.fn().mockReturnValue({ order });
      const eq = vi.fn().mockReturnValue({ gte });
      const select = vi.fn().mockReturnValue({ eq });
      return { select };
    });

    const result = await listWinHarvestCandidates(
      authenticatedClient(from as unknown as MinimalSupabaseClient["from"]),
      "2026-05-08T00:00:00.000Z",
    );

    expect(result.provider).toBe("supabase");
    expect(result.candidates).toEqual([
      {
        source_type: "task",
        source_id: doneTaskFresh.id,
        area_id: areaId,
        title: "Fresh done task",
        occurred_at: "2026-05-09",
      },
      {
        source_type: "project",
        source_id: doneProject.id,
        area_id: areaId,
        title: "Launched project",
        occurred_at: "2026-05-09",
      },
    ]);
  });

  it("returns no harvest candidates in mock mode", async () => {
    const result = await listWinHarvestCandidates(null, "2026-05-08");
    expect(result.provider).toBe("mock");
    expect(result.candidates).toEqual([]);
  });

  it("reads win records most-recent first through Supabase", async () => {
    const order = vi.fn().mockResolvedValue({ data: [winRow], error: null });
    const select = vi.fn().mockReturnValue({ order });
    const from = vi.fn().mockReturnValue({ select });

    const result = await listWinRecords(authenticatedClient(from));

    expect(from).toHaveBeenCalledWith("win_records");
    expect(order).toHaveBeenCalledWith("occurred_at", { ascending: false });
    expect(result.provider).toBe("supabase");
    expect(result.winRecords).toHaveLength(1);
    expect(result.winRecords[0].title).toBe("Shipped the onboarding flow");
  });

  const rollupRow = {
    id: "550e8400-e29b-41d4-a716-446655440a01",
    user_id: userId,
    area_id: areaId,
    period_type: "week",
    period_start: "2026-05-04",
    period_end: "2026-05-10",
    summary: {
      highlights: ["Shipped onboarding"],
      misses: [],
      counts: { wins: 1, completed_sessions: 4, missed_sessions: 0 },
    },
    created_at: "2026-05-10T18:00:00.000Z",
  };

  it("persists an approved weekly rollup through Supabase", async () => {
    const single = vi.fn().mockResolvedValue({ data: rollupRow, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });

    const result = await createRollupSummary(authenticatedClient(from), {
      area_id: areaId,
      period_type: "week",
      period_start: "2026-05-04",
      period_end: "2026-05-10",
      summary: rollupRow.summary,
    });

    expect(from).toHaveBeenCalledWith("rollup_summaries");
    expect(insert).toHaveBeenCalledWith({
      user_id: userId,
      area_id: areaId,
      period_type: "week",
      period_start: "2026-05-04",
      period_end: "2026-05-10",
      summary: rollupRow.summary,
    });
    expect(result.provider).toBe("supabase");
    expect(result.rollupSummary.period_type).toBe("week");
  });

  it("records an approved rollup in mock mode without a client", async () => {
    const result = await createRollupSummary(null, {
      area_id: areaId,
      period_type: "month",
      period_start: "2026-05-01",
      period_end: "2026-05-31",
      summary: {
        highlights: ["Launched pricing"],
        misses: [],
        counts: { wins: 3 },
      },
    });

    expect(result.provider).toBe("mock");
    expect(result.rollupSummary.period_type).toBe("month");
    expect(result.rollupSummary.summary.highlights).toEqual([
      "Launched pricing",
    ]);
  });

  it("rejects a rollup whose period_end precedes period_start", async () => {
    await expect(
      createRollupSummary(null, {
        area_id: areaId,
        period_type: "week",
        period_start: "2026-05-10",
        period_end: "2026-05-04",
        summary: { highlights: [], misses: [], counts: {} },
      }),
    ).rejects.toThrow(/period_end/);
  });

  it("reads rollups most-recent first through Supabase", async () => {
    const order = vi.fn().mockResolvedValue({ data: [rollupRow], error: null });
    const select = vi.fn().mockReturnValue({ order });
    const from = vi.fn().mockReturnValue({ select });

    const result = await listRollupSummaries(authenticatedClient(from));

    expect(from).toHaveBeenCalledWith("rollup_summaries");
    expect(order).toHaveBeenCalledWith("period_start", { ascending: false });
    expect(result.provider).toBe("supabase");
    expect(result.rollupSummaries).toHaveLength(1);
    expect(result.rollupSummaries[0].summary.counts.wins).toBe(1);
  });

  const durationProfileRow = {
    id: "550e8400-e29b-41d4-a716-446655440d01",
    user_id: userId,
    area_id: areaId,
    task_type: "deep_work",
    estimate_stats_json: { multiplier: 1.2, sample_count: 3 },
    sample_count: 3,
    last_updated_at: "2026-07-07T12:00:00.000Z",
  };

  it("returns no duration profiles in mock mode", async () => {
    const result = await listDurationProfiles(null);
    expect(result.provider).toBe("mock");
    expect(result.durationProfiles).toEqual([]);
  });

  it("reads duration profiles most-recent first through Supabase", async () => {
    const order = vi
      .fn()
      .mockResolvedValue({ data: [durationProfileRow], error: null });
    const select = vi.fn().mockReturnValue({ order });
    const from = vi.fn().mockReturnValue({ select });

    const result = await listDurationProfiles(authenticatedClient(from));

    expect(from).toHaveBeenCalledWith("duration_profiles");
    expect(order).toHaveBeenCalledWith("last_updated_at", { ascending: false });
    expect(result.provider).toBe("supabase");
    expect(result.durationProfiles).toHaveLength(1);
    expect(result.durationProfiles[0].estimate_stats_json.multiplier).toBe(1.2);
  });

  it("upserts duration profiles through Supabase with the area task conflict key", async () => {
    const single = vi
      .fn()
      .mockResolvedValue({ data: durationProfileRow, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const upsert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ upsert });

    const result = await upsertDurationProfile(authenticatedClient(from), {
      area_id: areaId,
      task_type: "deep_work",
      estimate_stats: { multiplier: 1.2, sample_count: 3 },
      sample_count: 3,
    });

    expect(from).toHaveBeenCalledWith("duration_profiles");
    expect(upsert).toHaveBeenCalledWith(
      {
        user_id: userId,
        area_id: areaId,
        task_type: "deep_work",
        estimate_stats_json: { multiplier: 1.2, sample_count: 3 },
        sample_count: 3,
      },
      { onConflict: "user_id,area_id,task_type" },
    );
    expect(result.provider).toBe("supabase");
    expect(result.durationProfile.task_type).toBe("deep_work");
  });

  it("returns no override records in mock mode", async () => {
    const result = await listOverrideRecords(null);
    expect(result.provider).toBe("mock");
    expect(result.overrideRecords).toEqual([]);
  });

  it("reads override records most-recent first through Supabase", async () => {
    const overrideRow = {
      id: "550e8400-e29b-41d4-a716-446655440b01",
      user_id: userId,
      area_id: areaId,
      policy_identifier: "planning.default_time_block",
      schema_version: "meta-learning-event-v2",
      suggestion_id: null,
      subject_type: "task",
      subject_id: taskId,
      override_type: "edited",
      old_value_json: null,
      new_value_json: null,
      reason: null,
      created_at: "2026-05-10T12:00:00.000Z",
    };
    const order = vi
      .fn()
      .mockResolvedValue({ data: [overrideRow], error: null });
    const select = vi.fn().mockReturnValue({ order });
    const from = vi.fn().mockReturnValue({ select });

    const result = await listOverrideRecords(authenticatedClient(from));

    expect(from).toHaveBeenCalledWith("override_records");
    expect(order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(result.provider).toBe("supabase");
    expect(result.overrideRecords).toHaveLength(1);
    expect(result.overrideRecords[0].override_type).toBe("edited");
  });

  it("returns no suggestion records in mock mode", async () => {
    const result = await listSuggestionRecords(null);
    expect(result.provider).toBe("mock");
    expect(result.suggestionRecords).toEqual([]);
  });

  it("reads suggestion records most-recent first through Supabase", async () => {
    const suggestionRow = {
      id: "550e8400-e29b-41d4-a716-446655440c01",
      user_id: userId,
      area_id: areaId,
      policy_identifier: "planning.default_time_block",
      schema_version: "meta-learning-event-v2",
      suggestion_type: "policy_change",
      subject_type: "policy",
      subject_id: null,
      suggestion_json: null,
      confidence: null,
      status: "accepted",
      resolution_reason: null,
      decided_by: "user",
      created_at: "2026-05-11T12:00:00.000Z",
      resolved_at: "2026-05-11T12:00:00.000Z",
    };
    const order = vi
      .fn()
      .mockResolvedValue({ data: [suggestionRow], error: null });
    const select = vi.fn().mockReturnValue({ order });
    const from = vi.fn().mockReturnValue({ select });

    const result = await listSuggestionRecords(authenticatedClient(from));

    expect(from).toHaveBeenCalledWith("suggestion_records");
    expect(order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(result.provider).toBe("supabase");
    expect(result.suggestionRecords).toHaveLength(1);
    expect(result.suggestionRecords[0].suggestion_type).toBe("policy_change");
  });
});
