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

function mockParserStatusFetch(
  status: "mock" | "ai_configured" | "ai_unavailable",
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/parse-capture" && !init?.method) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            status,
            preferredParser: status === "ai_configured" ? "ai" : "mock",
          }),
        } satisfies Partial<Response>;
      }

      return {
        ok: true,
        json: async () => ({
          ok: true,
          parser: "ai",
          response: parseResponse,
          status,
        }),
      } satisfies Partial<Response>;
    }),
  );
}

describe("CapturePage", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
  });

  it("shows parser status as mock", async () => {
    mocks.listAreas.mockResolvedValue({ provider: "mock", areas: [area] });
    mockParserStatusFetch("mock");

    renderCapturePage();

    expect(await screen.findByText("Parser status: Mock parser")).toBeDefined();
    expect(screen.getByText("mock")).toBeDefined();
    expect(
      screen.getByText(
        /Save capture and Save and parse write persisted capture rows through the current data provider/i,
      ),
    ).toBeDefined();
    expect(
      screen.getByText(
        /The header workflow area picker controls local session drafts and the recent-captures list on this page/i,
      ),
    ).toBeDefined();
  });

  it("shows parser status as AI configured", async () => {
    mocks.listAreas.mockResolvedValue({ provider: "mock", areas: [area] });
    mockParserStatusFetch("ai_configured");

    renderCapturePage();

    expect(
      await screen.findByText("Parser status: AI parser configured"),
    ).toBeDefined();
  });

  it("shows parser status as AI unavailable", async () => {
    mocks.listAreas.mockResolvedValue({ provider: "mock", areas: [area] });
    mockParserStatusFetch("ai_unavailable");

    renderCapturePage();

    expect(
      await screen.findByText("Parser status: AI parser unavailable"),
    ).toBeDefined();
  });

  it("saves capture, parses, and shows triage routing for low confidence", async () => {
    mocks.listAreas.mockResolvedValue({ provider: "supabase", areas: [area] });
    mocks.createCaptureItem.mockResolvedValue({
      provider: "supabase",
      capture: persistedCapture,
    });

    const fetch = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/parse-capture" && !init?.method) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            status: "ai_configured",
            preferredParser: "ai",
          }),
        } satisfies Partial<Response>;
      }

      return {
        ok: true,
        json: async () => ({
          ok: true,
          parser: "ai",
          response: parseResponse,
          status: "ai_configured",
        }),
      } satisfies Partial<Response>;
    });
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
    expect(
      screen.getByText(
        "Drafts were routed to triage because confidence is low.",
      ),
    ).toBeDefined();
    expect(
      screen.getAllByText("Email Taylor about launch notes").length,
    ).toBeGreaterThan(1);
    expect(mocks.createCaptureItem.mock.invocationCallOrder[0]).toBeLessThan(
      fetch.mock.invocationCallOrder[1],
    );

    await waitFor(() =>
      expect(window.sessionStorage.getItem("lifeos.phase2.workflow")).toContain(
        "Email Taylor about launch notes",
      ),
    );
  });

  it("shows safe parse error and allows retry with mock parser", async () => {
    mocks.listAreas.mockResolvedValue({ provider: "supabase", areas: [area] });
    mocks.createCaptureItem.mockResolvedValue({
      provider: "supabase",
      capture: persistedCapture,
    });

    const fetch = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/parse-capture" && !init?.method) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            status: "ai_configured",
            preferredParser: "ai",
          }),
        } satisfies Partial<Response>;
      }

      const body = init?.body
        ? (JSON.parse(String(init.body)) as { parserMode?: string })
        : {};
      if (body.parserMode === "mock") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            parser: "mock",
            response: parseResponse,
            status: "ai_configured",
          }),
        } satisfies Partial<Response>;
      }

      return {
        ok: false,
        json: async () => ({
          ok: false,
          error: "AI failure: stack trace should not leak",
          can_retry_with_mock: true,
          status: "ai_configured",
        }),
      } satisfies Partial<Response>;
    });
    vi.stubGlobal("fetch", fetch);

    renderCapturePage();

    fireEvent.change(
      screen.getByPlaceholderText("What's on your mind? Type anything..."),
      {
        target: { value: "Email Taylor about launch notes" },
      },
    );
    fireEvent.click(await screen.findByText("Save and parse"));

    expect(
      await screen.findByText("Capture parse failed safely"),
    ).toBeDefined();
    expect(
      screen.getByText(
        "Capture was saved, but parsing failed safely. Retry with mock parser.",
      ),
    ).toBeDefined();
    expect(
      screen.queryByText("AI failure: stack trace should not leak"),
    ).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Retry with mock parser" }),
    );

    expect(await screen.findByText("Capture parsed")).toBeDefined();
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/parse-capture",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"parserMode":"mock"'),
        }),
      ),
    );
  });
});
