import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkflowProvider } from "@/lib/WorkflowContext";
import { TriageView } from "./TriageView";
import {
  buildWorkflowCockpitViewModel,
  captureWorkflow,
  workflowSeed,
} from "@/__tests__/helpers/workflowReachability";

// #615: the "Not this person" reject-link control reaches the shared
// >=44px hit-target floor via hitTarget.ts (HIT_TARGET_MIN) — never a raw
// min-h-8 (32px). Unreachable via the demo-mode e2e oracle (the mock
// parser never sets person_mentions on a draft), so this is a
// className-level guard; jsdom does not compute layout.

function noop() {}

describe("TriageView 44px hit targets (#615)", () => {
  it("the 'Not this person' button carries the 44px hit-target class", () => {
    let state = workflowSeed();
    state = captureWorkflow(state, "Follow up with Alex about the deck.");
    state = {
      ...state,
      taskDrafts: state.taskDrafts.map((draft) =>
        draft.status === "pending"
          ? {
              ...draft,
              person_mentions: [
                { name: "Alex", role: "waiting_on" as const, confidence: 0.8 },
              ],
            }
          : draft,
      ),
    };

    // #703: TriageView now embeds the shared UnsortedCaptures Sort action,
    // which reads WorkflowContext, so this unit render needs the provider.
    render(
      <WorkflowProvider>
        <TriageView
          vm={buildWorkflowCockpitViewModel(state)}
          onDrop={noop}
          onBacklog={noop}
          onToday={noop}
          onEdit={noop}
          onSplit={noop}
          onMerge={noop}
          onRejectPersonLink={noop}
          onPlan={noop}
        />
      </WorkflowProvider>,
    );

    expect(
      screen.getByRole("button", { name: "Not this person" }).className,
    ).toContain("min-h-[44px]");
  });
});
