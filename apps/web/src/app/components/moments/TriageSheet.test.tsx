import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowProvider, useWorkflow } from "@/lib/WorkflowContext";
import { stubParseCaptureFetch } from "@/__tests__/helpers/parseCaptureFetch";
import * as taskMapDraftClient from "@/lib/ai/taskMapDraftClient";
import { TriageSheet } from "./TriageSheet";

const validTaskMapDraft = {
  schema_version: "1.0" as const,
  nodes: [
    { id: "n1", title: "Draft outline", role: "required" as const },
    { id: "n2", title: "Send for review", role: "required" as const },
  ],
  edges: [{ from: "n1", to: "n2" }],
};

/**
 * #703: capture no longer parses, so a seeded capture only becomes a pending
 * draft once something taps Sort. This stands in for that tap — it sorts each
 * newly captured item exactly once, driving the same `sortCaptureIntoDrafts`
 * the Sort button calls, so the journey tests below still exercise the real
 * capture -> sort -> draft path end to end.
 *
 * One sort runs at a time (FR-026: no parse queue), so this re-checks whenever
 * `captureParse` settles and picks up the next unsorted capture then.
 */
function useAutoSortSeededCaptures() {
  const { state, captureParse, sortCaptureIntoDrafts } = useWorkflow();
  const attempted = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (captureParse.phase === "parsing") return;
    const next = state.captureItems.find(
      (item) => !attempted.current.has(item.id),
    );
    if (!next) return;
    attempted.current.add(next.id);
    sortCaptureIntoDrafts(next.id);
  }, [state.captureItems, captureParse, sortCaptureIntoDrafts]);
}

/**
 * Journey test through the real WorkflowProvider (not a hand-built VM):
 * capture -> Sort -> mock parse -> pending draft shows in the sheet -> accept
 * to backlog moves it out. Mirrors the capture->parse bridge pattern used in
 * TodayMoments.test.tsx.
 */
function CaptureSeedBridge() {
  const { submitCaptureText } = useWorkflow();
  useAutoSortSeededCaptures();
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
  useAutoSortSeededCaptures();
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
      useAutoSortSeededCaptures();
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
      useAutoSortSeededCaptures();
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

  describe("FR-031 slice F3 — map-it offer at triage-accept (#664)", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("does not offer a map, and never calls requestTaskMapDraft, before 'Do today' is tapped", async () => {
      const requestSpy = vi.spyOn(taskMapDraftClient, "requestTaskMapDraft");
      const restoreFetch = stubParseCaptureFetch();
      renderSheet(true);

      fireEvent.click(screen.getByTestId("seed-submit"));
      await waitFor(() => {
        expect(screen.getByTestId("triage-sheet-list")).toBeInTheDocument();
      });

      expect(screen.queryByTestId("triage-map-offer")).not.toBeInTheDocument();
      expect(requestSpy).not.toHaveBeenCalled();

      restoreFetch();
    });

    it("offers 'Map it' for exactly the task 'Do today' just created, and tapping it calls requestTaskMapDraft with that task", async () => {
      const requestSpy = vi
        .spyOn(taskMapDraftClient, "requestTaskMapDraft")
        .mockResolvedValue({
          ok: true,
          draft: validTaskMapDraft,
          suggestionRecordId: null,
        });
      const restoreFetch = stubParseCaptureFetch();

      function StateBridge() {
        const { state } = useWorkflow();
        return (
          <span data-testid="task-id">{state.tasks[0]?.id ?? "none"}</span>
        );
      }

      render(
        <WorkflowProvider>
          <CaptureSeedBridge />
          <StateBridge />
          <TriageSheet open selectedAreaId={null} onClose={vi.fn()} />
        </WorkflowProvider>,
      );

      fireEvent.click(screen.getByTestId("seed-submit"));
      await waitFor(() => {
        expect(screen.getByTestId("triage-sheet-list")).toBeInTheDocument();
      });

      fireEvent.click(screen.getAllByTestId(/^triage-sheet-today-/)[0]);

      const offer = await screen.findByTestId("triage-map-offer");
      expect(offer).toHaveTextContent("Draft the proposal");
      expect(offer).toHaveTextContent("Map it out?");

      fireEvent.click(screen.getByTestId("triage-map-offer-accept"));

      await waitFor(() => {
        expect(requestSpy).toHaveBeenCalledTimes(1);
      });
      const taskId = screen.getByTestId("task-id").textContent;
      expect(requestSpy.mock.calls[0][0]).toMatchObject({ taskId });

      // Draft resolves to "ready" -> the one-pass approve review renders
      // inline, reusing TaskMapDraftReview rather than a new surface.
      await waitFor(() => {
        expect(screen.getByTestId("taskmap-draft-review")).toBeInTheDocument();
      });

      restoreFetch();
    });

    it("'Not now' clears the offer without ever calling requestTaskMapDraft — declining costs nothing", async () => {
      const requestSpy = vi.spyOn(taskMapDraftClient, "requestTaskMapDraft");
      const restoreFetch = stubParseCaptureFetch();
      renderSheet(true);

      fireEvent.click(screen.getByTestId("seed-submit"));
      await waitFor(() => {
        expect(screen.getByTestId("triage-sheet-list")).toBeInTheDocument();
      });

      fireEvent.click(screen.getAllByTestId(/^triage-sheet-today-/)[0]);
      await screen.findByTestId("triage-map-offer");

      fireEvent.click(screen.getByTestId("triage-map-offer-dismiss"));

      expect(screen.queryByTestId("triage-map-offer")).not.toBeInTheDocument();
      expect(requestSpy).not.toHaveBeenCalled();

      restoreFetch();
    });

    it("closing the sheet clears a not-yet-acted-on offer (no stale offer on reopen)", async () => {
      const restoreFetch = stubParseCaptureFetch();
      const { rerender } = render(
        <WorkflowProvider>
          <CaptureSeedBridge />
          <TriageSheet open selectedAreaId={null} onClose={vi.fn()} />
        </WorkflowProvider>,
      );

      fireEvent.click(screen.getByTestId("seed-submit"));
      await waitFor(() => {
        expect(screen.getByTestId("triage-sheet-list")).toBeInTheDocument();
      });
      fireEvent.click(screen.getAllByTestId(/^triage-sheet-today-/)[0]);
      await screen.findByTestId("triage-map-offer");

      rerender(
        <WorkflowProvider>
          <CaptureSeedBridge />
          <TriageSheet open={false} selectedAreaId={null} onClose={vi.fn()} />
        </WorkflowProvider>,
      );
      rerender(
        <WorkflowProvider>
          <CaptureSeedBridge />
          <TriageSheet open selectedAreaId={null} onClose={vi.fn()} />
        </WorkflowProvider>,
      );

      expect(screen.queryByTestId("triage-map-offer")).not.toBeInTheDocument();

      restoreFetch();
    });
  });

  // #687: the "Open full view →" link to /triage was removed — that route now
  // redirects back to this sheet, so the link had become a circular hop.
  it("no longer links out to the legacy /triage route", () => {
    renderSheet(true);
    expect(
      screen.queryByTestId("triage-sheet-open-full"),
    ).not.toBeInTheDocument();
  });

  // SP-9: the accept/reject actions reach a >=44px effective hit area and
  // drop the 300ms double-tap delay on coarse pointers. (sessionStorage
  // isolation is handled at the describe level — see beforeEach/afterEach.)
  it("accept/reject buttons carry hit-area and touch-manipulation utilities", async () => {
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

  // #703 — the Sort action: the app's parse trigger, relocated to this sheet.
  describe("#703 Sort action", () => {
    /** Captures without sorting, so the row sits in the unsorted list. */
    function RawCaptureBridge() {
      const { state, submitCaptureText } = useWorkflow();
      return (
        <div>
          <span data-testid="raw-draft-count">{state.taskDrafts.length}</span>
          <button
            type="button"
            data-testid="raw-capture"
            onClick={() => submitCaptureText("Draft the proposal", null)}
          >
            Capture
          </button>
        </div>
      );
    }

    function renderRawSheet() {
      return render(
        <WorkflowProvider>
          <RawCaptureBridge />
          <TriageSheet open selectedAreaId={null} onClose={vi.fn()} />
        </WorkflowProvider>,
      );
    }

    it("lists a capture that has not been sorted yet, with a Sort action", async () => {
      renderRawSheet();
      fireEvent.click(screen.getByTestId("raw-capture"));

      await waitFor(() => {
        expect(screen.getByTestId("triage-sheet-captures")).toBeInTheDocument();
      });
      // The thought is shown as written, and it is not a draft yet.
      expect(screen.getByTestId("triage-sheet-captures")).toHaveTextContent(
        "Draft the proposal",
      );
      expect(screen.getByTestId("raw-draft-count")).toHaveTextContent("0");
      expect(screen.getAllByTestId(/^triage-sheet-sort-/)).toHaveLength(1);
    });

    it("does not sort on its own — nothing parses until the action is tapped", async () => {
      const fetchSpy = vi.fn(
        async () => ({ ok: true, json: async () => ({}) }) as Response,
      );
      vi.stubGlobal("fetch", fetchSpy);

      renderRawSheet();
      fireEvent.click(screen.getByTestId("raw-capture"));
      await waitFor(() => {
        expect(screen.getByTestId("triage-sheet-captures")).toBeInTheDocument();
      });

      expect(fetchSpy).not.toHaveBeenCalledWith(
        "/api/parse-capture",
        expect.anything(),
      );
      expect(screen.getByTestId("raw-draft-count")).toHaveTextContent("0");
      vi.unstubAllGlobals();
    });

    it("Sort turns the capture into a pending draft and moves it out of the unsorted list", async () => {
      const restoreFetch = stubParseCaptureFetch();
      renderRawSheet();
      fireEvent.click(screen.getByTestId("raw-capture"));

      const sortButton = await screen.findByTestId(/^triage-sheet-sort-/);
      fireEvent.click(sortButton);

      // A draft appears for review...
      await waitFor(() => {
        expect(screen.getByTestId("triage-sheet-list")).toBeInTheDocument();
      });
      expect(screen.getAllByTestId(/^triage-sheet-item-/)).toHaveLength(1);

      // ...and the same thought is no longer listed as unsorted, so it is
      // never shown twice.
      expect(
        screen.queryByTestId("triage-sheet-captures"),
      ).not.toBeInTheDocument();

      restoreFetch();
    });

    it("when sorting is unavailable it says so plainly and the capture stays listed and safe", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            ({
              ok: false,
              json: async () => ({
                ok: false,
                error: "Parsing is unavailable right now.",
                can_retry_with_mock: true,
                status: "ai_unavailable",
              }),
            }) as Response,
        ),
      );

      renderRawSheet();
      fireEvent.click(screen.getByTestId("raw-capture"));
      const sortButton = await screen.findByTestId(/^triage-sheet-sort-/);
      fireEvent.click(sortButton);

      const failure = await screen.findByTestId(/^triage-sheet-sort-failed-/);
      expect(failure).toHaveTextContent(
        "Sorting isn’t available right now. Your thought is safe here, exactly as you wrote it.",
      );

      // Nothing was lost: the capture is still listed, still verbatim, and
      // the in-band alternative is offered rather than a background retry.
      expect(screen.getByTestId("triage-sheet-captures")).toHaveTextContent(
        "Draft the proposal",
      );
      expect(screen.getByTestId("raw-draft-count")).toHaveTextContent("0");
      expect(screen.getAllByTestId(/^triage-sheet-sort-basic-/)).toHaveLength(
        1,
      );

      vi.unstubAllGlobals();
    });
  });
});
