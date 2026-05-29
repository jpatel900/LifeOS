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
    createArea: vi.fn(),
    updateAreaColor: vi.fn(),
    softDeleteArea: vi.fn(),
    listCaptureItems: vi.fn(),
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
  createArea: mocks.createArea,
  updateAreaColor: mocks.updateAreaColor,
  softDeleteArea: mocks.softDeleteArea,
  listCaptureItems: mocks.listCaptureItems,
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
  description:
    "Draft created from capture: Need a project to organize volunteer ops system",
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

const proposalWithCheckedConflict = {
  ...proposal,
  conflict_details_json: {
    provider: "google_calendar",
    status: "checked",
    checked_at: "2026-05-08T15:35:00.000Z",
    has_conflict: false,
  },
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

function SeedAcceptedTask({ text }: { text: string }) {
  const { submitCaptureText, state, acceptTaskDraft } = useWorkflow();
  const captured = useRef(false);
  const accepted = useRef(false);

  useEffect(() => {
    if (captured.current) return;
    captured.current = true;
    submitCaptureText(text, "area-main-job");
  }, [submitCaptureText, text]);

  useEffect(() => {
    if (accepted.current) return;
    const pendingDraft = state.taskDrafts.find(
      (draft) => draft.status === "pending",
    );
    if (!pendingDraft) return;
    accepted.current = true;
    acceptTaskDraft(pendingDraft.id);
  }, [acceptTaskDraft, state.taskDrafts]);

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
    mocks.listExecutionReviewItems.mockResolvedValue({
      provider: "mock",
      tasks: [],
      blocks: [],
      sessions: [],
      reviewEntries: [],
    });
    mocks.listCaptureItems.mockResolvedValue({
      provider: "supabase",
      captures: [],
    });
  });

  it("shows Supabase areas on settings when configured and authenticated", async () => {
    mocks.listAreas.mockResolvedValue({
      provider: "supabase",
      areas: [area],
    });
    mocks.listExecutionReviewItems.mockResolvedValue({
      provider: "supabase",
      tasks: [task],
      blocks: [block],
      sessions: [],
      reviewEntries: [{ ...reviewEntry, area_id: area.id }],
    });

    renderWithWorkflow(<AreasSettingsPage />);

    expect(await screen.findByText("Main Job")).toBeDefined();
    expect(screen.getByText("Save mode:")).toBeDefined();
    expect(screen.getByText("supabase")).toBeDefined();
    expect(screen.queryByText("Slug: main-job")).toBeNull();
    expect(
      screen.getByRole("button", { name: /Use this area|Using this area/ }),
    ).toBeDefined();
    expect(screen.getByRole("link", { name: "Plan area" })).toBeDefined();
    expect(screen.getByText("1 open task")).toBeDefined();
    expect(screen.getByText("1 planned block")).toBeDefined();
    expect(screen.getByText(/Last saved review:/)).toBeDefined();
    expect(mocks.listAreas).toHaveBeenCalledWith(mocks.supabaseClient);
  });

  it("shows a clear settings error when Supabase is configured but unauthenticated", async () => {
    mocks.listAreas.mockRejectedValue(
      new Error("Sign in before loading areas from Supabase."),
    );

    renderWithWorkflow(<AreasSettingsPage />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Areas could not load");
    expect(alert).toHaveTextContent(
      "Sign in before loading areas from Supabase.",
    );
  });

  it("shows an explicit empty-state message when persisted areas are readable but empty", async () => {
    mocks.listAreas.mockResolvedValue({
      provider: "supabase",
      areas: [],
    });
    mocks.listExecutionReviewItems.mockResolvedValue({
      provider: "supabase",
      tasks: [],
      blocks: [],
      sessions: [],
      reviewEntries: [],
    });

    renderWithWorkflow(<AreasSettingsPage />);

    expect(await screen.findByText("No active areas yet.")).toBeDefined();
    expect(screen.getByRole("button", { name: "Create area" })).toBeDefined();
  });

  it("creates a new active area from the zero-area onboarding state", async () => {
    const deepWorkArea: Area = {
      id: "550e8400-e29b-41d4-a716-446655440109",
      user_id: area.user_id,
      name: "Deep Work",
      slug: "deep-work",
      description: "Longer focus sessions.",
      color: null,
      icon: null,
      sort_order: 0,
      is_active: true,
      created_at: "2026-05-28T16:40:00.000Z",
      updated_at: "2026-05-28T16:40:00.000Z",
    };

    mocks.listAreas.mockResolvedValue({
      provider: "supabase",
      areas: [],
    });
    mocks.listExecutionReviewItems.mockResolvedValue({
      provider: "supabase",
      tasks: [],
      blocks: [],
      sessions: [],
      reviewEntries: [],
    });
    mocks.createArea.mockResolvedValue({
      provider: "supabase",
      area: deepWorkArea,
    });

    renderWithWorkflow(<AreasSettingsPage />);

    fireEvent.change(await screen.findByLabelText("Area name"), {
      target: { value: "Deep Work" },
    });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Longer focus sessions." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create area" }));

    expect(mocks.createArea).toHaveBeenCalledWith(mocks.supabaseClient, {
      name: "Deep Work",
      description: "Longer focus sessions.",
    });
    expect(await screen.findByText("Area created.")).toBeDefined();
    expect(screen.getByText("Deep Work")).toBeDefined();
    expect(
      screen.getByRole("button", { name: /Use this area|Using this area/ }),
    ).toBeDefined();
  });

  it("updates an area's accent color and supports resetting back to default", async () => {
    mocks.listAreas.mockResolvedValue({
      provider: "supabase",
      areas: [area],
    });
    mocks.listExecutionReviewItems.mockResolvedValue({
      provider: "supabase",
      tasks: [],
      blocks: [],
      sessions: [],
      reviewEntries: [],
    });
    mocks.updateAreaColor
      .mockResolvedValueOnce({
        provider: "supabase",
        area: { ...area, color: "#0f766e" },
      })
      .mockResolvedValueOnce({
        provider: "supabase",
        area: { ...area, color: null },
      });

    renderWithWorkflow(<AreasSettingsPage />);

    const areaCard = await screen.findByTestId("areas-area-card");
    expect(areaCard).toHaveStyle({ "--area-accent": "#2563eb" });

    fireEvent.click(screen.getByRole("button", { name: "Teal" }));

    await waitFor(() => {
      expect(mocks.updateAreaColor).toHaveBeenNthCalledWith(
        1,
        mocks.supabaseClient,
        {
          area_id: area.id,
          color: "#0f766e",
        },
      );
    });
    expect(areaCard).toHaveStyle({ "--area-accent": "#0f766e" });
    expect(await screen.findByText("Accent updated.")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Default" }));

    await waitFor(() => {
      expect(mocks.updateAreaColor).toHaveBeenNthCalledWith(
        2,
        mocks.supabaseClient,
        {
          area_id: area.id,
          color: null,
        },
      );
    });
    expect(areaCard).toHaveStyle({ "--area-accent": "#64748b" });
  });

  it("soft-deletes an area from active settings cards", async () => {
    mocks.listAreas.mockResolvedValue({
      provider: "supabase",
      areas: [area],
    });
    mocks.listExecutionReviewItems.mockResolvedValue({
      provider: "supabase",
      tasks: [],
      blocks: [],
      sessions: [],
      reviewEntries: [],
    });
    mocks.softDeleteArea.mockResolvedValue({
      provider: "supabase",
      area: {
        ...area,
        is_active: false,
        updated_at: "2026-05-28T16:45:00.000Z",
      },
    });

    renderWithWorkflow(<AreasSettingsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Remove area" }));
    expect(
      await screen.findByRole("button", { name: "Confirm remove" }),
    ).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Confirm remove" }));

    expect(mocks.softDeleteArea).toHaveBeenCalledWith(mocks.supabaseClient, {
      area_id: area.id,
    });
    expect(await screen.findByText("Area removed from active use.")).toBeDefined();
    expect(screen.getByText("No active areas yet.")).toBeDefined();
  });

  it("requires local-reset confirmation, supports cancel, and shows success after reset", async () => {
    mocks.listAreas.mockResolvedValue({
      provider: "supabase",
      areas: [area],
    });
    mocks.listExecutionReviewItems.mockResolvedValue({
      provider: "supabase",
      tasks: [],
      blocks: [],
      sessions: [],
      reviewEntries: [],
    });

    renderWithWorkflow(<AreasSettingsPage />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Reset this browser" }),
    );

    expect(
      await screen.findByText("Reset local data on this browser?"),
    ).toBeDefined();
    expect(
      screen.getByText(
        /This only clears on-device data on this device\. It does not delete cloud data\./i,
      ),
    ).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(
        screen.queryByText("Reset local data on this browser?"),
      ).toBeNull();
    });
    expect(screen.queryByRole("status")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Reset this browser" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Yes, reset this browser" }),
    );

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Local browser data reset.");
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
      await screen.findByPlaceholderText(
        "What's on your mind? Type anything...",
      ),
      { target: { value: "Call dentist tomorrow" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save thought" }));

    await waitFor(() => {
      expect(mocks.createCaptureItem).toHaveBeenCalledWith(
        mocks.supabaseClient,
        {
          raw_text: "Call dentist tomorrow",
          area_id: area.id,
        },
      );
    });
    expect(await screen.findByText("Saved.")).toBeDefined();
    expect(screen.getAllByText("Saved to account").length).toBeGreaterThan(0);
    expect(screen.getByText("Technical save mode id:")).toBeDefined();
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
      await screen.findByPlaceholderText(
        "What's on your mind? Type anything...",
      ),
      { target: { value: "Call dentist tomorrow" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save thought" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Capture was not saved");
    expect(alert).toHaveTextContent(
      "Sign in before saving captures to Supabase.",
    );
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

    fireEvent.click(
      await screen.findByRole("button", { name: "Accept task draft" }),
    );

    await waitFor(() => {
      expect(mocks.createTask).toHaveBeenCalledWith(mocks.supabaseClient, {
        area_id: area.id,
        source_capture_item_id: null,
        title: "Call dentist tomorrow",
        description: "Draft created from capture: Call dentist tomorrow",
        priority_confidence: 0.78,
        estimated_minutes_low: 30,
        estimated_minutes_high: 60,
        first_tiny_step:
          "Clarify the next concrete step for: Call dentist tomorrow",
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

    fireEvent.click(await screen.findByRole("button", { name: "Review this next" }));
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

    fireEvent.click(
      await screen.findByRole("button", { name: "Reject task draft" }),
    );

    await waitFor(() => {
      expect(mocks.createTask).not.toHaveBeenCalled();
      expect(mocks.createProject).not.toHaveBeenCalled();
    });
  });

  it("labels triage note actions as browser-only notes, not workflow changes", async () => {
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

    fireEvent.click(
      await screen.findByRole("button", { name: "Mark for later" }),
    );

    expect(await screen.findByText("Note saved in this browser")).toBeDefined();
    expect(
      screen.getAllByText("Added note: review later.").length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("Draft notes")).toBeDefined();
    expect(
      screen.getAllByText(/Added note: review later\./).length,
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Add area note" }));
    expect(
      await screen.findByText("Added note: consider changing area."),
    ).toBeDefined();

    expect(
      screen.getByText(
        "This adds a note for now; it does not move the item yet.",
      ),
    ).toBeDefined();
    expect(mocks.createTask).not.toHaveBeenCalled();
  });

  it("marks clarity notes as based on original capture after editing", async () => {
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

    fireEvent.click(await screen.findByRole("button", { name: "Edit draft" }));
    fireEvent.change(await screen.findByLabelText("Title"), {
      target: { value: "Call dentist and confirm insurance details" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save edit" }));

    expect(
      await screen.findByText("AI notes are from the original capture"),
    ).toBeDefined();
    expect(
      screen.getByText(/Re-sort in Capture if you want updated AI notes\./),
    ).toBeDefined();
  });

  it("shows triage empty-state guidance with a capture next step", async () => {
    mocks.listAreas.mockResolvedValue({
      provider: "supabase",
      areas: [area],
    });

    renderWithWorkflow(<TriagePage />);

    expect(
      await screen.findByText("Nothing to triage right now."),
    ).toBeDefined();
    expect(screen.getByRole("link", { name: "Go to Capture" })).toBeDefined();
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

    fireEvent.click(
      await screen.findByRole("button", { name: "Suggest a time" }),
    );

    await waitFor(() => {
      expect(mocks.createTimeBlockProposal).toHaveBeenCalledWith(
        mocks.supabaseClient,
        expect.objectContaining({
          task_id: task.id,
          rationale_note:
            "Quick proposal: next available hour. You can adjust this before approving.",
        }),
      );
    });
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(
      "Suggested time block created. Saved to your account.",
    );
    expect(screen.getByText("Accepted")).toBeDefined();
  });

  it("shows a planning load failure without crashing the page", async () => {
    mocks.listPlanningItems.mockRejectedValue(
      new Error("Sign in before loading planning rows from Supabase."),
    );

    renderWithWorkflow(<CalendarPage />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Planning rows could not load");
    expect(alert).toHaveTextContent(
      "Sign in before loading planning rows from Supabase.",
    );
  });

  it("shows an explicit planning empty state when persisted rows are empty", async () => {
    mocks.listPlanningItems.mockResolvedValue({
      provider: "supabase",
      tasks: [],
      proposals: [],
      blocks: [],
    });

    renderWithWorkflow(<CalendarPage />);

    expect(await screen.findByText("Nothing needs time yet.")).toBeDefined();
    expect(
      screen.getByRole("link", { name: "Get a task ready in Triage" }),
    ).toBeDefined();
    expect(
      screen.getByText(
        "Suggested and planned time blocks appear here after you suggest time for a task. Checking Google Calendar is optional and does not create events.",
      ),
    ).toBeDefined();
  });

  it("keeps accepted demo tasks plannable with a local draft-block action", async () => {
    mocks.listPlanningItems.mockResolvedValue({
      provider: "mock",
      tasks: [],
      proposals: [],
      blocks: [],
    });

    renderWithWorkflow(
      <>
        <SeedAcceptedTask text="Call dentist tomorrow" />
        <CalendarPage />
      </>,
    );

    expect(await screen.findByText("Needs time")).toBeDefined();
    expect(screen.getAllByText("Call dentist tomorrow").length).toBeGreaterThan(
      0,
    );

    fireEvent.click(
      screen.getAllByRole("button", { name: "Suggest a time" })[0],
    );

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(
      "Suggested time block created. Saved on this device.",
    );
    expect(screen.getAllByText("Suggested time").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(
        "Quick proposal: next available hour. You can adjust this before approving.",
      ).length,
    ).toBeGreaterThan(0);
    expect(mocks.createTimeBlockProposal).not.toHaveBeenCalled();
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

    fireEvent.click(
      await screen.findByRole("button", { name: "Plan this time" }),
    );

    await waitFor(() => {
      expect(mocks.acceptTimeBlockProposal).toHaveBeenCalledWith(
        mocks.supabaseClient,
        proposal.id,
      );
    });
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(
      "Planned block created. Saved to your account.",
    );
  });

  it("adjusts a persisted proposal through explicit inline adjustment controls", async () => {
    mocks.listPlanningItems.mockResolvedValue({
      provider: "supabase",
      tasks: [task],
      proposals: [proposal],
      blocks: [],
    });
    mocks.editTimeBlockProposal.mockResolvedValue({
      provider: "supabase",
      proposal: {
        ...proposal,
        proposed_start: "2026-05-08T16:30:00.000Z",
        proposed_end: "2026-05-08T17:30:00.000Z",
        status: "edited",
      },
    });

    renderWithWorkflow(<CalendarPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Adjust time" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Move 30 min later" }),
    );

    await waitFor(() => {
      expect(mocks.editTimeBlockProposal).toHaveBeenCalledWith(
        mocks.supabaseClient,
        proposal.id,
        {
          proposed_start: "2026-05-08T16:30:00.000Z",
          proposed_end: "2026-05-08T17:30:00.000Z",
        },
      );
    });
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(
      "Suggested time block moved 30 minutes later. Saved to your account.",
    );
  });

  it("checks a persisted proposal for conflicts and updates the badge", async () => {
    const supabaseClientWithSession = {
      ...mocks.supabaseClient,
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: "supabase-access-token" } },
          error: null,
        }),
      },
    };
    mocks.createSupabaseBrowserClient.mockReturnValue(
      supabaseClientWithSession,
    );
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

    expect(await screen.findByText("Calendar not checked")).toBeDefined();
    fireEvent.click(
      await screen.findByRole("button", { name: "Check calendar availability" }),
    );

    await waitFor(() => {
      expect(mocks.checkTimeBlockProposalConflict).toHaveBeenCalledWith(
        supabaseClientWithSession,
        proposal.id,
      );
    });
    expect(await screen.findByText("Calendar conflict found")).toBeDefined();
  });

  it("shows an inline disabled reason when conflict checks are unavailable without Google connection", async () => {
    mocks.listPlanningItems.mockResolvedValue({
      provider: "supabase",
      tasks: [task],
      proposals: [proposalWithCheckedConflict],
      blocks: [],
    });

    renderWithWorkflow(<CalendarPage />);

    fireEvent.click(await screen.findByText("Google Calendar options"));
    const checkConflictButton = await screen.findByRole("button", {
      name: "Check calendar availability",
    });
    expect(checkConflictButton).toBeDisabled();
    expect(
      screen.getByText(
        "Check calendar availability disabled: Connect Google Calendar first.",
      ),
    ).toBeDefined();
    expect(mocks.checkTimeBlockProposalConflict).not.toHaveBeenCalled();
    expect(screen.getAllByText("Call dentist tomorrow").length).toBeGreaterThan(
      0,
    );
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
    mocks.createSupabaseBrowserClient.mockReturnValue(
      supabaseClientWithSession,
    );
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
      proposals: [proposalWithCheckedConflict],
      blocks: [],
    });
    mocks.createGoogleCalendarEventFromProposal.mockResolvedValue({
      provider: "supabase",
      proposal: { ...proposalWithCheckedConflict, status: "accepted" },
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
          proposal_id: proposalWithCheckedConflict.id,
        }),
      );
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Google Calendar event created. Saved to your account.",
    );
    expect(
      screen.getByText("Google Calendar: Added to Google Calendar"),
    ).toBeDefined();
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
    mocks.createSupabaseBrowserClient.mockReturnValue(
      supabaseClientWithSession,
    );
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
      proposals: [proposalWithCheckedConflict],
      blocks: [],
    });

    renderWithWorkflow(<CalendarPage />);

    const createButton = await screen.findByRole("button", {
      name: "Create Google Calendar event",
    });
    expect(createButton).toBeDisabled();

    fireEvent.click(
      await screen.findByLabelText(/First Google write approval/i),
    );

    await waitFor(() => {
      expect(createButton).not.toBeDisabled();
    });
  });

  it("shows explicit duplicate-write copy when a proposal already has a Google event", async () => {
    const supabaseClientWithSession = {
      ...mocks.supabaseClient,
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: "supabase-access-token" } },
          error: null,
        }),
      },
    };
    mocks.createSupabaseBrowserClient.mockReturnValue(
      supabaseClientWithSession,
    );
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
      proposals: [proposalWithCheckedConflict],
      blocks: [],
    });
    mocks.createGoogleCalendarEventFromProposal.mockRejectedValue(
      new Error(
        "This proposal already has a Google Calendar event. Duplicate event creation is blocked.",
      ),
    );

    renderWithWorkflow(<CalendarPage />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Create Google Calendar event",
      }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Duplicate Google event blocked");
    expect(alert).toHaveTextContent(
      "already has a linked Google Calendar event",
    );
    expect(screen.getAllByText("Call dentist tomorrow").length).toBeGreaterThan(
      0,
    );
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
    expect(status).toHaveTextContent("Session started. Saved to your account.");
    expect(screen.getByText("In focus")).toBeDefined();
  });

  it("shows an execution load failure and keeps the no-active-block fallback visible", async () => {
    mocks.listExecutionReviewItems.mockRejectedValue(
      new Error("Sign in before loading execution rows from Supabase."),
    );

    renderWithWorkflow(<ExecutePage />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Execution rows could not load");
    expect(alert).toHaveTextContent(
      "Sign in before loading execution rows from Supabase.",
    );
    expect(screen.getByText("No current task is in execution.")).toBeDefined();
    expect(
      screen.getByText(
        "Plan one block in Planning or capture and triage a task first.",
      ),
    ).toBeDefined();
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

    expect(
      await screen.findByText("No current task is in execution."),
    ).toBeDefined();
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
    fireEvent.change(await screen.findByLabelText("Actual duration minutes"), {
      target: { value: "58" },
    });
    fireEvent.change(await screen.findByLabelText("Productivity rating"), {
      target: { value: "4" },
    });
    fireEvent.change(await screen.findByLabelText("End session notes"), {
      target: { value: "Finished the planned block." },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "Save end session" }),
    );

    await waitFor(() => {
      expect(mocks.markExecutionSession).toHaveBeenCalledWith(
        mocks.supabaseClient,
        session.id,
        {
          status: "completed",
          outcome: "completed",
          actual_minutes: 58,
          productivity_rating: 4,
          notes: "Finished the planned block.",
        },
      );
    });
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(
      "Session marked completed. Saved to your account.",
    );
  });

  it("keeps persisted stop as guidance instead of a fake disabled control", async () => {
    mocks.listExecutionReviewItems.mockResolvedValue({
      provider: "supabase",
      tasks: [task],
      blocks: [{ ...block, status: "running" }],
      sessions: [session],
      reviewEntries: [],
    });

    renderWithWorkflow(<ExecutePage />);

    expect(await screen.findByText("End this session")).toBeDefined();
    expect(
      screen.queryByRole("button", { name: "Stop (device-only sessions)" }),
    ).toBeNull();
    expect(
      screen.getByText(
        "Stop (device-only sessions) is only available when the session lives on this device. Sessions saved to your account need an end outcome and notes.",
      ),
    ).toBeDefined();
  });

  it("hides stop in demo mode until a device-only session is actually running", async () => {
    mocks.listExecutionReviewItems.mockResolvedValue({
      provider: "mock",
      tasks: [],
      blocks: [],
      sessions: [],
      reviewEntries: [],
    });

    renderWithWorkflow(
      <>
        <SeedAcceptedTask text="Call dentist tomorrow" />
        <ExecutePage />
      </>,
    );

    expect(await screen.findByRole("button", { name: "Start" })).toBeDefined();
    expect(
      screen.queryByRole("button", { name: "Stop on this device" }),
    ).toBeNull();
    expect(
      screen.getByText("Start when you are ready to focus on this one task."),
    ).toBeDefined();
  });

  it("keeps demo stop terminal state coherent and restartable", async () => {
    mocks.listExecutionReviewItems.mockResolvedValue({
      provider: "mock",
      tasks: [],
      blocks: [],
      sessions: [],
      reviewEntries: [],
    });

    renderWithWorkflow(
      <>
        <SeedAcceptedTask text="Call dentist tomorrow" />
        <ExecutePage />
      </>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Start" }));
    expect(
      await screen.findByRole("button", { name: "Stop on this device" }),
    ).toBeDefined();

    fireEvent.click(
      screen.getByRole("button", { name: "Stop on this device" }),
    );

    expect(await screen.findByText("Stopped on this device")).toBeDefined();
    expect(
      screen.getByText(
        "Session stopped on this device. Decide the next useful step.",
      ),
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Start another session" }),
    ).toBeDefined();
    expect(screen.queryByRole("button", { name: "Complete" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Pause" })).toBeNull();
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

    fireEvent.click(await screen.findByRole("button", { name: "Missed" }));
    fireEvent.change(await screen.findByLabelText("Actual duration minutes"), {
      target: { value: "5" },
    });
    fireEvent.change(await screen.findByLabelText("Productivity rating"), {
      target: { value: "2" },
    });
    fireEvent.change(await screen.findByLabelText("End session notes"), {
      target: { value: "Interrupted by another urgent item." },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "Save end session" }),
    );

    await waitFor(() => {
      expect(mocks.markExecutionSession).toHaveBeenCalledWith(
        mocks.supabaseClient,
        session.id,
        {
          status: "missed",
          outcome: "skipped",
          actual_minutes: 5,
          productivity_rating: 2,
          notes: "Interrupted by another urgent item.",
        },
      );
    });
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(
      "Session marked missed. Saved to your account.",
    );
    expect(screen.getByText("Needs review")).toBeDefined();
    expect(
      screen.getByText(
        "Session ended as missed. Capture why it was missed, then re-plan.",
      ),
    ).toBeDefined();
    expect(
      screen.getByRole("link", { name: "Plan another block" }),
    ).toBeDefined();
    expect(
      screen.getByRole("link", { name: "Capture what got in the way" }),
    ).toBeDefined();
    expect(
      screen.getByRole("link", { name: "Review this later" }),
    ).toBeDefined();
    expect(
      screen.getByRole("link", { name: "Plan next block" }),
    ).toBeDefined();
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
    mocks.listCaptureItems.mockResolvedValue({
      provider: "supabase",
      captures: [],
    });
    mocks.createReviewEntry.mockResolvedValue({
      provider: "supabase",
      reviewEntry,
    });

    renderWithWorkflow(<ReviewPage />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Create daily review" }),
    );

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
    expect(status).toHaveTextContent("Review entry saved to your account.");
  });

  it("rolls up persisted review rows by persisted area ids", async () => {
    mocks.listExecutionReviewItems.mockResolvedValue({
      provider: "supabase",
      tasks: [task],
      blocks: [block],
      sessions: [{ ...session, outcome: "completed" }],
      reviewEntries: [reviewEntry],
    });
    mocks.listAreas.mockResolvedValue({
      provider: "supabase",
      areas: [area],
    });
    mocks.listCaptureItems.mockResolvedValue({
      provider: "supabase",
      captures: [],
    });

    renderWithWorkflow(<ReviewPage />);

    expect(await screen.findByText("Main Job")).toBeDefined();
    expect(screen.getAllByText("Open tasks: 1").length).toBeGreaterThan(0);
    expect(screen.getByText("Sessions recorded: 1")).toBeDefined();
    expect(screen.getByText("Reviewed")).toBeDefined();
    expect(screen.getByText("Today at a glance")).toBeDefined();
    expect(screen.getByText("Past reviews and notes")).toBeDefined();
    expect(screen.getByText("Open saved review details")).toBeDefined();
    expect(screen.getByText(/daily review for/i)).toBeDefined();
  });

  it("renders historical review rows safely when the linked area is no longer active", async () => {
    mocks.listExecutionReviewItems.mockResolvedValue({
      provider: "supabase",
      tasks: [],
      blocks: [],
      sessions: [],
      reviewEntries: [
        {
          ...reviewEntry,
          area_id: "550e8400-e29b-41d4-a716-446655440999",
        },
      ],
    });
    mocks.listAreas.mockResolvedValue({
      provider: "supabase",
      areas: [area],
    });
    mocks.listCaptureItems.mockResolvedValue({
      provider: "supabase",
      captures: [],
    });

    renderWithWorkflow(<ReviewPage />);

    fireEvent.click(await screen.findByText("Open saved review details"));
    expect(await screen.findByText("Saved area")).toBeDefined();
  });

  it("does not mix local session capture counts into persisted review summaries", async () => {
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
    mocks.listCaptureItems.mockResolvedValue({
      provider: "supabase",
      captures: [],
    });

    renderWithWorkflow(
      <>
        <SeedCapture text="Local capture should not appear in persisted review counts" />
        <ReviewPage />
      </>,
    );

    await waitFor(() => {
      expect(mocks.listCaptureItems).toHaveBeenCalledWith(mocks.supabaseClient);
    });
    await waitFor(() => {
      expect(
        screen.queryByText(
          "Local capture should not appear in persisted review counts",
        ),
      ).toBeNull();
    });
    expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Nothing is stuck in capture right now."),
    ).toBeDefined();
  });

  it("shows local capture context in review when provider is mock", async () => {
    mocks.listExecutionReviewItems.mockResolvedValue({
      provider: "mock",
      tasks: [],
      blocks: [],
      sessions: [],
      reviewEntries: [],
    });

    renderWithWorkflow(
      <>
        <SeedCapture text="Local-only capture for review surface" />
        <ReviewPage />
      </>,
    );

    expect(await screen.findByText(/Save mode:/)).toBeDefined();
    expect(screen.getByText("Captured and still waiting")).toBeDefined();
    expect(screen.getByText("Local-only capture for review surface")).toBeDefined();
    expect(screen.getByText("Open raw browser notes")).toBeDefined();
  });
});
