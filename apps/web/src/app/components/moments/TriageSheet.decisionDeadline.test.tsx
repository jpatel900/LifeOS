import "fake-indexeddb/auto";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowProvider } from "@/lib/WorkflowContext";
import { STORAGE_KEY } from "@/lib/workflowContext/reducerCore";
import { clearStoredTaskDrafts } from "@/lib/durability/draftStore";
import {
  captureWorkflow,
  workflowSeed,
} from "@/__tests__/helpers/workflowReachability";
import { TriageSheet } from "./TriageSheet";

/**
 * Bug hunt #16 (what the person sees): a decision draft's deadline is kept
 * when it is accepted, but the Triage row never showed it, so a wrong day
 * could not be caught before accepting.
 */
const DUE_AT = "2026-10-16T21:00:00.000Z";

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

describe("TriageSheet — decision deadline is shown (bug hunt #16)", () => {
  it("shows the local day a decision is due before it is accepted", async () => {
    const sorted = captureWorkflow(workflowSeed(), "Decide on the lease");
    const draft = sorted.taskDrafts.find((d) => d.status === "pending")!;
    // Parser boundary: a decision draft as the parser returns it.
    const state = {
      ...sorted,
      taskDrafts: sorted.taskDrafts.map((item) =>
        item.id === draft.id
          ? { ...item, task_type: "decision", due_at: DUE_AT }
          : item,
      ),
    };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    render(
      <WorkflowProvider>
        <TriageSheet open onClose={vi.fn()} selectedAreaId={null} />
      </WorkflowProvider>,
    );

    const expectedDay = new Date(DUE_AT).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    expect(
      await screen.findByTestId(`triage-sheet-due-${draft.id}`),
    ).toHaveTextContent(`Decide by ${expectedDay}`);
  });
});
