import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Area, CaptureItem } from "@lifeos/schemas";
import CalendarPage from "../app/calendar/page";
import CapturePage from "../app/capture/page";
import ExecutePage from "../app/execute/page";
import ReviewPage from "../app/review/page";
import AreasSettingsPage from "../app/settings/areas/page";
import TriagePage from "../app/triage/page";
import { useEffect, useRef } from "react";
import { WorkflowProvider, useWorkflow } from "@/lib/WorkflowContext";

const mocks = vi.hoisted(() => {
  const supabaseClient = { client: "supabase-browser-client" };

  return {
    supabaseClient,
    createSupabaseBrowserClient: vi.fn(() => supabaseClient),
    listAreas: vi.fn(),
    createCaptureItem: vi.fn(),
    createTask: vi.fn(),
    createProject: vi.fn(),
    listPlanningItems: vi.fn(),
    createTimeBlockProposal: vi.fn(),
    editTimeBlockProposal: vi.fn(),
    rejectTimeBlockProposal: vi.fn(),
    acceptTimeBlockProposal: vi.fn(),
    checkTimeBlockProposalConflict: vi.fn(),
    createGoogleCalendarEventFromProposal: vi.fn(),
    listExecutionReviewItems: vi.fn(),
    createExecutionSession: vi.fn(),
    markExecutionSession: vi.fn(),
    createReviewEntry: vi.fn(),
  };
});

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: mocks.createSupabaseBrowserClient,
}));

vi.mock("@/lib/data/workflow", () => ({
  listAreas: mocks.listAreas,
  createCaptureItem: mocks.createCaptureItem,
  createTask: mocks.createTask,
  createProject: mocks.createProject,
  listPlanningItems: mocks.listPlanningItems,
  createTimeBlockProposal: mocks.createTimeBlockProposal,
  editTimeBlockProposal: mocks.editTimeBlockProposal,
  rejectTimeBlockProposal: mocks.rejectTimeBlockProposal,
  acceptTimeBlockProposal: mocks.acceptTimeBlockProposal,
  checkTimeBlockProposalConflict: mocks.checkTimeBlockProposalConflict,
  createGoogleCalendarEventFromProposal:
    mocks.createGoogleCalendarEventFromProposal,
  listExecutionReviewItems: mocks.listExecutionReviewItems,
  createExecutionSession: mocks.createExecutionSession,
  markExecutionSession: mocks.markExecutionSession,
  createReviewEntry: mocks.createReviewEntry,
}));

const area: Area = {
  id: "550e8400-e29b-41d4-a716-446655440101",
  user_id: "550e8400-e29b-41d4-a716-446655440001",
  name: "Main Job",
  slug: "main-job",
  description: "Work commitments and job-related projects.",
  color: "#2563eb",
  icon: "briefcase",
  sort_order: 0,
  is_active: true,
  created_at: "2026-05-07T00:00:00.000Z",
  updated_at: "2026-05-07T00:00:00.000Z",
};

const capture: CaptureItem = {
  id: "550e8400-e29b-41d4-a716-446655440201",
  user_id: "550e8400-e29b-41d4-a716-446655440001",
  area_id: area.id,
  raw_text: "Call dentist tomorrow",
  raw_audio_ref: null,
  capture_mode: "text",
  inferred_area_confidence: null,
  status: "new",
  created_at: "2026-05-07T00:00:00.000Z",
};

const task = {
  id: "550e8400-e29b-41d4-a716-446655440301",
  user_id: area.user_id,
  area_id: area.id,
  project_id: null,
  source_capture_item_id: null,
  title: "Call dentist tomorrow",
  description: null,
  status: "active",
  priority_score: null,
  priority_confidence: 0.78,
  task_type: null,
  energy_type: null,
  estimated_minutes_low: 30,
  estimated_minutes_high: 60,
  due_at: null,
  definition_of_done: "Complete the first useful move and note the outcome.",
  first_tiny_step: "Open the notes",
  created_at: "2026-05-07T00:00:00.000Z",
  updated_at: "2026-05-07T00:00:00.000Z",
};

const project = {
  id: "550e8400-e29b-41d4-a716-446655440401",
  user_id: area.user_id,
  area_id: area.id,
  title: "Volunteer ops system project",
  description: "Draft created from capture: Need a project to organize volunteer ops system",
  status: "active",
  created_at: "2026-05-07T00:00:00.000Z",
  updated_at: "2026-05-07T00:00:00.000Z",
};

const proposal = {
  id: "550e8400-e29b-41d4-a716-446655440501",
  user_id: area.user_id,
  area_id: area.id,
  task_id: task.id,
  proposed_start: "2026-05-08T16:00:00.000Z",
  proposed_end: "2026-05-08T17:00:00.000Z",
  rationale_json: {
    note: "Local planning proposal created from task duration.",
  },
  conflict_flag: false,
  conflict_details_json: null,
  status: "proposed",
  created_at: "2026-05-08T15:00:00.000Z",
};

const block = {
  id: "550e8400-e29b-41d4-a716-446655440601",
  user_id: area.user_id,
  area_id: area.id,
  proposal_id: proposal.id,
  task_id: task.id,
  google_event_id: null,
  start_at: proposal.proposed_start,
  end_at: proposal.proposed_end,
  status: "scheduled",
  created_at: "2026-05-08T15:05:00.000Z",
  updated_at: "2026-05-08T15:05:00.000Z",
};

const session = {
  id: "550e8400-e29b-41d4-a716-446655440701",
  user_id: area.user_id,
  area_id: area.id,
  task_id: task.id,
  calendar_block_id: block.id,
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

const reviewEntry = {
  id: "550e8400-e29b-41d4-a716-446655440801",
  user_id: area.user_id,
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

function SeedCapture({ text }: { text: string }) {
  const { submitCaptureText } = useWorkflow();
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    submitCaptureText(text, "area-main-job");
  }, [submitCaptureText, text]);

  return null;
}

function renderWithWorkflow(ui: React.ReactElement) {
  return render(<WorkflowProvider>{ui}</WorkflowProvider>);
}

describe("Phase 4A Supabase persistence UI", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    window.sessionStorage.clear();
    mocks.createSupabaseBrowserClient.mockReturnValue(mocks.supabaseClient);
  });

  it("shows Supabase areas on settings when configured and authenticated", async () => {
    mocks.listAreas.mockResolvedValue({
      provider: "supabase",
      areas: [area],
    });

    renderWithWorkflow(<AreasSettingsPage />);

    expect(await screen.findByText("Main Job")).toBeDefined();
    expect(screen.getByText("Data source:")).toBeDefined();
    expect(screen.getByText("supabase")).toBeDefined();
    expect(mocks.listAreas).toHaveBeenCalledWith(mocks.supabaseClient);
  });

  it("shows a clear settings error when Supabase is configured but unauthenticated", async () => {
    mocks.listAreas.mockRejectedValue(
      new Error("Sign in before loading areas from Supabase."),
    );

    renderWithWorkflow(<AreasSettingsPage />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Areas could not load");
    expect(alert).toHaveTextContent("Sign in before loading areas from Supabase.");
  });

  it("saves capture_items through Supabase from the capture page", async () => {
    mocks.listAreas.mockResolvedValue({
      provider: "supabase",
      areas: [area],
    });
    mocks.createCaptureItem.mockResolvedValue({
      provider: "supabase",
      capture,
    });

    renderWithWorkflow(<CapturePage />);

    fireEvent.change(
      await screen.findByPlaceholderText("What's on your mind? Type anything..."),
      { target: { value: "Call dentist tomorrow" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save capture" }));

    await waitFor(() => {
      expect(mocks.createCaptureItem).toHaveBeenCalledWith(mocks.supabaseClient, {
        raw_text: "Call dentist tomorrow",
        area_id: area.id,
      });
    });
    expect(await screen.findByText("Capture saved")).toBeDefined();
    expect(screen.getAllByText("supabase")).toHaveLength(2);
  });

  it("shows a clear capture save error when Supabase is unauthenticated", async () => {
    mocks.listAreas.mockResolvedValue({
      provider: "supabase",
      areas: [area],
    });
    mocks.createCaptureItem.mockRejectedValue(
      new Error("Sign in before saving captures to Supabase."),
    );

    renderWithWorkflow(<CapturePage />);

    fireEvent.change(
      await screen.findByPlaceholderText("What's on your mind? Type anything..."),
      { target: { value: "Call dentist tomorrow" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save capture" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Capture was not saved");
    expect(alert).toHaveTextContent("Sign in before saving captures to Supabase.");
  });

  it("accepting a task draft creates a task through Supabase", async () => {
    mocks.listAreas.mockResolvedValue({
      provider: "supabase",
      areas: [area],
    });
    mocks.createTask.mockResolvedValue({
      provider: "supabase",
      task,
    });

    renderWithWorkflow(
      <>
        <SeedCapture text="Call dentist tomorrow" />
        <TriagePage />
      </>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Accept task draft" }));

    await waitFor(() => {
      expect(mocks.createTask).toHaveBeenCalledWith(mocks.supabaseClient, {
        area_id: area.id,
        source_capture_item_id: null,
        title: "Call dentist tomorrow",
        description: "Draft created from capture: Call dentist tomorrow",
        priority_confidence: 0.78,
        estimated_minutes_low: 30,
        estimated_minutes_high: 60,
        first_tiny_step: "Clarify the next concrete step for: Call dentist tomorrow",
      });
    });
  });

  it("accepting a project draft creates a project through Supabase", async () => {
    mocks.listAreas.mockResolvedValue({
      provider: "supabase",
      areas: [area],
    });
    mocks.createProject.mockResolvedValue({
      provider: "supabase",
      project,
    });

    renderWithWorkflow(
      <>
        <SeedCapture text="Need a project to organize volunteer ops system" />
        <TriagePage />
      </>,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Accept project draft" }),
    );

    await waitFor(() => {
      expect(mocks.createProject).toHaveBeenCalledWith(mocks.supabaseClient, {
        area_id: area.id,
        title: "organize volunteer ops system",
        description:
          "Draft created from capture: Need a project to organize volunteer ops system",
      });
    });
  });

  it("rejecting a draft does not create a Supabase task or project", async () => {
    mocks.listAreas.mockResolvedValue({
      provider: "supabase",
      areas: [area],
    });

    renderWithWorkflow(
      <>
        <SeedCapture text="Call dentist tomorrow" />
        <TriagePage />
      </>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Reject task draft" }));

    await waitFor(() => {
      expect(mocks.createTask).not.toHaveBeenCalled();
      expect(mocks.createProject).not.toHaveBeenCalled();
    });
  });

  it("creates persisted local planning proposals from persisted tasks", async () => {
    mocks.listPlanningItems.mockResolvedValue({
      provider: "supabase",
      tasks: [task],
      proposals: [],
      blocks: [],
    });
    mocks.createTimeBlockProposal.mockResolvedValue({
      provider: "supabase",
      proposal,
    });

    renderWithWorkflow(<CalendarPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Propose time" }));

    await waitFor(() => {
      expect(mocks.createTimeBlockProposal).toHaveBeenCalledWith(
        mocks.supabaseClient,
        expect.objectContaining({
          task_id: task.id,
        }),
      );
    });
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Proposal saved through supabase.");
  });

  it("accepting a persisted proposal creates a local calendar block", async () => {
    mocks.listPlanningItems.mockResolvedValue({
      provider: "supabase",
      tasks: [task],
      proposals: [proposal],
      blocks: [],
    });
    mocks.acceptTimeBlockProposal.mockResolvedValue({
      provider: "supabase",
      proposal: { ...proposal, status: "accepted" },
      block,
    });

    renderWithWorkflow(<CalendarPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Accept local block" }));

    await waitFor(() => {
      expect(mocks.acceptTimeBlockProposal).toHaveBeenCalledWith(
        mocks.supabaseClient,
        proposal.id,
      );
    });
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Local block created through supabase.");
  });

  it("checks a persisted proposal for conflicts and updates the badge", async () => {
    mocks.listPlanningItems.mockResolvedValue({
      provider: "supabase",
      tasks: [task],
      proposals: [proposal],
      blocks: [],
    });
    mocks.checkTimeBlockProposalConflict.mockResolvedValue({
      provider: "supabase",
      proposal: {
        ...proposal,
        conflict_flag: true,
        conflict_details_json: {
          provider: "google_calendar",
          status: "checked",
          checked_at: "2026-05-10T15:35:00.000Z",
          has_conflict: true,
        },
      },
      hasConflict: true,
      checkedAt: "2026-05-10T15:35:00.000Z",
    });

    renderWithWorkflow(<CalendarPage />);

    expect(await screen.findByText("Conflict not checked")).toBeDefined();
    fireEvent.click(await screen.findByRole("button", { name: "Check conflict" }));

    await waitFor(() => {
      expect(mocks.checkTimeBlockProposalConflict).toHaveBeenCalledWith(
        mocks.supabaseClient,
        proposal.id,
      );
    });
    expect(await screen.findByText("Conflict flagged")).toBeDefined();
  });

  it("shows a visible error when a conflict check fails without removing the proposal", async () => {
    mocks.listPlanningItems.mockResolvedValue({
      provider: "supabase",
      tasks: [task],
      proposals: [proposal],
      blocks: [],
    });
    mocks.checkTimeBlockProposalConflict.mockRejectedValue(
      new Error("Google Calendar is not connected."),
    );

    renderWithWorkflow(<CalendarPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Check conflict" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Planning change was not saved");
    expect(alert).toHaveTextContent("Google Calendar is not connected.");
    expect(screen.getAllByText("Call dentist tomorrow").length).toBeGreaterThan(0);
  });

  it("creates a Google Calendar event from an explicitly approved persisted proposal", async () => {
    const supabaseClientWithSession = {
      ...mocks.supabaseClient,
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: "supabase-access-token" } },
          error: null,
        }),
      },
    };
    mocks.createSupabaseBrowserClient.mockReturnValue(supabaseClientWithSession);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: true,
            status: "connected",
            connection: {
              status: "connected",
              first_write_warning_acknowledged_at: "2026-05-09T00:00:00.000Z",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    mocks.listPlanningItems.mockResolvedValue({
      provider: "supabase",
      tasks: [task],
      proposals: [proposal],
      blocks: [],
    });
    mocks.createGoogleCalendarEventFromProposal.mockResolvedValue({
      provider: "supabase",
      proposal: { ...proposal, status: "accepted" },
      block: { ...block, google_event_id: "google-event-1" },
      googleEventId: "google-event-1",
    });

    renderWithWorkflow(<CalendarPage />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Create Google Calendar event",
      }),
    );

    await waitFor(() => {
      expect(mocks.createGoogleCalendarEventFromProposal).toHaveBeenCalledWith(
        supabaseClientWithSession,
        expect.objectContaining({
          approved: true,
          proposal_id: proposal.id,
        }),
      );
    });
    expect(await screen.findByText("Google event created")).toBeDefined();
  });

  it("requires first-write warning acknowledgement before enabling event creation", async () => {
    const supabaseClientWithSession = {
      ...mocks.supabaseClient,
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: "supabase-access-token" } },
          error: null,
        }),
      },
    };
    mocks.createSupabaseBrowserClient.mockReturnValue(supabaseClientWithSession);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: true,
            status: "connected",
            connection: {
              status: "connected",
              first_write_warning_acknowledged_at: null,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    mocks.listPlanningItems.mockResolvedValue({
      provider: "supabase",
      tasks: [task],
      proposals: [proposal],
      blocks: [],
    });

    renderWithWorkflow(<CalendarPage />);

    const createButton = await screen.findByRole("button", {
      name: "Create Google Calendar event",
    });
    expect(createButton).toBeDisabled();

    fireEvent.click(
      await screen.findByLabelText(/I understand this creates an event/i),
    );

    await waitFor(() => {
      expect(createButton).not.toBeDisabled();
    });
  });

  it("starts a persisted execution session from a scheduled task block", async () => {
    mocks.listExecutionReviewItems.mockResolvedValue({
      provider: "supabase",
      tasks: [task],
      blocks: [block],
      sessions: [],
      reviewEntries: [],
    });
    mocks.createExecutionSession.mockResolvedValue({
      provider: "supabase",
      session,
      block: { ...block, status: "running" },
    });

    renderWithWorkflow(<ExecutePage />);

    fireEvent.click(await screen.findByRole("button", { name: "Start" }));

    await waitFor(() => {
      expect(mocks.createExecutionSession).toHaveBeenCalledWith(
        mocks.supabaseClient,
        {
          task_id: task.id,
          calendar_block_id: block.id,
        },
      );
    });
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Session started through supabase.");
  });

  it("does not start persisted execution when every task is already non-active", async () => {
    mocks.listExecutionReviewItems.mockResolvedValue({
      provider: "supabase",
      tasks: [{ ...task, status: "done" }],
      blocks: [],
      sessions: [],
      reviewEntries: [],
    });

    renderWithWorkflow(<ExecutePage />);

    expect(await screen.findByText("No active block.")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
    expect(mocks.createExecutionSession).not.toHaveBeenCalled();
  });

  it("completes a persisted execution session", async () => {
    mocks.listExecutionReviewItems.mockResolvedValue({
      provider: "supabase",
      tasks: [task],
      blocks: [{ ...block, status: "running" }],
      sessions: [session],
      reviewEntries: [],
    });
    mocks.markExecutionSession.mockResolvedValue({
      provider: "supabase",
      session: { ...session, outcome: "completed", actual_minutes: 60 },
      block: { ...block, status: "completed" },
      task: { ...task, status: "done" },
    });

    renderWithWorkflow(<ExecutePage />);

    fireEvent.click(await screen.findByRole("button", { name: "Complete" }));

    await waitFor(() => {
      expect(mocks.markExecutionSession).toHaveBeenCalledWith(
        mocks.supabaseClient,
        session.id,
        { status: "completed" },
      );
    });
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Session marked completed through supabase.");
  });

  it("marks a persisted execution session missed", async () => {
    mocks.listExecutionReviewItems.mockResolvedValue({
      provider: "supabase",
      tasks: [task],
      blocks: [{ ...block, status: "running" }],
      sessions: [session],
      reviewEntries: [],
    });
    mocks.markExecutionSession.mockResolvedValue({
      provider: "supabase",
      session: { ...session, outcome: "skipped" },
      block: { ...block, status: "missed" },
      task: null,
    });

    renderWithWorkflow(<ExecutePage />);

    fireEvent.click(await screen.findByRole("button", { name: "Mark missed" }));

    await waitFor(() => {
      expect(mocks.markExecutionSession).toHaveBeenCalledWith(
        mocks.supabaseClient,
        session.id,
        { status: "missed" },
      );
    });
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Session marked missed through supabase.");
  });

  it("creates a persisted review entry from review data", async () => {
    mocks.listExecutionReviewItems.mockResolvedValue({
      provider: "supabase",
      tasks: [task],
      blocks: [block],
      sessions: [{ ...session, outcome: "completed" }],
      reviewEntries: [],
    });
    mocks.listAreas.mockResolvedValue({
      provider: "supabase",
      areas: [area],
    });
    mocks.createReviewEntry.mockResolvedValue({
      provider: "supabase",
      reviewEntry,
    });

    renderWithWorkflow(<ReviewPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Create daily review" }));

    await waitFor(() => {
      expect(mocks.createReviewEntry).toHaveBeenCalledWith(
        mocks.supabaseClient,
        expect.objectContaining({
          review_type: "daily",
          area_id: null,
          summary_json: expect.objectContaining({
            completed_sessions: 1,
            open_tasks: 1,
          }),
        }),
      );
    });
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Review entry created through supabase.");
  });

  it("rolls up persisted review rows by persisted area ids", async () => {
    mocks.listExecutionReviewItems.mockResolvedValue({
      provider: "supabase",
      tasks: [task],
      blocks: [block],
      sessions: [{ ...session, outcome: "completed" }],
      reviewEntries: [],
    });
    mocks.listAreas.mockResolvedValue({
      provider: "supabase",
      areas: [area],
    });

    renderWithWorkflow(<ReviewPage />);

    expect(await screen.findByText("Main Job")).toBeDefined();
    expect(screen.getByText("Open tasks: 1")).toBeDefined();
    expect(screen.getByText("Sessions recorded: 1")).toBeDefined();
  });
});
