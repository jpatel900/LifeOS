import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TriagePage from "../app/triage/page";
import { useWorkflow, WorkflowProvider } from "@/lib/WorkflowContext";
import { createInitialWorkflowState } from "@/lib/workflow";

const originalSessionStorageDescriptor = Object.getOwnPropertyDescriptor(
  window,
  "sessionStorage",
);

function replaceSessionStorage(overrides: Partial<Storage>) {
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    value: {
      length: 0,
      clear: vi.fn(),
      getItem: vi.fn(() => null),
      key: vi.fn(() => null),
      removeItem: vi.fn(),
      setItem: vi.fn(),
      ...overrides,
    },
  });
}

function WorkflowProbe() {
  const { state, submitCaptureText } = useWorkflow();

  return (
    <div>
      <span data-testid="capture-count">{state.captureItems.length}</span>
      <button
        type="button"
        onClick={() =>
          submitCaptureText("Follow up with Alex", "area-main-job")
        }
      >
        Add capture
      </button>
    </div>
  );
}

function HydrationProbe() {
  const { state } = useWorkflow();
  const firstRenderCaptureCount = useRef<number | null>(null);

  if (firstRenderCaptureCount.current === null) {
    firstRenderCaptureCount.current = state.captureItems.length;
  }

  return (
    <div>
      <span data-testid="first-render-capture-count">
        {firstRenderCaptureCount.current}
      </span>
      <span data-testid="capture-count">{state.captureItems.length}</span>
    </div>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  if (originalSessionStorageDescriptor) {
    Object.defineProperty(
      window,
      "sessionStorage",
      originalSessionStorageDescriptor,
    );
  }
});

describe("WorkflowProvider storage fallback", () => {
  it("falls back to initial state when sessionStorage cannot be read", () => {
    replaceSessionStorage({
      getItem: vi.fn(() => {
        throw new DOMException("Storage is blocked.", "SecurityError");
      }),
    });

    render(
      <WorkflowProvider>
        <WorkflowProbe />
      </WorkflowProvider>,
    );

    expect(screen.getByTestId("capture-count")).toHaveTextContent("0");
  });

  it("falls back to initial state when stored workflow state has an invalid shape", () => {
    replaceSessionStorage({
      getItem: vi.fn(() =>
        JSON.stringify({
          captureItems: [],
          taskDrafts: [],
          ambiguityAssessments: [],
          timeBlockProposalDrafts: [],
          tasks: [],
          timeBlockProposals: [],
          calendarBlocks: [],
          executionSessions: [],
          healthChecks: [],
          reviewLog: [],
        }),
      ),
    });

    render(
      <WorkflowProvider>
        <WorkflowProbe />
      </WorkflowProvider>,
    );

    expect(screen.getByTestId("capture-count")).toHaveTextContent("0");
  });

  it("falls back to initial state when stored workflow items are malformed", async () => {
    const invalidState = {
      ...createInitialWorkflowState(),
      taskDrafts: [
        {
          id: "task-draft-1",
          user_id: "user-1",
          capture_item_id: "capture-1",
          area_id: "area-main-job",
          title: "Review sponsor notes",
          description: "Draft created from capture.",
          confidence: 0.8,
          estimated_minutes_low: 15,
          estimated_minutes_high: 30,
          first_tiny_step: "Open the notes",
          status: "pending",
          created_at: "2026-05-08T14:00:00.000Z",
        },
      ],
      ambiguityAssessments: [
        {
          id: "ambiguity-1",
          user_id: "user-1",
          area_id: "area-main-job",
          source_capture_item_id: "capture-1",
          likely_objective: "Review sponsor notes",
          possible_workstreams: ["Clarify"],
          knowns: ["There are notes."],
          unknowns: "not-an-array",
          assumptions: ["This needs triage."],
          constraints: ["Keep it local."],
          risks: ["Could schedule too early."],
          dependencies: ["User review."],
          recommended_first_move: "Open the notes",
          what_not_to_do_yet: ["Do not schedule yet."],
          confidence_score: 0.7,
          review_trigger: "Review in triage.",
          created_at: "2026-05-08T14:00:00.000Z",
        },
      ],
    };
    replaceSessionStorage({
      getItem: vi.fn(() => JSON.stringify(invalidState)),
    });

    render(
      <WorkflowProvider>
        <TriagePage />
      </WorkflowProvider>,
    );

    expect(
      await screen.findByText("Nothing to triage right now."),
    ).toBeDefined();
  });

  it("keeps the workflow usable when sessionStorage cannot be written", () => {
    replaceSessionStorage({
      setItem: vi.fn(() => {
        throw new DOMException("Storage quota exceeded.", "QuotaExceededError");
      }),
    });

    render(
      <WorkflowProvider>
        <WorkflowProbe />
      </WorkflowProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add capture" }));

    expect(screen.getByTestId("capture-count")).toHaveTextContent("1");
  });

  it("hydrates persisted workflow state after the first render", async () => {
    const storedState = {
      ...createInitialWorkflowState(),
      captureItems: [
        {
          id: "capture-9",
          user_id: "user-1",
          area_id: "area-main-job",
          raw_text: "Persisted capture from previous session",
          raw_audio_ref: null,
          capture_mode: "text",
          inferred_area_confidence: null,
          status: "triage_required",
          created_at: "2026-05-08T14:00:00.000Z",
        },
      ],
    };

    replaceSessionStorage({
      getItem: vi.fn(() => JSON.stringify(storedState)),
    });

    render(
      <WorkflowProvider>
        <HydrationProbe />
      </WorkflowProvider>,
    );

    expect(screen.getByTestId("first-render-capture-count")).toHaveTextContent(
      "0",
    );

    await waitFor(() => {
      expect(screen.getByTestId("capture-count")).toHaveTextContent("1");
    });
  });
});
