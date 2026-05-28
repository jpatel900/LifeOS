import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkflowProvider, useWorkflow } from "@/lib/WorkflowContext";

const {
  mockListAreas,
  mockCreateSupabaseBrowserClient,
} = vi.hoisted(() => ({
  mockListAreas: vi.fn(),
  mockCreateSupabaseBrowserClient: vi.fn(() => ({ mocked: true })),
}));

vi.mock("@/lib/data/workflow", async () => {
  const actual = await vi.importActual<typeof import("@/lib/data/workflow")>(
    "@/lib/data/workflow",
  );

  return {
    ...actual,
    listAreas: mockListAreas,
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

afterEach(() => {
  vi.clearAllMocks();
});

describe("WorkflowProvider persisted area sync", () => {
  it("replaces the mock area list when persisted areas are available", async () => {
    mockListAreas.mockResolvedValue({
      provider: "supabase",
      areas: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          user_id: "user-a",
          name: "Main Job",
          slug: "main-job",
          description: "Persisted area",
          color: "#2563eb",
          icon: "briefcase",
          sort_order: 0,
          is_active: true,
          created_at: "2026-05-27T00:00:00.000Z",
          updated_at: "2026-05-27T00:00:00.000Z",
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
});
