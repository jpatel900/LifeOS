import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "../app/page";
import { WorkflowProvider } from "@/lib/WorkflowContext";
import { createInitialWorkflowState } from "@/lib/workflow";
import {
  listExecutionReviewItems,
  listPlanningItems,
} from "@/lib/data/workflow";

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => null,
}));

vi.mock("@/lib/data/workflow", () => ({
  listPlanningItems: vi.fn(async () => ({
    provider: "mock",
    tasks: [],
    proposals: [],
    blocks: [],
  })),
  listExecutionReviewItems: vi.fn(async () => ({
    provider: "mock",
    tasks: [],
    blocks: [],
    sessions: [],
    reviewEntries: [],
  })),
}));

const STORAGE_KEY = "lifeos.phase2.workflow";

function renderHome(storedState?: ReturnType<typeof createInitialWorkflowState>) {
  window.sessionStorage.clear();
  if (storedState) {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(storedState));
  }

  return render(
    <WorkflowProvider>
      <HomePage />
    </WorkflowProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
});

describe("HomePage Today cockpit", () => {
  it("renders the cockpit heading and key sections", async () => {
    renderHome();

    expect(
      screen.getByRole("heading", { level: 1, name: "Today" }),
    ).toBeDefined();
    expect(screen.getByRole("heading", { name: "Next" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "Now" })).toBeDefined();
    expect(
      screen.getByRole("heading", { name: "Quick Capture" }),
    ).toBeDefined();
    expect(screen.getByRole("heading", { name: "Daily loop" })).toBeDefined();
    expect(
      screen.queryByRole("heading", { name: "System trust/status" }),
    ).toBeNull();

    await waitFor(() => {
      expect(listPlanningItems).toHaveBeenCalled();
      expect(listExecutionReviewItems).toHaveBeenCalled();
    });
  });

  it("shows one dominant next action and an empty-state capture fallback", async () => {
    renderHome();
    await waitFor(() => expect(listPlanningItems).toHaveBeenCalled());

    expect(screen.getByText("Capture what matters now")).toBeDefined();
    expect(
      screen.getByText(/No sample data is created until you save something/i),
    ).toBeDefined();
    expect(
      screen.getByRole("link", { name: "Open next step" }),
    ).toHaveAttribute("href", "/capture");
  });

  it("hides empty secondary cards until they matter", async () => {
    renderHome();
    await waitFor(() => expect(listExecutionReviewItems).toHaveBeenCalled());

    expect(screen.queryByText("No drafts waiting.")).toBeNull();
    expect(screen.queryByText("No tasks need planning.")).toBeNull();
    expect(screen.queryByText("Nothing planned today.")).toBeNull();
    expect(screen.queryByText("Nothing needs recovery.")).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "System trust/status" }),
    ).toBeNull();
  });

  it("reduces starter guidance once real workflow state exists", async () => {
    const storedState = createInitialWorkflowState();
    storedState.taskDrafts = [
      {
        id: "task-draft-1",
        user_id: "user-1",
        capture_item_id: "capture-1",
        area_id: "area-main-job",
        title: "Review pending contract",
        description: "Draft waiting for triage.",
        confidence: 0.72,
        estimated_minutes_low: 15,
        estimated_minutes_high: 30,
        first_tiny_step: "Open the contract notes.",
        status: "pending",
        created_at: "2026-05-27T12:00:00.000Z",
      },
    ];

    renderHome(storedState);

    await waitFor(() =>
      expect(screen.getByText("Review pending decisions")).toBeDefined(),
    );

    expect(screen.queryByRole("heading", { name: "Daily loop" })).toBeNull();
    expect(
      screen.queryByText("Nothing is running right now."),
    ).toBeNull();
    expect(
      screen.getByRole("heading", { name: /Needs decision/i }),
    ).toBeDefined();
  });

  it("shows degraded account-data state without crashing", async () => {
    vi.mocked(listPlanningItems).mockRejectedValueOnce(
      new Error("Sign in before loading planning rows."),
    );
    renderHome();

    expect(
      await screen.findByText("Account data is partially unavailable"),
    ).toBeDefined();
    expect(
      screen.getByRole("heading", { level: 1, name: "Today" }),
    ).toBeDefined();
  });

  it("shows visible Quick Capture validation on empty submit", async () => {
    renderHome();
    await waitFor(() => expect(listPlanningItems).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Save quick capture" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Type a note first.");
  });

  it("shows truthful Quick Capture success and allowed route links", async () => {
    renderHome();

    fireEvent.change(
      screen.getByRole("textbox", { name: "Home quick capture text" }),
      {
        target: { value: "Home capture test" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save quick capture" }));

    expect(await screen.findByText("Saved.")).toBeDefined();
    expect(
      screen.getByText(/Saved on this device and sent to/i),
    ).toBeDefined();

    expect(
      screen
        .getAllByRole("link", { name: "Open Triage" })
        .some((link) => link.getAttribute("href") === "/triage"),
    ).toBe(true);
    expect(
      screen.queryByRole("link", { name: "Open Planning" }),
    ).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Open Health" }),
    ).toBeNull();
    expect(
      screen.getByRole("heading", { name: /Needs decision/i }),
    ).toBeDefined();
    expect(
      screen.queryByRole("heading", { name: "System trust/status" }),
    ).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "Daily loop" }),
    ).toBeNull();
    expect(
      screen.queryByText("Nothing is running right now."),
    ).toBeNull();
    expect(
      screen.queryByText(/No sample data is created until you save something/i),
    ).toBeNull();
  });
});
