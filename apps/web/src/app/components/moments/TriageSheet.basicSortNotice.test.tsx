import "fake-indexeddb/auto";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowProvider } from "@/lib/WorkflowContext";
import { STORAGE_KEY } from "@/lib/workflowContext/reducerCore";
import { clearStoredTaskDrafts } from "@/lib/durability/draftStore";
import { stubParseCaptureFetch } from "@/__tests__/helpers/parseCaptureFetch";
import { submitRawCapture } from "@/lib/workflow";
import { workflowSeed } from "@/__tests__/helpers/workflowReachability";
import { AI_SORTING_OFF_SORTED_HERE } from "@/lib/statusVocabulary";
import { TriageSheet } from "./TriageSheet";

/**
 * Bug hunt #10 — when AI sorting was off or down and basic sorting ran, the
 * moments Triage sheet never said so, so placeholder drafts looked like a
 * real sort (and their area was a guess).
 */
let restoreFetch: (() => void) | null = null;

beforeEach(async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  window.sessionStorage.clear();
  await clearStoredTaskDrafts();
  restoreFetch = stubParseCaptureFetch();
});

afterEach(async () => {
  restoreFetch?.();
  vi.unstubAllEnvs();
  window.sessionStorage.clear();
  await clearStoredTaskDrafts();
});

describe("TriageSheet — basic sorting is disclosed (bug hunt #10)", () => {
  it("says basic sorting was used, and to check each draft's area", async () => {
    const state = submitRawCapture(workflowSeed(), {
      rawText: "Plan the volunteer rota",
      areaId: null,
    });
    const capture = state.captureItems[0]!;
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    render(
      <WorkflowProvider>
        <TriageSheet open onClose={vi.fn()} selectedAreaId={null} />
      </WorkflowProvider>,
    );

    fireEvent.click(
      await screen.findByTestId(`triage-sheet-sort-${capture.id}`),
    );

    const notice = await screen.findByTestId(
      "triage-sheet-sort-notice",
      {},
      { timeout: 3000 },
    );
    expect(notice).toHaveTextContent(AI_SORTING_OFF_SORTED_HERE);
    expect(notice).toHaveTextContent("area");
  });
});
