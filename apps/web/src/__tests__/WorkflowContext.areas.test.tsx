import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CapturePage from "../app/capture/page";
import { WorkflowProvider, useWorkflow } from "@/lib/WorkflowContext";
import { stubParseCaptureFetch } from "./helpers/parseCaptureFetch";

vi.mock("next/navigation", () => ({
  usePathname: () => "/capture",
  useRouter: () => ({ push: vi.fn() }),
}));

const {
  mockListAreas,
  mockListCaptureItems,
  mockListPlanningItems,
  mockListExecutionReviewItems,
  mockCreateCaptureItem,
  mockCreateTask,
  mockCreateTimeBlockProposal,
  mockCreateSupabaseBrowserClient,
} = vi.hoisted(() => ({
  mockListAreas: vi.fn(),
  mockListCaptureItems: vi.fn(),
  mockListPlanningItems: vi.fn(),
  mockListExecutionReviewItems: vi.fn(),
  mockCreateCaptureItem: vi.fn(),
  mockCreateTask: vi.fn(),
  mockCreateTimeBlockProposal: vi.fn(),
  mockCreateSupabaseBrowserClient: vi.fn(() => ({ mocked: true })),
}));

vi.mock("@/lib/data/workflow", async () => {
  const actual = await vi.importActual<typeof import("@/lib/data/workflow")>(
    "@/lib/data/workflow",
  );

  return {
    ...actual,
    listAreas: mockListAreas,
    listCaptureItems: mockListCaptureItems,
    listPlanningItems: mockListPlanningItems,
    listExecutionReviewItems: mockListExecutionReviewItems,
    createCaptureItem: mockCreateCaptureItem,
    createTask: mockCreateTask,
    createTimeBlockProposal: mockCreateTimeBlockProposal,
  };
});

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: mockCreateSupabaseBrowserClient,
}));

function AreaProbe() {
  const { state, selectedAreaId } = useWorkflow();

  return (
    <div>
      <span data-testid="area-count">{state.areas.length}</span>
      <span data-testid="first-area-id">{state.areas[0]?.id ?? ""}</span>
      <span data-testid="selected-area-id">{selectedAreaId ?? ""}</span>
    </div>
  );
}

function WorkflowRowsProbe() {
  const { state, selectedAreaId } = useWorkflow();
  const firstTask = state.tasks[0];

  return (
    <div>
      <span data-testid="selected-area-id">{selectedAreaId ?? ""}</span>
      <span data-testid="task-count">{state.tasks.length}</span>
      <span data-testid="first-task-area">{firstTask?.area_id ?? ""}</span>
      <span data-testid="first-task-title">{firstTask?.title ?? ""}</span>
    </div>
  );
}

function SyncStatusProbe() {
  const { syncStatus } = useWorkflow();

  return (
    <div>
      <span data-testid="sync-account">{syncStatus.account}</span>
      <span data-testid="sync-message">{syncStatus.message ?? ""}</span>
    </div>
  );
}

function TriageActionProbe() {
  const { state, selectedAreaId, submitCaptureText, backlogTaskDraft } =
    useWorkflow();
  const draft = state.taskDrafts[0];

  return (
    <div>
      <span data-testid="selected-area-id">{selectedAreaId ?? ""}</span>
      <span data-testid="draft-count">{state.taskDrafts.length}</span>
      <button
        type="button"
        onClick={() =>
          submitCaptureText("Review the future idea", selectedAreaId)
        }
      >
        Capture
      </button>
      <button
        type="button"
        disabled={!draft}
        onClick={() => draft && backlogTaskDraft(draft.id)}
      >
        Someday
      </button>
    </div>
  );
}

const persistedArea = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "22222222-2222-4222-8222-222222222222",
  name: "Main Job",
  slug: "main-job",
  description: "Persisted area",
  color: "#2563eb",
  icon: "briefcase",
  sort_order: 0,
  is_active: true,
  created_at: "2026-05-27T00:00:00.000Z",
  updated_at: "2026-05-27T00:00:00.000Z",
};

const persistedTask = {
  id: "33333333-3333-4333-8333-333333333333",
  user_id: persistedArea.user_id,
  area_id: persistedArea.id,
  project_id: null,
  source_capture_item_id: null,
  title: "Persisted task",
  description: null,
  status: "active",
  priority_score: null,
  priority_confidence: 0.7,
  task_type: null,
  energy_type: null,
  estimated_minutes_low: 15,
  estimated_minutes_high: 30,
  due_at: null,
  definition_of_done: "Complete the first useful move and note the outcome.",
  first_tiny_step: "Open the task",
  created_at: "2026-05-27T00:00:00.000Z",
  updated_at: "2026-05-27T00:00:00.000Z",
};

let restoreParseCaptureFetch: () => void;

beforeEach(() => {
  restoreParseCaptureFetch = stubParseCaptureFetch();
  mockListAreas.mockResolvedValue({
    provider: "supabase",
    areas: [persistedArea],
  });
  mockListCaptureItems.mockResolvedValue({
    provider: "supabase",
    captures: [],
  });
  mockListPlanningItems.mockResolvedValue({
    provider: "supabase",
    tasks: [],
    proposals: [],
    blocks: [],
  });
  mockListExecutionReviewItems.mockResolvedValue({
    provider: "supabase",
    tasks: [],
    blocks: [],
    sessions: [],
    reviewEntries: [],
  });
  mockCreateCaptureItem.mockResolvedValue({
    provider: "supabase",
    capture: {
      id: "44444444-4444-4444-8444-444444444444",
      user_id: persistedArea.user_id,
      area_id: persistedArea.id,
      raw_text: "Review the future idea",
      raw_audio_ref: null,
      capture_mode: "text",
      inferred_area_confidence: null,
      status: "new",
      created_at: "2026-05-27T00:00:00.000Z",
    },
  });
  mockCreateTask.mockResolvedValue({
    provider: "supabase",
    task: { ...persistedTask, status: "backlog" },
  });
  mockCreateTimeBlockProposal.mockResolvedValue({
    provider: "supabase",
    proposal: null,
  });
});

afterEach(() => {
  restoreParseCaptureFetch();
  vi.clearAllMocks();
});

describe("WorkflowProvider persisted area sync", () => {
  it("replaces the mock area list when persisted areas are available", async () => {
    mockListAreas.mockResolvedValue({
      provider: "supabase",
      areas: [persistedArea],
    });

    render(
      <WorkflowProvider>
        <AreaProbe />
      </WorkflowProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("area-count")).toHaveTextContent("1");
      expect(screen.getByTestId("first-area-id")).toHaveTextContent(
        "area-main-job",
      );
      expect(screen.getByTestId("selected-area-id")).toHaveTextContent(
        "area-main-job",
      );
    });

    expect(mockCreateSupabaseBrowserClient).toHaveBeenCalled();
  });

  it("clears the selected area when persisted storage has no active areas", async () => {
    mockListAreas.mockResolvedValue({
      provider: "supabase",
      areas: [],
    });

    render(
      <WorkflowProvider>
        <AreaProbe />
      </WorkflowProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("area-count")).toHaveTextContent("0");
      expect(screen.getByTestId("first-area-id")).toHaveTextContent("");
      expect(screen.getByTestId("selected-area-id")).toHaveTextContent("");
    });
  });

  it("does not save capture text against the display fallback when no areas exist", async () => {
    mockListAreas.mockResolvedValue({
      provider: "supabase",
      areas: [],
    });

    render(
      <WorkflowProvider>
        <CapturePage />
      </WorkflowProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Create an area before capture")).toBeDefined();
    });

    fireEvent.change(screen.getByPlaceholderText("Drop the thought here."), {
      target: { value: "Capture should wait for a real area" },
    });

    expect(screen.getByRole("button", { name: "Save thought" })).toBeDisabled();
    expect(mockCreateCaptureItem).not.toHaveBeenCalled();
  });

  it("keeps direct persisted ids for custom areas without canonical slug mappings", async () => {
    mockListAreas.mockResolvedValue({
      provider: "supabase",
      areas: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          user_id: "user-a",
          name: "Deep Work",
          slug: "deep-work",
          description: "Custom area",
          color: null,
          icon: null,
          sort_order: 0,
          is_active: true,
          created_at: "2026-05-28T00:00:00.000Z",
          updated_at: "2026-05-28T00:00:00.000Z",
        },
      ],
    });

    render(
      <WorkflowProvider>
        <AreaProbe />
      </WorkflowProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("area-count")).toHaveTextContent("1");
      expect(screen.getByTestId("first-area-id")).toHaveTextContent(
        "33333333-3333-4333-8333-333333333333",
      );
      expect(screen.getByTestId("selected-area-id")).toHaveTextContent(
        "33333333-3333-4333-8333-333333333333",
      );
    });
  });

  it("hydrates persisted workflow rows with cockpit area ids", async () => {
    mockListExecutionReviewItems.mockResolvedValue({
      provider: "supabase",
      tasks: [persistedTask],
      blocks: [],
      sessions: [],
      reviewEntries: [],
    });

    render(
      <WorkflowProvider>
        <WorkflowRowsProbe />
      </WorkflowProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("selected-area-id")).toHaveTextContent(
        "area-main-job",
      );
      expect(screen.getByTestId("task-count")).toHaveTextContent("1");
      expect(screen.getByTestId("first-task-area")).toHaveTextContent(
        "area-main-job",
      );
      expect(screen.getByTestId("first-task-title")).toHaveTextContent(
        "Persisted task",
      );
    });
  });

  it("persists Someday triage decisions as backlog tasks when signed in", async () => {
    render(
      <WorkflowProvider>
        <TriageActionProbe />
      </WorkflowProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("selected-area-id")).toHaveTextContent(
        "area-main-job",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Capture" }));

    await waitFor(() => {
      expect(screen.getByTestId("draft-count")).toHaveTextContent("1");
    });

    fireEvent.click(screen.getByRole("button", { name: "Someday" }));

    await waitFor(() => {
      expect(mockCreateTask).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          area_id: persistedArea.id,
          status: "backlog",
          title: "Review the future idea",
        }),
      );
    });
    expect(mockCreateTimeBlockProposal).not.toHaveBeenCalled();
  });

  it("surfaces persisted load failures as saved data missing from view", async () => {
    mockListAreas.mockRejectedValue(new Error("network unavailable"));

    render(
      <WorkflowProvider>
        <SyncStatusProbe />
      </WorkflowProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("sync-account")).toHaveTextContent(
        "sync-error",
      );
      expect(screen.getByTestId("sync-message")).toHaveTextContent(
        "Saved workspace data could not load",
      );
      expect(screen.getByTestId("sync-message")).toHaveTextContent(
        "saved account data may be missing from view",
      );
    });
  });

  it("surfaces save failures as local-only pending retry", async () => {
    mockCreateCaptureItem.mockRejectedValue(new Error("insert timeout"));

    render(
      <WorkflowProvider>
        <TriageActionProbe />
        <SyncStatusProbe />
      </WorkflowProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("selected-area-id")).toHaveTextContent(
        "area-main-job",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Capture" }));

    await waitFor(() => {
      expect(screen.getByTestId("sync-account")).toHaveTextContent(
        "sync-error",
      );
      expect(screen.getByTestId("sync-message")).toHaveTextContent(
        "Change saved locally, but account sync failed",
      );
      expect(screen.getByTestId("sync-message")).toHaveTextContent(
        "stay local until sync recovers",
      );
    });
  });

  it("surfaces missing server capabilities with Health guidance", async () => {
    mockCreateCaptureItem.mockRejectedValue({
      code: "PGRST202",
      message: "Could not find the public.create_capture_item function",
    });

    render(
      <WorkflowProvider>
        <TriageActionProbe />
        <SyncStatusProbe />
      </WorkflowProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("selected-area-id")).toHaveTextContent(
        "area-main-job",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Capture" }));

    await waitFor(() => {
      expect(screen.getByTestId("sync-account")).toHaveTextContent(
        "sync-error",
      );
      expect(screen.getByTestId("sync-message")).toHaveTextContent(
        "app and database look out of step",
      );
      expect(screen.getByTestId("sync-message")).toHaveTextContent(
        "Check Health",
      );
    });
  });
});
