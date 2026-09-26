import { describe, expect, it } from "vitest";
import { acceptDraft, backlogDraft } from "./triage";
import { createInitialWorkflowState, submitCapture } from "@/lib/workflow";
import type { WorkflowState } from "./shared";

/**
 * FR-049 (#1025) acceptance criterion: "Accepting an AI draft no longer
 * copies the draft's due_at into a new ordinary task ... Decision tasks
 * are the one exception ... Accept keeps copying a decision draft's
 * deadline."
 *
 * This is the demo/local half of the accept-mapping gate
 * (`lib/workflow/triage.ts`'s `acceptDraftWithStatus`, reached by both
 * `acceptDraft` and `backlogDraft`). The persisted half is covered by
 * `lib/data/workflow/draftAccept.test.ts`.
 */

const DUE_AT = "2026-09-30T16:00:00.000Z";

function stateWithDraftDueAt(
  taskType: "task" | "decision" | undefined,
): WorkflowState {
  let state = createInitialWorkflowState();
  state = submitCapture(state, {
    rawText: "Someday review old notes.",
    areaId: "area-main-job",
  });

  const draft = state.taskDrafts[0]!;
  return {
    ...state,
    taskDrafts: [{ ...draft, due_at: DUE_AT, task_type: taskType }],
  };
}

describe("accept mapping never copies an ordinary draft's due_at (#1025)", () => {
  it("drops due_at on accept-to-active for a plain (no task_type) draft", () => {
    const state = stateWithDraftDueAt(undefined);
    const next = acceptDraft(state, state.taskDrafts[0]!.id);
    expect(next.tasks[0]!.due_at).toBeNull();
  });

  it("drops due_at on accept-to-active for an explicit task_type: 'task' draft", () => {
    const state = stateWithDraftDueAt("task");
    const next = acceptDraft(state, state.taskDrafts[0]!.id);
    expect(next.tasks[0]!.due_at).toBeNull();
  });

  it("drops due_at on backlog-accept for an ordinary draft", () => {
    const state = stateWithDraftDueAt("task");
    const next = backlogDraft(state, state.taskDrafts[0]!.id);
    expect(next.tasks[0]!.due_at).toBeNull();
  });

  it("keeps due_at on accept for a decision draft", () => {
    const state = stateWithDraftDueAt("decision");
    const next = acceptDraft(state, state.taskDrafts[0]!.id);
    expect(next.tasks[0]!.due_at).toBe(DUE_AT);
  });

  it("keeps due_at on backlog-accept for a decision draft", () => {
    const state = stateWithDraftDueAt("decision");
    const next = backlogDraft(state, state.taskDrafts[0]!.id);
    expect(next.tasks[0]!.due_at).toBe(DUE_AT);
  });
});
