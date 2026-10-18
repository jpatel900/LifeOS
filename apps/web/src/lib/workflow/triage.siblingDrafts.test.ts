import { describe, expect, it } from "vitest";
import { acceptDraft, backlogDraft, splitDraft } from "./triage";
import {
  captureWorkflow,
  workflowSeed,
} from "@/__tests__/helpers/workflowReachability";

/**
 * Bug hunt #3: one capture can hold several task drafts (a brain dump the
 * AI splits, or a draft the user splits). Accepting the first one used to
 * make every sibling's "Do today" and "Accept to backlog" a silent no-op,
 * because accept refused any draft whose CAPTURE already had a task.
 */
function stateWithSiblingDrafts() {
  let state = captureWorkflow(workflowSeed(), "Call the plumber and buy milk");
  const original = state.taskDrafts.find((d) => d.status === "pending")!;
  state = splitDraft(state, original.id, ["Call the plumber", "Buy milk"]);
  const siblings = state.taskDrafts.filter((d) => d.status === "pending");
  expect(siblings).toHaveLength(2);
  expect(siblings[0]!.capture_item_id).toBe(siblings[1]!.capture_item_id);
  return { state, first: siblings[0]!, second: siblings[1]! };
}

describe("sibling drafts from one capture (bug hunt #3)", () => {
  it("accepts the second draft to backlog after the first went to today", () => {
    const { state, first, second } = stateWithSiblingDrafts();
    const afterFirst = acceptDraft(state, first.id);
    expect(afterFirst.tasks.some((t) => t.title === first.title)).toBe(true);

    const afterSecond = backlogDraft(afterFirst, second.id);
    expect(afterSecond).not.toBe(afterFirst);
    const task = afterSecond.tasks.find((t) => t.title === second.title);
    expect(task?.status).toBe("backlog");
    expect(task?.source_capture_item_id).toBe(second.capture_item_id);
    expect(afterSecond.taskDrafts.find((d) => d.id === second.id)?.status).toBe(
      "accepted",
    );
  });

  it("accepts the second draft to today after the first went to the backlog", () => {
    const { state, first, second } = stateWithSiblingDrafts();
    const afterFirst = backlogDraft(state, first.id);
    const afterSecond = acceptDraft(afterFirst, second.id);
    expect(
      afterSecond.tasks.find((t) => t.title === second.title)?.status,
    ).toBe("active");
  });

  it("still never accepts the same draft twice", () => {
    const { state, first } = stateWithSiblingDrafts();
    const once = acceptDraft(state, first.id);
    expect(acceptDraft(once, first.id)).toBe(once);
    expect(backlogDraft(once, first.id)).toBe(once);
  });
});
