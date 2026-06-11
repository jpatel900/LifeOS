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
    listCaptureItems: vi.fn(),
    createCaptureItem: vi.fn(),
  };
});

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: mocks.createSupabaseBrowserClient,
}));

vi.mock("@/lib/data/workflow", () => ({
  listAreas: mocks.listAreas,
  listCaptureItems: mocks.listCaptureItems,
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

const customArea: Area = {
  id: "550e8400-e29b-41d4-a716-446655440102",
  user_id: "550e8400-e29b-41d4-a716-446655440001",
  name: "Home Admin",
  slug: "home-admin",
  description: "Home admin and errands.",
  color: "#0f766e",
  icon: "home",
  sort_order: 1,
  is_active: true,
  created_at: "2026-05-07T00:00:00.000Z",
  updated_at: "2026-05-07T00:00:00.000Z",
};

const customPersistedCapture: CaptureItem = {
  id: "550e8400-e29b-41d4-a716-446655440202",
  user_id: customArea.user_id,
  area_id: customArea.id,
  raw_text: "Schedule furnace service",
  raw_audio_ref: null,
  capture_mode: "text",
  inferred_area_confidence: null,
  status: "new",
  created_at: "2026-05-08T13:00:00.000Z",
};

function renderCapturePage() {
  return render(
    <WorkflowProvider>
      <CapturePage />
    </WorkflowProvider>,
  );
}

function expectBefore(first: HTMLElement, second: HTMLElement) {
  expect(
    first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).not.toBe(0);
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
    mocks.listCaptureItems.mockResolvedValue({
      provider: "mock",
      captures: [],
    });
    mockParserStatusFetch("mock");

    renderCapturePage();

    expect(await screen.findByText("Sorting help")).toBeDefined();
    expect(screen.getByText("On-device sorting ready")).toBeDefined();
    expect(
      screen.getByText("Save and organize will use on-device sorting."),
    ).toBeDefined();
    expect(screen.getAllByText("Saved on this device only")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Save thought" })).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Save and organize" }),
    ).toBeDefined();
    expect(screen.getByLabelText("Area for this saved thought")).toBeDefined();
    expect(screen.getByText("Current area: Main Job")).toBeDefined();
    expect(screen.getByText("Local draft pass")).toBeDefined();
    expect(screen.getByText("Ctrl/Cmd + Enter")).toBeDefined();
    expect(screen.getByText("Save from the main field.")).toBeDefined();
    expect(
      screen.getByText("Save the raw thought, or create drafts for Triage now."),
    ).toBeDefined();
    expect(
      screen.getByRole("heading", {
        name: "Recent saved captures on this device",
      }),
    ).toBeDefined();
    expect(screen.getByText("Device-only drafts")).toBeDefined();
    expect(screen.getByTestId("capture-main-card")).toHaveClass(
      "workflow-flagship-card",
    );
    expect(screen.getByTestId("capture-header-summary-card")).toHaveClass(
      "workflow-support-card",
    );
  });

  it("shows parser status as AI configured", async () => {
    mocks.listAreas.mockResolvedValue({ provider: "mock", areas: [area] });
    mocks.listCaptureItems.mockResolvedValue({
      provider: "mock",
      captures: [],
    });
    mockParserStatusFetch("ai_configured");

    renderCapturePage();

    expect(await screen.findByText("Sorting help")).toBeDefined();
    expect(screen.getByText("AI sorting on")).toBeDefined();
    expect(
      screen.getByText("Save and organize will use AI sorting."),
    ).toBeDefined();
  });

  it("shows parser status as AI unavailable", async () => {
    mocks.listAreas.mockResolvedValue({ provider: "mock", areas: [area] });
    mocks.listCaptureItems.mockResolvedValue({
      provider: "mock",
      captures: [],
    });
    mockParserStatusFetch("ai_unavailable");

    renderCapturePage();

    expect(await screen.findByText("Sorting help")).toBeDefined();
    expect(screen.getByText("AI sorting unavailable")).toBeDefined();
    expect(
      screen.getByText(
        "AI sorting is unavailable here. Save and organize will use on-device sorting. Add AI setup later if you want AI-assisted sorting.",
      ),
    ).toBeDefined();
  });

  it("keeps local draft and diagnostics details after the primary actions", async () => {
    mocks.listAreas.mockResolvedValue({ provider: "mock", areas: [area] });
    mocks.listCaptureItems.mockResolvedValue({
      provider: "mock",
      captures: [],
    });
    mockParserStatusFetch("mock");

    renderCapturePage();

    const saveThought = await screen.findByRole("button", {
      name: "Save thought",
    });
    const saveAndOrganize = screen.getByRole("button", {
      name: "Save and organize",
    });
    const localDraftPass = screen.getByText("Local draft pass", {
      exact: true,
    });
    const captureDetails = screen.getByText("Capture details", {
      exact: true,
    });

    expectBefore(saveThought, localDraftPass);
    expectBefore(saveAndOrganize, captureDetails);
  });

  it("explains where Save thought went and can organize the saved capture", async () => {
    mocks.listAreas.mockResolvedValue({ provider: "supabase", areas: [area] });
    mocks.listCaptureItems.mockResolvedValue({
      provider: "supabase",
      captures: [],
    });
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

    fireEvent.change(
      await screen.findByPlaceholderText(
        "What's on your mind? Type anything...",
      ),
      { target: { value: "Email Taylor about launch notes" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save thought" }));

    expect(await screen.findByText("Saved.")).toBeDefined();
    expect(screen.getByRole("status")).toBeDefined();
    expect(screen.getAllByText("Saved to account").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("heading", { name: "Recent saved captures" }),
    ).toBeDefined();
    expect(screen.getAllByText("Saved to account").length).toBeGreaterThan(0);
    expect(screen.getByText("Email Taylor about launch notes")).toBeDefined();
    fireEvent.click(
      screen.getByRole("button", { name: "Organize this saved thought" }),
    );

    expect(await screen.findByText("Drafts ready for Triage.")).toBeDefined();
    expect(screen.getByRole("link", { name: "Review it now" })).toBeDefined();
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/parse-capture",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining(
            '"rawText":"Email Taylor about launch notes"',
          ),
        }),
      ),
    );
  });

  it("submits Save thought from the main capture field with Ctrl/Cmd + Enter", async () => {
    mocks.listAreas.mockResolvedValue({ provider: "supabase", areas: [area] });
    mocks.listCaptureItems.mockResolvedValue({
      provider: "supabase",
      captures: [],
    });
    mocks.createCaptureItem.mockResolvedValue({
      provider: "supabase",
      capture: persistedCapture,
    });
    mockParserStatusFetch("ai_configured");

    renderCapturePage();

    fireEvent.change(
      await screen.findByPlaceholderText(
        "What's on your mind? Type anything...",
      ),
      { target: { value: "Email Taylor about launch notes" } },
    );
    fireEvent.keyDown(
      screen.getByPlaceholderText("What's on your mind? Type anything..."),
      {
        key: "Enter",
        ctrlKey: true,
      },
    );

    await waitFor(() =>
      expect(mocks.createCaptureItem).toHaveBeenCalledWith(
        mocks.supabaseClient,
        {
          raw_text: "Email Taylor about launch notes",
          area_id: area.id,
        },
      ),
    );
    expect(await screen.findByText("Saved.")).toBeDefined();
  });

  it("saves capture, parses, and shows triage routing for low confidence", async () => {
    mocks.listAreas.mockResolvedValue({ provider: "supabase", areas: [area] });
    mocks.listCaptureItems.mockResolvedValue({
      provider: "supabase",
      captures: [],
    });
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
    fireEvent.click(await screen.findByText("Save and organize"));

    expect(await screen.findByText("Drafts ready for Triage.")).toBeDefined();
    expect(screen.getByRole("link", { name: "Review it now" })).toBeDefined();
    expect(
      screen.queryByRole("button", { name: "Organize this saved thought" }),
    ).toBeNull();
    expect(screen.queryByText("Saved.")).toBeNull();
    expect(screen.getByText("Drafts ready for Triage.")).toBeDefined();
    expect(
      screen.getByText(
        "Drafts were routed to triage because confidence is low.",
      ),
    ).toBeDefined();
    expect(
      screen.getAllByText("Email Taylor about launch notes").length,
    ).toBeGreaterThan(0);
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
    mocks.listCaptureItems.mockResolvedValue({
      provider: "supabase",
      captures: [],
    });
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
    fireEvent.click(await screen.findByText("Save and organize"));

    expect(await screen.findByText("AI sorting stopped safely")).toBeDefined();
    expect(
      screen.getByText(
        "Capture was saved, but AI sorting stopped safely. Retry with on-device sorting.",
      ),
    ).toBeDefined();
    expect(screen.getByText("Raw capture is safely stored")).toBeDefined();
    expect(
      screen.queryByText("AI failure: stack trace should not leak"),
    ).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Retry with on-device sorting" }),
    );

    expect(await screen.findByText("Drafts ready for Triage.")).toBeDefined();
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

  it("shows persisted saved history for a seeded area using workflow-to-persisted area mapping", async () => {
    mocks.listAreas.mockResolvedValue({ provider: "supabase", areas: [area] });
    mocks.listCaptureItems.mockResolvedValue({
      provider: "supabase",
      captures: [persistedCapture],
    });
    mockParserStatusFetch("ai_configured");

    renderCapturePage();

    expect(
      await screen.findByRole("heading", { name: "Recent saved captures" }),
    ).toBeDefined();
    expect(
      await screen.findByText("Email Taylor about launch notes"),
    ).toBeDefined();
    expect(screen.getByText("Area: Main Job")).toBeDefined();
    expect(screen.getAllByText("Saved to account").length).toBeGreaterThan(0);
  });

  it("shows persisted saved history for a custom area without legacy id mapping", async () => {
    mocks.listAreas.mockResolvedValue({
      provider: "supabase",
      areas: [area, customArea],
    });
    mocks.listCaptureItems.mockResolvedValue({
      provider: "supabase",
      captures: [customPersistedCapture],
    });
    mockParserStatusFetch("ai_configured");

    renderCapturePage();

    fireEvent.change(
      await screen.findByLabelText("Area for this saved thought"),
      {
        target: { value: customArea.id },
      },
    );

    expect(await screen.findByText("Schedule furnace service")).toBeDefined();
    expect(screen.getByText("Area: Home Admin")).toBeDefined();
    expect(screen.getAllByText("Saved to account").length).toBeGreaterThan(0);
  });
});
