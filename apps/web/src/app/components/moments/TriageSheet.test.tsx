import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowProvider, useWorkflow } from "@/lib/WorkflowContext";
import { stubParseCaptureFetch } from "@/__tests__/helpers/parseCaptureFetch";
import { TriageSheet } from "./TriageSheet";

/**
 * Journey test through the real WorkflowProvider (not a hand-built VM):
 * capture -> mock parse -> pending draft shows in the sheet -> accept to
 * backlog moves it out. Mirrors the capture->parse bridge pattern used in
 * TodayMoments.test.tsx.
 */
function CaptureSeedBridge() {
  const { submitCaptureText } = useWorkflow();
  return (
    <button
      type="button"
      data-testid="seed-submit"
      onClick={() => submitCaptureText("Draft the proposal", null)}
    >
      Seed capture
    </button>
  );
}

/**
 * Seeds a capture in each of two distinct (already-seeded demo) areas, so
 * the "All areas" fallback-to-first-area behavior (shared with
 * buildPipelineCounts / buildCockpitViewModel's `activeArea ?? areas[0]`)
 * can be exercised. The demo WorkflowProvider ships with several areas
 * pre-seeded, so no addArea call is needed here.
 */
function TwoAreaCaptureSeedBridge() {
  const { state, submitCaptureText } = useWorkflow();
  return (
    <div>
      <span data-testid="seed-draft-count">{state.taskDrafts.length}</span>
      <button
        type="button"
        data-testid="seed-submit-first-area"
        onClick={() =>
          submitCaptureText("First area capture", state.areas[0]?.id ?? null)
        }
      >
        Seed first-area capture
      </button>
      <button
        type="button"
        data-testid="seed-submit-second-area"
        onClick={() =>
          submitCaptureText("Second area capture", state.areas[1]?.id ?? null)
        }
      >
        Seed second-area capture
      </button>
    </div>
  );
}

function renderSheet(open = true) {
  return render(
    <WorkflowProvider>
      <CaptureSeedBridge />
      <TriageSheet open={open} selectedAreaId={null} onClose={vi.fn()} />
    </WorkflowProvider>,
  );
}

describe("TriageSheet", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("renders nothing when closed", () => {
    renderSheet(false);
    expect(screen.queryByTestId("moment-sheet")).not.toBeInTheDocument();
  });

  it("shows the empty state when there are no pending drafts", () => {
    renderSheet(true);
    expect(screen.getByTestId("triage-sheet-empty")).toBeInTheDocument();
  });

  it("shows a pending capture draft and accept-to-backlog moves it out of the list", async () => {
    const restoreFetch = stubParseCaptureFetch();
    renderSheet(true);

    fireEvent.click(screen.getByTestId("seed-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("triage-sheet-list")).toBeInTheDocument();
    });

    const acceptButtons = screen.getAllByTestId(/^triage-sheet-accept-/);
    expect(acceptButtons.length).toBeGreaterThan(0);

    fireEvent.click(acceptButtons[0]);

    await waitFor(() => {
      expect(screen.getByTestId("triage-sheet-empty")).toBeInTheDocument();
    });

    restoreFetch();
  });

  it("links out to the full /triage view", () => {
    renderSheet(true);
    expect(screen.getByTestId("triage-sheet-open-full")).toHaveAttribute(
      "href",
      "/triage",
    );
  });

  it("in 'All areas' mode (selectedAreaId=null), scopes to the first area — matching the badge's activeArea-fallback resolution — so a second area's draft is not shown", async () => {
    const restoreFetch = stubParseCaptureFetch();
    render(
      <WorkflowProvider>
        <TwoAreaCaptureSeedBridge />
        <TriageSheet open selectedAreaId={null} onClose={vi.fn()} />
      </WorkflowProvider>,
    );

    fireEvent.click(screen.getByTestId("seed-submit-first-area"));
    await waitFor(() => {
      expect(screen.getByTestId("triage-sheet-list")).toBeInTheDocument();
    });
    expect(screen.getAllByTestId(/^triage-sheet-item-/)).toHaveLength(1);

    fireEvent.click(screen.getByTestId("seed-submit-second-area"));

    // Wait for the second area's capture to actually land as a pending
    // draft (two drafts total across both areas), then assert the sheet
    // still shows exactly the first area's one draft.
    await waitFor(() => {
      expect(screen.getByTestId("seed-draft-count")).toHaveTextContent("2");
    });
    expect(screen.getAllByTestId(/^triage-sheet-item-/)).toHaveLength(1);

    restoreFetch();
  });
});
