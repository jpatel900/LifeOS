import { render, screen, waitFor } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Area, CaptureItem } from "@lifeos/schemas";
import CalendarPage from "../app/calendar/page";
import CapturePage from "../app/capture/page";
import ExecutePage from "../app/execute/page";
import HomePage from "../app/page";
import ReviewPage from "../app/review/page";
import AreasSettingsPage from "../app/settings/areas/page";
import TriagePage from "../app/triage/page";
import { WorkflowProvider, useWorkflow } from "@/lib/WorkflowContext";

const mocks = vi.hoisted(() => {
  const supabaseClient = { client: "supabase-browser-client" };

  return {
    supabaseClient,
    createSupabaseBrowserClient: vi.fn(() => supabaseClient),
    listAreas: vi.fn(),
    listCaptureItems: vi.fn(),
    listPlanningItems: vi.fn(),
    listExecutionReviewItems: vi.fn(),
  };
});

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: mocks.createSupabaseBrowserClient,
}));

vi.mock("@/lib/data/workflow", async () => {
  const actual = await vi.importActual<object>("@/lib/data/workflow");

  return {
    ...actual,
    listAreas: mocks.listAreas,
    listCaptureItems: mocks.listCaptureItems,
    listPlanningItems: mocks.listPlanningItems,
    listExecutionReviewItems: mocks.listExecutionReviewItems,
  };
});

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
  user_id: area.user_id,
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
  status: "active" as const,
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
  status: "proposed" as const,
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
  status: "scheduled" as const,
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
  outcome: "partial" as const,
  notes: null,
  created_at: "2026-05-08T16:05:00.000Z",
};

function SeedCapture({ text }: { text: string }) {
  const { submitCaptureText } = useWorkflow();
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current) {
      return;
    }

    seeded.current = true;
    submitCaptureText(text, "area-main-job");
  }, [submitCaptureText, text]);

  return null;
}

function renderWithWorkflow(ui: React.ReactElement) {
  return render(<WorkflowProvider>{ui}</WorkflowProvider>);
}

describe("workflow area accent routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
    mocks.createSupabaseBrowserClient.mockReturnValue(mocks.supabaseClient);
    mocks.listAreas.mockResolvedValue({
      provider: "supabase",
      areas: [area],
    });
    mocks.listCaptureItems.mockResolvedValue({
      provider: "supabase",
      captures: [capture],
    });
    mocks.listPlanningItems.mockResolvedValue({
      provider: "supabase",
      tasks: [task],
      proposals: [proposal],
      blocks: [block],
    });
    mocks.listExecutionReviewItems.mockResolvedValue({
      provider: "supabase",
      tasks: [task],
      blocks: [block],
      sessions: [session],
      reviewEntries: [],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ok: true,
          status: "mock",
          preferredParser: "mock",
        }),
      })),
    );
  });

  it("keeps the Today next card tied to the current area accent", async () => {
    renderWithWorkflow(<HomePage />);

    await waitFor(() =>
      expect(screen.getByTestId("today-next-card")).toHaveStyle({
        "--area-accent": "#2563eb",
      }),
    );
    expect(screen.getByTestId("today-next-card")).toHaveClass(
      "workflow-primary-card",
      "home-cockpit-flagship-card",
    );
    expect(screen.getByText("Current area: Main Job")).toBeDefined();
  });

  it("styles Capture save options and recent captures with area accent", async () => {
    renderWithWorkflow(
      <>
        <SeedCapture text="Device-only capture for accent coverage" />
        <CapturePage />
      </>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("capture-save-options-card")).toHaveStyle({
        "--area-accent": "#2563eb",
      }),
    );
    expect(screen.getByTestId("capture-main-card")).toHaveClass(
      "workflow-flagship-card",
    );
    expect(screen.getByTestId("capture-header-summary-card")).toHaveClass(
      "workflow-support-card",
    );
    expect(screen.getByTestId("capture-device-history-card")).toHaveClass(
      "workflow-admin-card",
    );
    expect(screen.getByText("Current area: Main Job")).toBeDefined();
    expect(screen.getByTestId("capture-recent-card")).toHaveStyle({
      "--area-accent": "#2563eb",
    });
  });

  it("styles the Triage current item with the draft area accent", async () => {
    renderWithWorkflow(
      <>
        <SeedCapture text="Draft one task for triage" />
        <TriagePage />
      </>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("triage-current-item-card")).toHaveStyle({
        "--area-accent": "#2563eb",
      }),
    );
    expect(screen.getByTestId("triage-header-summary-card")).toHaveClass(
      "workflow-support-card",
    );
    expect(screen.getByTestId("triage-next-action-card")).toHaveClass(
      "workflow-support-card",
    );
    expect(screen.getByTestId("triage-current-item-card")).toHaveClass(
      "workflow-flagship-card",
    );
    expect(screen.getAllByText("Area: Main Job")[0]).toBeDefined();
  });

  it("styles Planning proposal and scheduled block cards with area accent", async () => {
    renderWithWorkflow(<CalendarPage />);

    await waitFor(() =>
      expect(screen.getByTestId("planning-proposal-card")).toHaveStyle({
        "--area-accent": "#2563eb",
      }),
    );
    expect(screen.getByTestId("planning-header-summary-card")).toHaveClass(
      "workflow-support-card",
    );
    expect(screen.getByTestId("planning-flow-card")).toHaveClass(
      "workflow-flagship-card",
    );
    expect(screen.getByTestId("planning-needs-time-card")).toHaveClass(
      "workflow-support-card",
    );
    expect(screen.getByTestId("planning-ready-review-card")).toHaveClass(
      "workflow-support-card",
    );
    expect(screen.getByTestId("planning-planned-blocks-card")).toHaveClass(
      "workflow-support-card",
    );
    expect(screen.getByTestId("planning-scheduled-block-card")).toHaveStyle({
      "--area-accent": "#2563eb",
    });
    expect(screen.getAllByText(/Current area: Main Job/)[0]).toBeDefined();
  });

  it("gives Execute the strongest mission accent treatment", async () => {
    renderWithWorkflow(<ExecutePage />);

    await waitFor(() =>
      expect(screen.getByTestId("execute-current-mission-card")).toHaveStyle({
        "--area-accent": "#2563eb",
      }),
    );
    expect(screen.getByTestId("execute-current-mission-card")).toHaveClass(
      "workflow-primary-card",
      "execute-mission-card",
    );
    expect(screen.getAllByText(/Current area: Main Job/)[0]).toBeDefined();
  });

  it("styles Review summary surfaces with the current area accent", async () => {
    renderWithWorkflow(<ReviewPage />);

    await waitFor(() =>
      expect(screen.getByTestId("review-today-at-a-glance-card")).toHaveStyle({
        "--area-accent": "#2563eb",
      }),
    );
    expect(screen.getByTestId("review-next-decision-card")).toHaveClass(
      "workflow-flagship-card",
      "review-closure-card",
    );
    expect(screen.getByTestId("review-close-loop-card")).toHaveClass(
      "workflow-support-card",
      "review-carry-forward-actions-card",
    );
    expect(screen.getByTestId("review-today-at-a-glance-card")).toHaveClass(
      "workflow-support-card",
      "review-board-card",
    );
    expect(screen.getByTestId("review-reflections-card")).toHaveClass(
      "workflow-admin-card",
      "review-reflections-card-frame",
    );
    expect(screen.getByTestId("review-history-card")).toHaveClass(
      "workflow-admin-card",
      "review-history-card-frame",
    );
    expect(screen.getByTestId("review-carry-forward-card")).toBeDefined();
  });

  it("styles Areas cards with each area's own accent", async () => {
    renderWithWorkflow(<AreasSettingsPage />);

    await waitFor(() =>
      expect(screen.getByTestId("areas-area-card")).toHaveStyle({
        "--area-accent": "#2563eb",
      }),
    );
    expect(screen.getByTestId("areas-create-card")).toHaveClass(
      "workflow-flagship-card",
    );
    expect(screen.getByTestId("areas-header-summary-card")).toHaveClass(
      "workflow-support-card",
      "areas-ownership-summary-card",
    );
    expect(screen.getByTestId("areas-area-card")).toHaveClass(
      "workflow-support-card",
      "areas-record-card",
    );
    expect(screen.getByTestId("areas-local-reset-card")).toHaveClass(
      "workflow-admin-card",
    );
  });
});
