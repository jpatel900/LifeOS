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
    // WorkflowProvider persists its state to sessionStorage (WorkflowContext
    // STORAGE_KEY) and re-reads it at init. Within one test file all tests
    // share the jsdom sessionStorage, so a draft one test seeds leaks into the
    // next test's provider at mount. Reset before AND after every test so each
    // one starts from the clean demo seed and can't inherit a sibling's draft
    // (this is what flaked the "All areas" scoping test under full-suite load —
    // it inherited a leaked draft and saw 2 items instead of 1).
    window.sessionStorage.clear();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    window.sessionStorage.clear();
  });

  it("renders nothing when closed", () => {
    renderSheet(false);
    expect(screen.queryByTestId("moment-sheet")).not.toBeInTheDocument();
  });

  it("shows the empty state when there are no pending drafts", () => {
    renderSheet(true);
    expect(screen.getByTestId("triage-sheet-empty")).toBeInTheDocument();
  });

  // SP-8: the empty state names the filling action (capture via the C
  // shortcut) instead of being a dead end, and avoids the banned dead-end
  // phrasing.
  it("empty state names the capture shortcut as the filling action", () => {
    renderSheet(true);
    const empty = screen.getByTestId("triage-sheet-empty");
    expect(empty).toHaveTextContent("press C to capture the first thing");
    expect(empty.textContent?.toLowerCase()).not.toMatch(
      /nothing here|empty|no data|\bnone\b/,
    );
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

  it("renders the parsed draft's substance — area dot/name, type, estimate range, first move", async () => {
    const restoreFetch = stubParseCaptureFetch();
    renderSheet(true);

    fireEvent.click(screen.getByTestId("seed-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("triage-sheet-list")).toBeInTheDocument();
    });

    const item = screen.getByTestId(/^triage-sheet-item-/);
    const draftId = item.dataset.testid?.replace("triage-sheet-item-", "");

    const area = screen.getByTestId(`triage-sheet-area-${draftId}`);
    expect(area).toBeInTheDocument();
    expect(area.querySelector("span")).toHaveClass("rounded-full");

    // The deterministic mock parser (AI off) always fills task_type "task",
    // an estimate range, and a first_tiny_step — so all three render.
    expect(
      screen.getByTestId(`triage-sheet-type-${draftId}`),
    ).toHaveTextContent("Task");
    expect(
      screen.getByTestId(`triage-sheet-estimate-${draftId}`),
    ).toHaveTextContent(/^~\d+.\d+m$/);
    expect(
      screen.getByTestId(`triage-sheet-first-move-${draftId}`),
    ).toHaveTextContent("First move:");

    restoreFetch();
  });

  it("omits the first-move line when first_tiny_step is absent", async () => {
    const restoreFetch = stubParseCaptureFetch();

    function EditBridge() {
      const { state, submitCaptureText, editTaskDraft } = useWorkflow();
      const draft = state.taskDrafts[0];
      return (
        <div>
          <button
            type="button"
            data-testid="seed"
            onClick={() => submitCaptureText("Draft the proposal", null)}
          >
            Seed
          </button>
          <button
            type="button"
            data-testid="clear-first-step"
            onClick={() =>
              draft && editTaskDraft(draft.id, { first_tiny_step: null })
            }
          >
            Clear first step
          </button>
        </div>
      );
    }

    render(
      <WorkflowProvider>
        <EditBridge />
        <TriageSheet open selectedAreaId={null} onClose={vi.fn()} />
      </WorkflowProvider>,
    );

    fireEvent.click(screen.getByTestId("seed"));
    await waitFor(() => {
      expect(screen.getByTestId("triage-sheet-list")).toBeInTheDocument();
    });
    const item = screen.getByTestId(/^triage-sheet-item-/);
    const draftId = item.dataset.testid?.replace("triage-sheet-item-", "");
    expect(
      screen.getByTestId(`triage-sheet-first-move-${draftId}`),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("clear-first-step"));

    await waitFor(() => {
      expect(
        screen.queryByTestId(`triage-sheet-first-move-${draftId}`),
      ).not.toBeInTheDocument();
    });

    restoreFetch();
  });

  it("Do today routes the draft the same way the cockpit's onToday action does (accepted, active status)", async () => {
    const restoreFetch = stubParseCaptureFetch();

    function StateBridge() {
      const { state, submitCaptureText } = useWorkflow();
      const draft = state.taskDrafts[0];
      return (
        <div>
          <span data-testid="draft-status">{draft?.status ?? "none"}</span>
          <span data-testid="task-count">{state.tasks.length}</span>
          <button
            type="button"
            data-testid="seed"
            onClick={() => submitCaptureText("Draft the proposal", null)}
          >
            Seed
          </button>
        </div>
      );
    }

    render(
      <WorkflowProvider>
        <StateBridge />
        <TriageSheet open selectedAreaId={null} onClose={vi.fn()} />
      </WorkflowProvider>,
    );

    fireEvent.click(screen.getByTestId("seed"));
    await waitFor(() => {
      expect(screen.getByTestId("triage-sheet-list")).toBeInTheDocument();
    });

    const todayButtons = screen.getAllByTestId(/^triage-sheet-today-/);
    expect(todayButtons.length).toBeGreaterThan(0);
    fireEvent.click(todayButtons[0]);

    // acceptTaskDraft (the same action LifeOSCockpit's TriageView wires to
    // onToday) marks the draft accepted and creates a real task — the same
    // state change as "active" acceptance, distinct from backlogTaskDraft.
    await waitFor(() => {
      expect(screen.getByTestId("draft-status")).toHaveTextContent("accepted");
    });
    expect(screen.getByTestId("task-count")).toHaveTextContent("1");

    restoreFetch();
  });

  it("links out to the full /triage view", () => {
    renderSheet(true);
    expect(screen.getByTestId("triage-sheet-open-full")).toHaveAttribute(
      "href",
      "/triage",
    );
  });

  // SP-9: the accept/reject actions and the "open full view" link reach a
  // >=44px effective hit area and drop the 300ms double-tap delay on
  // coarse pointers. (sessionStorage isolation is handled at the describe
  // level — see beforeEach/afterEach.)
  it("accept/reject buttons and the open-full link carry hit-area and touch-manipulation utilities", async () => {
    const restoreFetch = stubParseCaptureFetch();
    renderSheet(true);

    fireEvent.click(screen.getByTestId("seed-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("triage-sheet-list")).toBeInTheDocument();
    });

    const acceptButtons = screen.getAllByTestId(/^triage-sheet-accept-/);
    expect(acceptButtons[0]).toHaveClass("min-h-[44px]");
    expect(acceptButtons[0]).toHaveClass("min-w-[44px]");
    expect(acceptButtons[0]).toHaveClass("touch-manipulation");

    const rejectButtons = screen.getAllByTestId(/^triage-sheet-reject-/);
    expect(rejectButtons[0]).toHaveClass("min-h-[44px]");
    expect(rejectButtons[0]).toHaveClass("touch-manipulation");

    const openFull = screen.getByTestId("triage-sheet-open-full");
    expect(openFull).toHaveClass("min-h-[44px]");
    expect(openFull).toHaveClass("touch-manipulation");

    restoreFetch();
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
