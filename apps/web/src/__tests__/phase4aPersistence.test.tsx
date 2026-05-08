import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Area, CaptureItem } from "@lifeos/schemas";
import CapturePage from "../app/capture/page";
import AreasSettingsPage from "../app/settings/areas/page";
import { WorkflowProvider } from "@/lib/WorkflowContext";

const mocks = vi.hoisted(() => {
  const supabaseClient = { client: "supabase-browser-client" };

  return {
    supabaseClient,
    createSupabaseBrowserClient: vi.fn(() => supabaseClient),
    listAreas: vi.fn(),
    createCaptureItem: vi.fn(),
  };
});

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: mocks.createSupabaseBrowserClient,
}));

vi.mock("@/lib/data/workflow", () => ({
  listAreas: mocks.listAreas,
  createCaptureItem: mocks.createCaptureItem,
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

function renderWithWorkflow(ui: React.ReactElement) {
  return render(<WorkflowProvider>{ui}</WorkflowProvider>);
}

describe("Phase 4A Supabase persistence UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
