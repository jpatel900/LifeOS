import { render, screen, waitFor } from "@testing-library/react";
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

function expectBefore(first: HTMLElement, second: HTMLElement) {
  expect(
    first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).not.toBe(0);
}

function renderHome(
  storedState?: ReturnType<typeof createInitialWorkflowState>,
) {
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
    expect(screen.getByText("Instrument panel")).toBeDefined();
    expect(screen.getByTestId("home-read-only-note")).toBeDefined();
    expect(screen.getByTestId("today-next-card")).toHaveClass(
      "workflow-primary-card",
    );
    expect(screen.getByTestId("today-next-card")).toHaveClass(
      "workflow-flagship-card",
      "home-cockpit-flagship-card",
    );
    expect(
      screen.queryByRole("heading", { name: "System trust/status" }),
    ).toBeNull();

    await waitFor(() => {
      expect(listPlanningItems).toHaveBeenCalled();
      expect(listExecutionReviewItems).toHaveBeenCalled();
    });
  });

  it("shows one dominant next action and a read-only empty-state fallback", async () => {
    renderHome();
    await waitFor(() => expect(listPlanningItems).toHaveBeenCalled());

    expect(screen.getByText("Capture what matters now")).toBeDefined();
    expect(
      screen.getByRole("link", { name: "Capture a thought" }),
    ).toHaveAttribute("href", "/capture");
    expect(screen.getByTestId("home-read-only-note")).toHaveTextContent(
      "Home stays read-only. Capture one real thing, sort it in Triage, then plan one real block.",
    );
    expect(
      screen.queryByRole("button", { name: "Save quick capture" }),
    ).toBeNull();
    expect(
      screen.queryByRole("textbox", { name: "Home quick capture text" }),
    ).toBeNull();
  });

  it("matches the next-action CTA to the current queue state", async () => {
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

    expect(
      await screen.findByRole("link", { name: "Review in Triage" }),
    ).toHaveAttribute("href", "/triage");
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
    expect(screen.queryByText("Nothing is running right now.")).toBeNull();
    expect(
      screen.getByRole("heading", { name: /Needs decision/i }),
    ).toBeDefined();
    expect(screen.getByTestId("home-needs-decision-card")).toHaveClass(
      "home-featured-support-card",
    );
  });

  it("shows degraded account-data state as a recoverable warning", async () => {
    vi.mocked(listPlanningItems).mockRejectedValueOnce(
      new Error("Sign in before loading planning rows."),
    );
    renderHome();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveAttribute("data-severity", "warning");
    expect(alert).toHaveTextContent("Some account data did not load");
    expect(alert).toHaveTextContent(
      "Local workflow is still available. You can keep moving and check Health if this keeps happening.",
    );
    expect(alert).not.toHaveTextContent("Health checks could not load");
    expect(
      screen.getByRole("heading", { level: 1, name: "Today" }),
    ).toBeDefined();
  });

  it("keeps Home read-only instead of exposing capture mutation controls", async () => {
    renderHome();
    await waitFor(() => expect(listPlanningItems).toHaveBeenCalled());

    expect(
      screen.queryByRole("button", { name: "Save quick capture" }),
    ).toBeNull();
    expect(
      screen.queryByRole("textbox", { name: "Home quick capture text" }),
    ).toBeNull();
    expect(
      screen.getByRole("link", { name: "Capture a thought" }),
    ).toHaveAttribute("href", "/capture");
  });

  it("keeps Today details after the primary next action", async () => {
    renderHome();
    await waitFor(() => expect(listPlanningItems).toHaveBeenCalled());

    const primaryCta = screen.getByRole("link", { name: "Capture a thought" });
    const todayDetails = screen.getByText("Today details", { exact: true });

    expectBefore(primaryCta, todayDetails);
  });
});
