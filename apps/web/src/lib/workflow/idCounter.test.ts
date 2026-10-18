import { describe, expect, it } from "vitest";
import {
  nextId,
  raiseWorkflowIdCounterFromState,
  syncWorkflowIdCounterFromState,
} from "./shared";
import {
  captureWorkflow,
  workflowSeed,
} from "@/__tests__/helpers/workflowReachability";

/**
 * Bug hunt #12: drafts restored from the device store were minted in other
 * tabs. The next local id must not reuse one of theirs, and bringing them in
 * must never lower the counter.
 */
describe("raiseWorkflowIdCounterFromState", () => {
  it("moves the counter past ids from another tab and never lowers it", () => {
    syncWorkflowIdCounterFromState(workflowSeed());
    const other = captureWorkflow(workflowSeed(), "Another tab's thought");
    const otherDraft = other.taskDrafts[0]!;
    const restoredId = { ...otherDraft, id: "task-draft-40" };

    syncWorkflowIdCounterFromState(workflowSeed());
    raiseWorkflowIdCounterFromState({
      ...workflowSeed(),
      taskDrafts: [restoredId],
    });
    expect(nextId("task-draft")).toBe("task-draft-41");

    raiseWorkflowIdCounterFromState(workflowSeed());
    expect(nextId("task-draft")).toBe("task-draft-42");
  });
});
