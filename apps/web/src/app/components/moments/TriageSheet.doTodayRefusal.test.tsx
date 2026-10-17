import "fake-indexeddb/auto";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowProvider } from "@/lib/WorkflowContext";
import { editDraft } from "@/lib/workflow";
import { STORAGE_KEY } from "@/lib/workflowContext/reducerCore";
import { clearStoredTaskDrafts } from "@/lib/durability/draftStore";
import {
  acceptLatestDraft,
  captureWorkflow,
  workflowSeed,
} from "@/__tests__/helpers/workflowReachability";
import { TriageSheet } from "./TriageSheet";

/**
 * Bug hunt #11 — "Do today" in the Triage sheet did nothing at all, with no
 * message, when the draft had no first move or today was already full.
 */
function seedTodayFull() {
  let state = workflowSeed();
  for (const text of ["Draft the report", "Book the dentist", "Fix the tap"]) {
    state = acceptLatestDraft(captureWorkflow(state, text));
  }
  state = captureWorkflow(state, "Call the plumber");
  const draft = state.taskDrafts.find((item) => item.status === "pending")!;
  return { state, draftId: draft.id };
}

function seedNoFirstMove() {
  let state = captureWorkflow(workflowSeed(), "Think about the garden");
  const draft = state.taskDrafts.find((item) => item.status === "pending")!;
  state = editDraft(state, draft.id, { first_tiny_step: null });
  return { state, draftId: draft.id };
}

function renderSheet(state: unknown) {
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  render(
    <WorkflowProvider>
      <TriageSheet open onClose={vi.fn()} selectedAreaId={null} />
    </WorkflowProvider>,
  );
}

beforeEach(async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  window.sessionStorage.clear();
  await clearStoredTaskDrafts();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  window.sessionStorage.clear();
  await clearStoredTaskDrafts();
});

describe("TriageSheet — 'Do today' that cannot happen says why (bug hunt #11)", () => {
  it("says today is full", async () => {
    const { state, draftId } = seedTodayFull();
    renderSheet(state);

    fireEvent.click(await screen.findByTestId(`triage-sheet-today-${draftId}`));

    expect(
      await screen.findByTestId(`triage-sheet-today-refused-${draftId}`),
    ).toHaveTextContent("Today is full");
    // The draft is still there to decide about.
    expect(
      screen.getByTestId(`triage-sheet-item-${draftId}`),
    ).toBeInTheDocument();
  });

  it("says a first move is needed", async () => {
    const { state, draftId } = seedNoFirstMove();
    renderSheet(state);

    fireEvent.click(await screen.findByTestId(`triage-sheet-today-${draftId}`));

    expect(
      await screen.findByTestId(`triage-sheet-today-refused-${draftId}`),
    ).toHaveTextContent("first move");
  });
});
