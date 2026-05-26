import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "../app/page";
import { WorkflowProvider } from "@/lib/WorkflowContext";
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

function renderHome() {
  return render(
    <WorkflowProvider>
      <HomePage />
    </WorkflowProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
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
    expect(
      screen.getByRole("heading", { name: "System trust/status" }),
    ).toBeDefined();

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
      screen.getByRole("link", { name: "Open next step" }),
    ).toHaveAttribute("href", "/capture");
  });

  it("shows honest empty states", async () => {
    renderHome();
    await waitFor(() => expect(listExecutionReviewItems).toHaveBeenCalled());

    expect(screen.getByText("No pending drafts right now.")).toBeDefined();
    expect(
      screen.getByText("No unplanned active tasks right now."),
    ).toBeDefined();
    expect(
      screen.getByText("No local planned blocks for today."),
    ).toBeDefined();
  });

  it("shows degraded saved-workspace state without crashing", async () => {
    vi.mocked(listPlanningItems).mockRejectedValueOnce(
      new Error("Sign in before loading planning rows."),
    );
    renderHome();

    expect(
      await screen.findByText("Saved workspace is partially unavailable"),
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
      screen.getByText(/Saved in this browser and sent to/i),
    ).toBeDefined();

    expect(screen.getByRole("link", { name: "Open Triage" })).toHaveAttribute(
      "href",
      "/triage",
    );
    expect(
      screen
        .getAllByRole("link", { name: "Open Planning" })
        .some((link) => link.getAttribute("href") === "/calendar"),
    ).toBe(true);
    expect(screen.getByRole("link", { name: "Go to Execute" })).toHaveAttribute(
      "href",
      "/execute",
    );
    expect(screen.getByRole("link", { name: "Open Health" })).toHaveAttribute(
      "href",
      "/health",
    );
  });
});
