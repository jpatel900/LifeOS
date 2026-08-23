import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkflowProvider } from "@/lib/WorkflowContext";
import type { WorkflowState } from "@/lib/workflow";
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

// #789: parsing finishes with fire-and-forget follow-up work (people
// resolution, mention and commitment proposals), so a draft's content can be
// refreshed underneath while someone is still typing into this panel. That
// refresh must not clear what they have typed. It used to: the reset effect
// keyed on current's title/description/first_tiny_step, so a same-draft
// refresh wiped both split inputs, which left "Split draft" `disabled` and
// turned the next click into a silent no-op — the cause of the long-running
// triage split-drafts flake. Deterministic guard for a failure that otherwise
// only shows up as an intermittent CI red.
describe("TriageView keeps typed input across a background draft refresh (#789)", () => {
  function renderView(state: WorkflowState) {
    return (
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
      </WorkflowProvider>
    );
  }

  it("a content-only refresh of the same draft leaves the split inputs typed and the button live", () => {
    let state = workflowSeed();
    state = captureWorkflow(state, "Tidy the garage shelves");

    const { rerender } = render(renderView(state));

    fireEvent.change(screen.getByPlaceholderText("First split task"), {
      target: { value: "Sort tools into bins" },
    });
    fireEvent.change(screen.getByPlaceholderText("Second split task"), {
      target: { value: "Donate the spare shelf" },
    });

    // The late update: same draft id, refreshed content.
    rerender(
      renderView({
        ...state,
        taskDrafts: state.taskDrafts.map((draft) =>
          draft.status === "pending"
            ? {
                ...draft,
                first_tiny_step: `${draft.first_tiny_step} (refreshed)`,
                description: "Enriched after the parse settled.",
              }
            : draft,
        ),
      }),
    );

    expect(
      (screen.getByPlaceholderText("First split task") as HTMLInputElement)
        .value,
    ).toBe("Sort tools into bins");
    expect(
      (screen.getByPlaceholderText("Second split task") as HTMLInputElement)
        .value,
    ).toBe("Donate the spare shelf");
    expect(
      (screen.getByRole("button", { name: "Split draft" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });
});
