import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import CapturePage from "../app/capture/page";
import { WorkflowProvider } from "@/lib/WorkflowContext";
import type { Area, CaptureItem, ParseCaptureResponse } from "@lifeos/schemas";
import { PARSE_CAPTURE_SCHEMA_VERSION } from "@/lib/ai/contracts/parseCapture";
import { PARSE_CAPTURE_PROMPT_VERSION } from "@/lib/ai/prompts/parseCapturePrompt";

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

const persistedCapture: CaptureItem = {
  id: "550e8400-e29b-41d4-a716-446655440201",
  user_id: area.user_id,
  area_id: area.id,
  raw_text: "Email Taylor about launch notes",
  raw_audio_ref: null,
  capture_mode: "text",
  inferred_area_confidence: null,
  status: "new",
  created_at: "2026-05-08T12:00:00.000Z",
};

const parseResponse: ParseCaptureResponse = {
  schema_version: PARSE_CAPTURE_SCHEMA_VERSION,
  prompt_version: PARSE_CAPTURE_PROMPT_VERSION,
  parse_status: "low_confidence",
  overall_confidence: 0.48,
  triage_required: true,
  triage_reasons: ["Overall confidence is below the triage threshold."],
  drafts: [
    {
      draft_type: "task_draft",
      title: "Email Taylor about launch notes",
      description: "Capture mentions a follow-up email.",
      area_slug_suggestion: "main-job",
      first_tiny_step: "Open the launch notes",
      estimated_minutes_low: 10,
      estimated_minutes_high: 20,
      due_at: null,
      confidence: 0.48,
    },
  ],
  clarification_questions: ["What deadline should this use?"],
  ambiguity_assessment: null,
};

function renderCapturePage() {
  return render(
    <WorkflowProvider>
      <CapturePage />
    </WorkflowProvider>,
  );
}

describe("CapturePage", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
  });

  it("renders capture heading and textarea", async () => {
    mocks.listAreas.mockResolvedValue({ provider: "mock", areas: [area] });
    renderCapturePage();
    expect(await screen.findByText("mock")).toBeDefined();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Capture",
    );
    expect(
      screen.getByPlaceholderText("What's on your mind? Type anything..."),
    ).toBeDefined();
  });

  it("shows mock structured output when structuring text", async () => {
    mocks.listAreas.mockResolvedValue({ provider: "mock", areas: [area] });
    renderCapturePage();
    expect(await screen.findByText("mock")).toBeDefined();
    const textarea = screen.getByPlaceholderText(
      "What's on your mind? Type anything...",
    );
    fireEvent.change(textarea, { target: { value: "Follow up with Alex" } });
    fireEvent.click(screen.getByText("Structure locally (Phase 2 mock)"));
    expect(
      screen.getByText(/Mock parser created a draft bundle/),
    ).toBeDefined();
  });

  it("saves the raw capture before parsing and routes parsed drafts to local triage state", async () => {
    mocks.listAreas.mockResolvedValue({ provider: "supabase", areas: [area] });
    mocks.createCaptureItem.mockResolvedValue({
      provider: "supabase",
      capture: persistedCapture,
    });
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        parser: "ai",
        response: parseResponse,
      }),
    }));
    vi.stubGlobal("fetch", fetch);

    renderCapturePage();

    const textarea = screen.getByPlaceholderText(
      "What's on your mind? Type anything...",
    );
    fireEvent.change(textarea, {
      target: { value: "Email Taylor about launch notes" },
    });
    fireEvent.click(await screen.findByText("Save and parse"));

    expect(await screen.findByText("Capture parsed")).toBeDefined();
    expect(screen.getAllByText("Email Taylor about launch notes").length).toBeGreaterThan(1);
    expect(screen.getByText((content) => content.includes("Status: triage_required"))).toBeDefined();
    expect(mocks.createCaptureItem).toHaveBeenCalledWith(
      mocks.supabaseClient,
      {
        raw_text: "Email Taylor about launch notes",
        area_id: area.id,
      },
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/parse-capture",
      expect.objectContaining({ method: "POST" }),
    );
    expect(
      mocks.createCaptureItem.mock.invocationCallOrder[0],
    ).toBeLessThan(fetch.mock.invocationCallOrder[0]);
    await waitFor(() =>
      expect(window.sessionStorage.getItem("lifeos.phase2.workflow")).toContain(
        "Email Taylor about launch notes",
      ),
    );
  });
});

