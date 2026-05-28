import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TriagePage from "../app/triage/page";
import { WorkflowProvider } from "@/lib/WorkflowContext";
import { createInitialWorkflowState } from "@/lib/workflow";
import type { Area } from "@lifeos/schemas";

const STORAGE_KEY = "lifeos.phase2.workflow";

const mocks = vi.hoisted(() => ({
  createSupabaseBrowserClient: vi.fn(() => ({ client: "supabase-browser" })),
  listAreas: vi.fn(),
  createTask: vi.fn(),
  createProject: vi.fn(),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: mocks.createSupabaseBrowserClient,
}));

vi.mock("@/lib/data/workflow", () => ({
  listAreas: mocks.listAreas,
  createTask: mocks.createTask,
  createProject: mocks.createProject,
}));

const persistedArea: Area = {
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

function renderTriagePage(
  storedState: ReturnType<typeof createInitialWorkflowState>,
) {
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(storedState));
  return render(
    <WorkflowProvider>
      <TriagePage />
    </WorkflowProvider>,
  );
}

describe("TriagePage", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.clearAllMocks();
    mocks.listAreas.mockResolvedValue({
      provider: "mock",
      areas: [persistedArea],
    });
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("shows one current item and lets the user switch the queue", async () => {
    const storedState = createInitialWorkflowState();
    storedState.taskDrafts = [
      {
        id: "task-draft-1",
        user_id: "user-1",
        capture_item_id: "capture-1",
        area_id: "area-personal",
        title: "Call dentist tomorrow",
        description: "Confirm the next available appointment.",
        confidence: 0.82,
        estimated_minutes_low: 10,
        estimated_minutes_high: 15,
        first_tiny_step: "Look up the clinic number.",
        status: "pending",
        created_at: "2026-05-27T12:00:00.000Z",
      },
    ];
    storedState.projectDrafts = [
      {
        id: "project-draft-1",
        user_id: "user-1",
        capture_item_id: "capture-2",
        area_id: "area-main-job",
        title: "Plan annual review rollout",
        description: "Project scope notes",
        confidence: 0.61,
        status: "pending",
        created_at: "2026-05-27T12:05:00.000Z",
      },
    ];
    storedState.ambiguityAssessments = [
      {
        id: "ambiguity-1",
        user_id: "user-1",
        area_id: "area-personal",
        source_capture_item_id: "capture-1",
        likely_objective: "Book a dentist appointment",
        possible_workstreams: ["Book the appointment"],
        knowns: ["Need a checkup"],
        recommended_first_move: "Check office hours",
        assumptions: ["The clinic still accepts appointments"],
        constraints: ["Need a weekday slot"],
        risks: ["Waiting too long"],
        unknowns: ["Preferred day"],
        confidence_score: 0.82,
        review_trigger: "Needs a quick human decision",
        what_not_to_do_yet: ["Do not rearrange the whole week yet"],
        created_at: "2026-05-27T12:00:00.000Z",
        dependencies: ["Clinic phone line"],
      },
    ];

    renderTriagePage(storedState);

    expect(await screen.findByText("Current item")).toBeDefined();
    expect(screen.getAllByText("Needs decision").length).toBeGreaterThan(0);
    expect(screen.getByText("Call dentist tomorrow")).toBeDefined();
    expect(screen.getByText("First useful move: Check office hours")).toBeDefined();
    expect(screen.getByText("Plan annual review rollout")).toBeDefined();
    expect(screen.queryByText("Project scope notes")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Review this next" }));

    await waitFor(() =>
      expect(screen.getByText("Project scope notes")).toBeDefined(),
    );
    expect(
      screen.queryByText("First useful move: Check office hours"),
    ).toBeNull();
  });

  it("shows a plain-language empty state when no drafts are waiting", async () => {
    renderTriagePage(createInitialWorkflowState());

    expect(
      await screen.findByText("Nothing to triage right now."),
    ).toBeDefined();
    expect(
      screen.getByText(
        "No pending suggestions in this browser. Go to Capture, save a thought, then return here to review it.",
      ),
    ).toBeDefined();
  });
});
