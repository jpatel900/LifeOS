import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TaskMapRevisionOfferCard } from "./TaskMapRevisionOfferCard";
import type { RevisionSignal } from "@/lib/taskmap/revision";

const SIGNALS: RevisionSignal[] = [
  {
    kind: "out_of_order_completion",
    nodeId: "send",
    detail: 'You finished "Send it" before an earlier step in the plan.',
  },
  { kind: "cut_scope", detail: "You trimmed what this task needs to finish." },
];

describe("TaskMapRevisionOfferCard (FR-031 slice F5, #679)", () => {
  it("renders the plain-language reason and fires the tap/dismiss handlers", () => {
    const onPropose = vi.fn();
    const onDismiss = vi.fn();
    render(
      <TaskMapRevisionOfferCard
        signals={SIGNALS}
        onPropose={onPropose}
        onDismiss={onDismiss}
      />,
    );

    expect(screen.getByTestId("taskmap-revision-offer")).toHaveTextContent(
      "This map may be out of date.",
    );
    expect(
      screen.getByTestId("taskmap-revision-offer-reason"),
    ).toHaveTextContent(SIGNALS[0]!.detail);

    fireEvent.click(screen.getByTestId("taskmap-revision-offer-propose"));
    expect(onPropose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("taskmap-revision-offer-dismiss"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("names the task at Close", () => {
    render(
      <TaskMapRevisionOfferCard
        signals={SIGNALS}
        taskTitle="Ship the report"
        onPropose={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByTestId("taskmap-revision-offer")).toHaveTextContent(
      "The map for “Ship the report” may be out of date.",
    );
  });
});

/**
 * #679 guard: the offer surfaces are render-only until tapped — NO
 * useEffect-autofired AI call anywhere in the revision-offer loop. The
 * card itself must contain no effects or fetches at all, and no useEffect
 * block in any trigger/wiring module may reference the draft-request
 * pipeline. Source-of-truth style (mirrors the Langfuse scoping guard in
 * lib/ai): if this fails, an AI call moved out of a user-action handler.
 */
describe("revision-offer no-autofire guard (#679)", () => {
  const read = (file: string) => readFileSync(resolve(__dirname, file), "utf8");

  /** Comments may legitimately NAME the forbidden identifiers (that is how
   * the rule is documented in-source); only CODE may not use them. */
  const stripComments = (source: string) =>
    source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  it("the offer card has no effects, no state, and no fetch", () => {
    const source = stripComments(read("TaskMapRevisionOfferCard.tsx"));
    expect(source).not.toMatch(/useEffect/);
    expect(source).not.toMatch(/useState/);
    expect(source).not.toMatch(/fetch\s*\(/);
    expect(source).not.toMatch(/requestTaskMapDraft/);
  });

  /** Extracts every useEffect(...) argument block via brace matching. */
  function useEffectBlocks(source: string): string[] {
    const blocks: string[] = [];
    let searchFrom = 0;
    for (;;) {
      const start = source.indexOf("useEffect(", searchFrom);
      if (start === -1) break;
      let depth = 0;
      let end = start;
      for (let index = start; index < source.length; index += 1) {
        const char = source[index];
        if (char === "(") depth += 1;
        if (char === ")") {
          depth -= 1;
          if (depth === 0) {
            end = index;
            break;
          }
        }
      }
      blocks.push(source.slice(start, end + 1));
      searchFrom = end + 1;
    }
    return blocks;
  }

  it.each([
    "useFlowFocusSession.ts",
    "useTaskMapCloseRevisionOffer.ts",
    "TaskMapSection.tsx",
    "CloseMoment.tsx",
    "TodayMoments.tsx",
  ])("no useEffect in %s references the draft-request pipeline", (file) => {
    const source = stripComments(read(file));
    for (const block of useEffectBlocks(source)) {
      expect(block).not.toMatch(/requestTaskMapDraft/i);
      expect(block).not.toMatch(/fetchTaskMapDraft/);
      expect(block).not.toMatch(/handleProposeRevision/);
      expect(block).not.toMatch(/onPropose/);
    }
  });

  it("the Close offer hook never touches the AI pipeline at all", () => {
    const source = stripComments(read("useTaskMapCloseRevisionOffer.ts"));
    expect(source).not.toMatch(/requestTaskMapDraft/);
    expect(source).not.toMatch(/fetch\s*\(/);
  });
});
