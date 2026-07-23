import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CaptureCore } from "./CaptureCore";

// #594: every actionable control here reaches the shared >=44px hit-target
// floor via hitTarget.ts (HIT_TARGET_MIN/HIT_TARGET_ROW/HIT_TARGET_INVISIBLE)
// — never a raw min-h-10 (40px). jsdom does not compute layout, so this is a
// className-level guard; the real geometric proof is the Playwright e2e at
// 390px (tests/e2e/hit-targets-390.spec.ts).

/**
 * #556 / #703 — the shared CaptureCore is the single place all three capture
 * surfaces get this behavior from, so its tests are the canonical proof of
 * the contract.
 *
 * #703 changed what that contract IS. There is now one action, "Capture",
 * and this component never parses: the AI sort moved to an explicit triage
 * action. So the former parse-wait tests (spinner visible, second submit
 * blocked while in flight, degraded mock-retry offer, Escape swallowed
 * mid-parse) no longer describe reachable states here and are gone — the
 * degraded/mock-retry path they covered is now proven at its new home in
 * TriageSheet.test.tsx. What remains is what survived the move: the raw
 * text and return hook, and the closing "back to: <hook>" conclusion.
 */
function Harness({
  onResolved,
  onSubmit,
  onCancel,
}: {
  onResolved?: () => void;
  onSubmit?: () => void;
  onCancel?: () => void;
}) {
  return (
    <CaptureCore
      mode="full"
      onSubmit={() => onSubmit?.()}
      onResolved={onResolved}
      onCancel={onCancel}
    />
  );
}

describe("CaptureCore", () => {
  it("offers exactly one save action, labelled Capture (#703)", () => {
    render(<Harness />);

    expect(screen.getByTestId("capture-save")).toHaveTextContent("Capture");
    // The second save button is gone, not renamed — the fork the owner
    // could not tell apart no longer exists.
    expect(screen.queryByTestId("capture-save-raw")).not.toBeInTheDocument();
  });

  it("never shows a parse wait or a degraded-parse offer (#703)", () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    fireEvent.change(screen.getByTestId("capture-textarea"), {
      target: { value: "Follow up with Alex" },
    });
    fireEvent.keyDown(screen.getByTestId("capture-textarea"), {
      key: "Enter",
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    // Saving is synchronous now: no spinner, no failure state, nothing that
    // can leave the user waiting at the front door.
    expect(screen.queryByTestId("capture-parsing")).not.toBeInTheDocument();
    expect(screen.queryByTestId("capture-degraded")).not.toBeInTheDocument();
    expect(screen.queryByTestId("capture-retry-mock")).not.toBeInTheDocument();
  });

  it("renders the return hook as 'back to: <hook>' on save", async () => {
    const onResolved = vi.fn();
    render(<Harness onResolved={onResolved} />);

    fireEvent.change(screen.getByTestId("capture-textarea"), {
      target: { value: "Follow up with Alex" },
    });
    fireEvent.change(screen.getByTestId("capture-return-hook"), {
      target: { value: "the weekly review" },
    });
    fireEvent.keyDown(screen.getByTestId("capture-textarea"), {
      key: "Enter",
    });

    await waitFor(() => {
      expect(screen.getByTestId("capture-conclusion")).toHaveTextContent(
        "back to: the weekly review",
      );
    });

    // #591: the auto-dismiss dwell is a materially perceivable ~2.5s — real-
    // timer tests need headroom past RTL's 1000ms default waitFor timeout.
    await waitFor(
      () => {
        expect(onResolved).toHaveBeenCalled();
      },
      { timeout: 4000 },
    );
  });

  it("falls back to a default hook label when none was entered", async () => {
    render(<Harness />);

    fireEvent.change(screen.getByTestId("capture-textarea"), {
      target: { value: "Follow up with Alex" },
    });
    fireEvent.keyDown(screen.getByTestId("capture-textarea"), {
      key: "Enter",
    });

    await waitFor(() => {
      expect(screen.getByTestId("capture-conclusion")).toHaveTextContent(
        "back to: what you were doing",
      );
    });
  });

  it("Escape while idle cancels", () => {
    const onCancel = vi.fn();
    render(<Harness onCancel={onCancel} />);

    fireEvent.change(screen.getByTestId("capture-textarea"), {
      target: { value: "Follow up with Alex" },
    });
    fireEvent.keyDown(screen.getByTestId("capture-textarea"), {
      key: "Escape",
    });

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  describe("mode=quick (Execute side-capture)", () => {
    it("saves synchronously with no conclusion takeover", () => {
      const onSubmit = vi.fn();
      const onResolved = vi.fn();
      render(
        <CaptureCore
          mode="quick"
          compact
          autoFocus={false}
          onSubmit={onSubmit}
          onResolved={onResolved}
        />,
      );

      fireEvent.change(screen.getByTestId("capture-textarea"), {
        target: { value: "Side thought" },
      });
      fireEvent.keyDown(screen.getByTestId("capture-textarea"), {
        key: "Enter",
      });

      expect(onSubmit).toHaveBeenCalledWith("Side thought", null);
      // Resolves immediately — focus stays on the running session.
      expect(onResolved).toHaveBeenCalled();
      expect(
        screen.queryByTestId("capture-conclusion"),
      ).not.toBeInTheDocument();
    });
  });

  describe("conclusion dwell is materially perceivable (#591)", () => {
    it("stays visible and does not resolve at the old 450ms mark", () => {
      vi.useFakeTimers();
      try {
        const onResolved = vi.fn();
        render(<Harness onResolved={onResolved} />);

        fireEvent.change(screen.getByTestId("capture-textarea"), {
          target: { value: "Follow up with Alex" },
        });
        fireEvent.keyDown(screen.getByTestId("capture-textarea"), {
          key: "Enter",
        });

        expect(screen.getByTestId("capture-conclusion")).toBeInTheDocument();

        vi.advanceTimersByTime(450);
        expect(screen.getByTestId("capture-conclusion")).toBeInTheDocument();
        expect(onResolved).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it("auto-resolves once the full reviewed dwell has elapsed", () => {
      vi.useFakeTimers();
      try {
        const onResolved = vi.fn();
        render(<Harness onResolved={onResolved} />);

        fireEvent.change(screen.getByTestId("capture-textarea"), {
          target: { value: "Follow up with Alex" },
        });
        fireEvent.keyDown(screen.getByTestId("capture-textarea"), {
          key: "Enter",
        });

        vi.advanceTimersByTime(2500);
        expect(onResolved).toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it("an explicit click dismisses the conclusion immediately, well before the dwell elapses", () => {
      vi.useFakeTimers();
      try {
        const onResolved = vi.fn();
        render(<Harness onResolved={onResolved} />);

        fireEvent.change(screen.getByTestId("capture-textarea"), {
          target: { value: "Follow up with Alex" },
        });
        fireEvent.keyDown(screen.getByTestId("capture-textarea"), {
          key: "Enter",
        });

        vi.advanceTimersByTime(100);
        fireEvent.click(screen.getByTestId("capture-conclusion"));

        expect(onResolved).toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it("Enter dismisses the conclusion immediately, well before the dwell elapses", () => {
      vi.useFakeTimers();
      try {
        const onResolved = vi.fn();
        render(<Harness onResolved={onResolved} />);

        fireEvent.change(screen.getByTestId("capture-textarea"), {
          target: { value: "Follow up with Alex" },
        });
        fireEvent.keyDown(screen.getByTestId("capture-textarea"), {
          key: "Enter",
        });

        vi.advanceTimersByTime(100);
        fireEvent.keyDown(screen.getByTestId("capture-textarea"), {
          key: "Enter",
        });

        expect(onResolved).toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("44px hit targets (#594)", () => {
    it("return-hook input and the save control carry a 44px hit-target class in the idle phase", () => {
      render(<Harness />);

      fireEvent.change(screen.getByTestId("capture-textarea"), {
        target: { value: "Follow up with Alex" },
      });

      expect(screen.getByTestId("capture-return-hook").className).toContain(
        "min-h-[44px]",
      );
      expect(screen.getByTestId("capture-save").className).toContain(
        "min-h-11",
      );
    });

    it("the conclusion 'back to' control carries the 44px hit-target class", async () => {
      render(<Harness />);

      fireEvent.change(screen.getByTestId("capture-textarea"), {
        target: { value: "Follow up with Alex" },
      });
      fireEvent.keyDown(screen.getByTestId("capture-textarea"), {
        key: "Enter",
      });

      await waitFor(() => {
        expect(screen.getByTestId("capture-conclusion")).toBeInTheDocument();
      });
      expect(screen.getByTestId("capture-conclusion").className).toContain(
        "min-h-[44px]",
      );
    });
  });
});
