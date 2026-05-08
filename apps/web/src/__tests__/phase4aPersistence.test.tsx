import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Area, CaptureItem } from "@lifeos/schemas";
import CapturePage from "../app/capture/page";
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
});
