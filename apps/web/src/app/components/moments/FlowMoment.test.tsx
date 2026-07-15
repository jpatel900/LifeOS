import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FlowMoment, type FlowMomentProps } from "./FlowMoment";

/**
 * #572 (execute/review contract completion, epic #555 item 5): the focus
 * screen must render the task's committed first tiny move — present,
 * absent (calm "define your first move" affordance, never blank), and
 * editable — alongside the running session hero.
 */

function baseProps(overrides: Partial<FlowMomentProps> = {}): FlowMomentProps {
  return {
    vm: {
      currentBlock: {
        title: "Deep work: ship the thing",
        areaLabel: "Work",
        startAt: "2026-07-13T09:00:00.000Z",
        endAt: "2026-07-13T09:25:00.000Z",
      },
      drift: null,
    },
    session: {
      activeTaskId: "task-1",
      running: true,
      remaining: 1200,
      total: 1500,
    },
    timeDisplay: "countdown",
    onDone: vi.fn(),
    onPause: vi.fn(),
    onExtend: vi.fn(),
    onToggleTime: vi.fn(),
    onReclaimDrift: vi.fn(),
    onAbandonDrift: vi.fn(),
    progressionNodes: [],
    focusedTask: null,
    taskMapDraft: { phase: "idle" },
    now: new Date("2026-07-13T09:05:00.000Z"),
    onRequestTaskMapDraft: vi.fn(),
    onDismissTaskMapDraft: vi.fn(),
    onApproveTaskMapDraft: vi.fn(),
    onToggleTaskMapNodeCompletion: vi.fn(),
    firstTinyStep: null,
    onUpdateFirstTinyStep: vi.fn(),
    ...overrides,
  };
}

describe("FlowMoment first tiny step (#572)", () => {
  it("renders the committed first tiny move when set", () => {
    render(
      <FlowMoment {...baseProps({ firstTinyStep: "Open the draft doc" })} />,
    );

    expect(screen.getByTestId("first-tiny-step-value")).toHaveTextContent(
      "Open the draft doc",
    );
  });

  it("never renders blank — shows a calm define-your-first-move affordance when absent", () => {
    render(<FlowMoment {...baseProps({ firstTinyStep: null })} />);

    expect(
      screen.queryByTestId("first-tiny-step-value"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("first-tiny-step-input")).toBeInTheDocument();
    expect(screen.getByTestId("first-tiny-step-input")).toHaveAttribute(
      "placeholder",
      expect.stringContaining("Define your first move"),
    );
  });

  it("is inline-editable and persists via the update handler on save", () => {
    const onUpdateFirstTinyStep = vi.fn();
    render(
      <FlowMoment
        {...baseProps({
          firstTinyStep: "Open the draft doc",
          onUpdateFirstTinyStep,
        })}
      />,
    );

    fireEvent.click(screen.getByTestId("first-tiny-step-card"));
    const input = screen.getByTestId("first-tiny-step-input");
    fireEvent.change(input, { target: { value: "Write the first sentence" } });
    fireEvent.click(screen.getByTestId("first-tiny-step-save"));

    expect(onUpdateFirstTinyStep).toHaveBeenCalledWith(
      "Write the first sentence",
    );
  });

  it("rejects a whitespace-only Save — keeps edit mode open, shows validation, never blanks the value (#589)", () => {
    const onUpdateFirstTinyStep = vi.fn();
    render(
      <FlowMoment
        {...baseProps({
          firstTinyStep: "Open the draft doc",
          onUpdateFirstTinyStep,
        })}
      />,
    );

    fireEvent.click(screen.getByTestId("first-tiny-step-card"));
    const input = screen.getByTestId("first-tiny-step-input");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(screen.getByTestId("first-tiny-step-save"));

    // No persistence of a blank value.
    expect(onUpdateFirstTinyStep).not.toHaveBeenCalled();
    // Edit mode stays open — no blank display card is rendered.
    expect(screen.getByTestId("first-tiny-step-input")).toBeInTheDocument();
    expect(
      screen.queryByTestId("first-tiny-step-value"),
    ).not.toBeInTheDocument();
    // A calm, actionable validation state is surfaced.
    expect(screen.getByTestId("first-tiny-step-error")).toBeInTheDocument();

    // Typing again clears the validation state, and a valid save still works.
    fireEvent.change(input, { target: { value: "Write the first sentence" } });
    expect(
      screen.queryByTestId("first-tiny-step-error"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("first-tiny-step-save"));
    expect(onUpdateFirstTinyStep).toHaveBeenCalledWith(
      "Write the first sentence",
    );
  });

  it("does not render the first-tiny-step card when there is no active session", () => {
    render(
      <FlowMoment
        {...baseProps({
          session: {
            activeTaskId: null,
            running: false,
            remaining: 0,
            total: 0,
          },
          vm: { currentBlock: null, drift: null },
        })}
      />,
    );

    expect(
      screen.queryByTestId("first-tiny-step-card"),
    ).not.toBeInTheDocument();
  });
});

// R3-B (premium push #483, round 3): the no-active-block state used to be a
// bare muted text line with zero card/border treatment. It must now use the
// same flagship card shell as the populated CurrentBlockHero, never a bare
// paragraph, and never fabricate a block.
describe("FlowMoment — R3-B no-active-block composition", () => {
  function emptyProps(overrides: Partial<FlowMomentProps> = {}) {
    return baseProps({
      session: { activeTaskId: null, running: false, remaining: 0, total: 0 },
      vm: { currentBlock: null, drift: null },
      ...overrides,
    });
  }

  it("composes the empty state as a card, not a bare text line", () => {
    render(<FlowMoment {...emptyProps()} />);
    const empty = screen.getByTestId("flow-moment-empty");
    expect(empty.tagName).not.toBe("P");
    expect(empty.className).toMatch(/\bworkflow-flagship-card\b/);
    expect(empty.className).toMatch(/\bmoments-card\b/);
  });

  it("states plainly that no block is running without implying one exists", () => {
    render(<FlowMoment {...emptyProps()} />);
    const empty = screen.getByTestId("flow-moment-empty");
    expect(empty).toHaveTextContent("No block running");
    expect(screen.queryByTestId("current-block-hero")).not.toBeInTheDocument();
  });

  it("does not render the empty state once a block/session is active", () => {
    render(<FlowMoment {...baseProps()} />);
    expect(screen.queryByTestId("flow-moment-empty")).not.toBeInTheDocument();
  });
});

// R4-B (premium push #483, round 4): the empty state's card was correct but
// the rest of the canvas was still blank on a fully quiet day (no drift, no
// first-move task) — FlowIdleOrientation fills it, gated on the same
// !hasActiveSession condition as the empty card itself.
describe("FlowMoment — R4-B idle-canvas orientation", () => {
  function emptyProps(overrides: Partial<FlowMomentProps> = {}) {
    return baseProps({
      session: { activeTaskId: null, running: false, remaining: 0, total: 0 },
      vm: { currentBlock: null, drift: null },
      ...overrides,
    });
  }

  it("renders the idle orientation card when no block/session is active", () => {
    render(<FlowMoment {...emptyProps()} />);
    expect(
      screen.getByTestId("flow-idle-orientation"),
    ).toBeInTheDocument();
  });

  it("recedes once a block/session is active — never doubles up with the populated hero", () => {
    render(<FlowMoment {...baseProps()} />);
    expect(
      screen.queryByTestId("flow-idle-orientation"),
    ).not.toBeInTheDocument();
  });

  it("still renders alongside drift recovery — a derailed Flow with no active session is still a quiet canvas", () => {
    render(
      <FlowMoment
        {...emptyProps({
          vm: { currentBlock: null, drift: { minutes: 5, reason: "stuck" } },
        })}
      />,
    );
    expect(
      screen.getByTestId("flow-idle-orientation"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("drift-recovery-card")).toBeInTheDocument();
  });
});
