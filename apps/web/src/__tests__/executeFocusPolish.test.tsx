import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useRef, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Area } from "@lifeos/schemas";
import ExecutePage from "../app/execute/page";
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
    markExecutionSession: vi.fn(),
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
    markExecutionSession: mocks.markExecutionSession,
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

const block = {
  id: "550e8400-e29b-41d4-a716-446655440601",
  user_id: area.user_id,
  area_id: area.id,
  proposal_id: "550e8400-e29b-41d4-a716-446655440501",
  task_id: task.id,
  google_event_id: null,
  start_at: "2026-05-08T16:00:00.000Z",
  end_at: "2026-05-08T17:00:00.000Z",
  status: "running" as const,
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

function renderWithWorkflow(ui: ReactElement) {
  return render(<WorkflowProvider>{ui}</WorkflowProvider>);
}

describe("Execute Focus polish", () => {
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
      provider: "mock",
      captures: [],
    });
    mocks.listPlanningItems.mockResolvedValue({
      provider: "mock",
      tasks: [],
      proposals: [],
      blocks: [],
    });
    mocks.listExecutionReviewItems.mockResolvedValue({
      provider: "mock",
      tasks: [],
      blocks: [],
      sessions: [],
      reviewEntries: [],
    });
    mocks.markExecutionSession.mockResolvedValue({
      provider: "supabase",
      session: { ...session, outcome: "partial" },
      block,
      task,
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

  it("shows a clear ready state and keeps side-thought capture secondary", async () => {
    renderWithWorkflow(
      <>
        <SeedAcceptedTask text="Call dentist tomorrow" />
        <ExecutePage />
      </>,
    );

    const stateCard = await screen.findByTestId("execute-focus-state-card");
    expect(stateCard).toHaveAttribute("data-focus-state", "not_started");
    expect(screen.getByText("Ready to focus")).toBeDefined();
    expect(screen.getByText("Current area: Main Job")).toBeDefined();
    expect(
      screen.getByText(
        "Capture it without losing the current mission. Keep it secondary until this focus block is done.",
      ),
    ).toBeDefined();
    expect(screen.queryByText("Recovery / next-step actions")).toBeNull();
  });

  it("moves through running, paused, and terminal mock states without contradictory controls", async () => {
    renderWithWorkflow(
      <>
        <SeedAcceptedTask text="Call dentist tomorrow" />
        <ExecutePage />
      </>,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Start focus session" }),
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("execute-focus-state-card"),
      ).toHaveAttribute("data-focus-state", "running"),
    );
    expect(screen.getByText("Focus in progress")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    await waitFor(() =>
      expect(
        screen.getByTestId("execute-focus-state-card"),
      ).toHaveAttribute("data-focus-state", "paused"),
    );
    expect(screen.getByText("Paused on purpose")).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Resume focus session" }),
    ).toBeDefined();

    fireEvent.click(
      screen.getByRole("button", { name: "Resume focus session" }),
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("execute-focus-state-card"),
      ).toHaveAttribute("data-focus-state", "running"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Stop on this device" }));
    await waitFor(() =>
      expect(
        screen.getByTestId("execute-focus-state-card"),
      ).toHaveAttribute("data-focus-state", "stopped"),
    );
    expect(screen.getByText("Stopped on this device")).toBeDefined();
    expect(
      screen.getAllByRole("link", { name: "Plan next block" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("link", { name: "Capture what got in the way" }),
    ).toBeDefined();
    expect(screen.getByRole("link", { name: "Review this later" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Pause" })).toBeNull();
  });

  it("keeps persisted paused sessions honest by avoiding a fake resume path", async () => {
    mocks.listExecutionReviewItems.mockResolvedValue({
      provider: "supabase",
      tasks: [task],
      blocks: [block],
      sessions: [session],
      reviewEntries: [],
    });

    renderWithWorkflow(<ExecutePage />);

    fireEvent.click(await screen.findByRole("button", { name: "Pause" }));
    await waitFor(() =>
      expect(mocks.markExecutionSession).toHaveBeenCalledWith(
        mocks.supabaseClient,
        session.id,
        { status: "paused" },
      ),
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("execute-focus-state-card"),
      ).toHaveAttribute("data-focus-state", "paused"),
    );
    expect(screen.getByText("Paused and waiting for a real outcome")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Resume" })).toBeNull();
    expect(screen.getByRole("link", { name: "Choose end outcome" })).toBeDefined();
  });
});
