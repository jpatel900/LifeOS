import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { CaptureCore } from "./CaptureCore";
import type { CaptureParseState } from "@/lib/WorkflowContext";

// #594: every actionable control here reaches the shared >=44px hit-target
// floor via hitTarget.ts (HIT_TARGET_MIN/HIT_TARGET_ROW/HIT_TARGET_INVISIBLE)
// — never a raw min-h-10 (40px). jsdom does not compute layout, so this is a
// className-level guard; the real geometric proof is the Playwright e2e at
// 390px (tests/e2e/hit-targets-390.spec.ts).

const IDLE: CaptureParseState = { phase: "idle" };

/**
 * #556 (FR-026 capture containment) — the shared CaptureCore is the single
 * place all three capture surfaces get this behavior from, so its tests are
 * the canonical proof of the contract: raw text stays visible through a
 * parse wait, no second submit is possible while one is in flight, a
 * degraded parse offers a synchronous choice (never fire-and-forget), and
 * the sequence ends with "back to: <hook>".
 *
 * Deliberately drives `captureParse` from local harness state rather than
 * mocking WorkflowContext, matching the pattern CaptureOverlay.test.tsx
 * already uses — CaptureCore never reads the return value of
 * `onSubmitParse`, so these tests double as proof that it works under both
 * the current `void`-returning submitCaptureText and #565's coming
 * `string | null`-returning one.
 */
function ParseHarness({
  onResolved,
  onSubmitParse,
  onCancel,
}: {
  onResolved?: (outcome: string) => void;
  onSubmitParse?: () => void;
  onCancel?: () => void;
}) {
  const [captureParse, setCaptureParse] = useState<CaptureParseState>(IDLE);

  return (
    <div>
      <button
        data-testid="resolve-parsed"
        onClick={() =>
          setCaptureParse({
            phase: "parsed",
            captureId: "cap-1",
            parser: "mock",
            status: "ai_unavailable",
          })
        }
      >
        resolve
      </button>
      <button
        data-testid="fail-parse"
        onClick={() =>
          setCaptureParse({
            phase: "failed",
            captureId: "cap-1",
            status: "ai_unavailable",
            message: "Parsing failed safely.",
            canRetryWithMock: true,
          })
        }
      >
        fail
      </button>
      <CaptureCore
        mode="parse"
        captureParse={captureParse}
        onRetryWithMock={() =>
          setCaptureParse({
            phase: "parsing",
            captureId: "cap-1",
            parserMode: "mock",
          })
        }
        onSubmitParse={() => {
          onSubmitParse?.();
          setCaptureParse({
            phase: "parsing",
            captureId: "cap-1",
            parserMode: "auto",
          });
        }}
        onSubmitRaw={vi.fn()}
        onResolved={(outcome) => onResolved?.(outcome)}
        onCancel={onCancel}
      />
    </div>
  );
}

describe("CaptureCore", () => {
  it("keeps the raw text visible from submit through resolve and blocks a second submit while parsing", async () => {
    const onSubmitParse = vi.fn();
    render(<ParseHarness onSubmitParse={onSubmitParse} />);

    fireEvent.change(screen.getByTestId("capture-textarea"), {
      target: { value: "Follow up with Alex" },
    });
    fireEvent.keyDown(screen.getByTestId("capture-textarea"), {
      key: "Enter",
    });

    // t=0: raw text stays visible, not cleared.
    expect(
      (screen.getByTestId("capture-textarea") as HTMLTextAreaElement).value,
    ).toBe("Follow up with Alex");
    expect(screen.getByTestId("capture-parsing")).toBeVisible();
    expect(onSubmitParse).toHaveBeenCalledTimes(1);

    // No new capture can begin while waiting: both save actions are
    // disabled, and pressing Enter again does not fire a second submit.
    expect(screen.getByTestId("capture-save")).toBeDisabled();
    expect(screen.getByTestId("capture-save-raw")).toBeDisabled();
    fireEvent.keyDown(screen.getByTestId("capture-textarea"), {
      key: "Enter",
    });
    expect(onSubmitParse).toHaveBeenCalledTimes(1);

    // Resolve the parse — raw text is still visible right up to resolution.
    fireEvent.click(screen.getByTestId("resolve-parsed"));
    expect(
      (screen.getByTestId("capture-textarea") as HTMLTextAreaElement).value,
    ).toBe("Follow up with Alex");

    await waitFor(() => {
      expect(screen.getByTestId("capture-conclusion")).toBeInTheDocument();
    });
  });

  it("renders the return hook as 'back to: <hook>' on resolve", async () => {
    const onResolved = vi.fn();
    render(<ParseHarness onResolved={onResolved} />);

    fireEvent.change(screen.getByTestId("capture-textarea"), {
      target: { value: "Follow up with Alex" },
    });
    fireEvent.change(screen.getByTestId("capture-return-hook"), {
      target: { value: "the weekly review" },
    });
    fireEvent.keyDown(screen.getByTestId("capture-textarea"), {
      key: "Enter",
    });

    fireEvent.click(screen.getByTestId("resolve-parsed"));

    await waitFor(() => {
      expect(screen.getByTestId("capture-conclusion")).toHaveTextContent(
        "back to: the weekly review",
      );
    });

    // #591: the auto-dismiss dwell is now a materially perceivable ~2.5s,
    // not the old 450ms — real-timer tests need headroom past RTL's 1000ms
    // default waitFor timeout to see it resolve without asserting anything
    // about the exact duration (that's covered by the fake-timer tests
    // below).
    await waitFor(
      () => {
        expect(onResolved).toHaveBeenCalledWith("parsed");
      },
      { timeout: 4000 },
    );
  });

  it("falls back to a default hook label when none was entered", async () => {
    render(<ParseHarness />);

    fireEvent.change(screen.getByTestId("capture-textarea"), {
      target: { value: "Follow up with Alex" },
    });
    fireEvent.keyDown(screen.getByTestId("capture-textarea"), {
      key: "Enter",
    });
    fireEvent.click(screen.getByTestId("resolve-parsed"));

    await waitFor(() => {
      expect(screen.getByTestId("capture-conclusion")).toHaveTextContent(
        "back to: what you were doing",
      );
    });
  });

  it("offers a synchronous mock-retry or keep-as-raw choice when the parse fails, never fire-and-forget", async () => {
    render(<ParseHarness />);

    fireEvent.change(screen.getByTestId("capture-textarea"), {
      target: { value: "Follow up with Alex" },
    });
    fireEvent.keyDown(screen.getByTestId("capture-textarea"), {
      key: "Enter",
    });

    fireEvent.click(screen.getByTestId("fail-parse"));

    const degraded = await screen.findByTestId("capture-degraded");
    expect(degraded).toHaveTextContent("Parsing failed safely.");
    expect(screen.getByTestId("capture-retry-mock")).toBeVisible();
    expect(screen.getByTestId("capture-keep-raw")).toBeVisible();

    // The raw text is still visible — nothing was lost while degraded.
    expect(
      (screen.getByTestId("capture-textarea") as HTMLTextAreaElement).value,
    ).toBe("Follow up with Alex");

    // "Keep as raw" is a synchronous, in-band choice, not a fire-and-forget
    // background retry — it resolves the sequence immediately via the same
    // conclusion path as a successful parse.
    fireEvent.click(screen.getByTestId("capture-keep-raw"));
    await waitFor(() => {
      expect(screen.getByTestId("capture-conclusion")).toBeInTheDocument();
    });
  });

  it("Escape is swallowed while waiting so the user cannot abandon the return-hook context mid-parse", () => {
    const onCancel = vi.fn();
    render(<ParseHarness onCancel={onCancel} />);

    fireEvent.change(screen.getByTestId("capture-textarea"), {
      target: { value: "Follow up with Alex" },
    });
    fireEvent.keyDown(screen.getByTestId("capture-textarea"), {
      key: "Enter",
    });

    fireEvent.keyDown(screen.getByTestId("capture-textarea"), {
      key: "Escape",
    });
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByTestId("capture-parsing")).toBeVisible();
  });

  describe("mode=raw-only (Execute side-capture)", () => {
    it("saves raw synchronously with no parse wait and no conclusion takeover", () => {
      const onSubmitRaw = vi.fn();
      const onResolved = vi.fn();
      render(
        <CaptureCore
          mode="raw-only"
          compact
          autoFocus={false}
          onSubmitRaw={onSubmitRaw}
          onResolved={onResolved}
        />,
      );

      fireEvent.change(screen.getByTestId("capture-textarea"), {
        target: { value: "Side thought" },
      });
      fireEvent.keyDown(screen.getByTestId("capture-textarea"), {
        key: "Enter",
      });

      expect(onSubmitRaw).toHaveBeenCalledWith("Side thought", null);
      // Resolves immediately, synchronously — no waiting/degraded/conclusion
      // phase is ever entered for a mode that never parses.
      expect(onResolved).toHaveBeenCalledWith("raw");
      expect(screen.queryByTestId("capture-parsing")).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("capture-conclusion"),
      ).not.toBeInTheDocument();
    });
  });

  it("offline: resolves as raw with no parse wait (FR-027)", async () => {
    const onLineSpy = vi
      .spyOn(navigator, "onLine", "get")
      .mockReturnValue(false);
    const onResolved = vi.fn();
    render(<ParseHarness onResolved={onResolved} />);

    fireEvent.change(screen.getByTestId("capture-textarea"), {
      target: { value: "Follow up with Alex" },
    });
    fireEvent.keyDown(screen.getByTestId("capture-textarea"), {
      key: "Enter",
    });

    // Never enters the parsing phase — there is nothing to wait on.
    expect(screen.queryByTestId("capture-parsing")).not.toBeInTheDocument();
    expect(screen.getByTestId("capture-conclusion")).toBeInTheDocument();

    await waitFor(
      () => {
        expect(onResolved).toHaveBeenCalledWith("raw");
      },
      { timeout: 4000 },
    );

    onLineSpy.mockRestore();
  });

  describe("conclusion dwell is materially perceivable (#591)", () => {
    it("stays visible and does not resolve at the old 450ms mark", async () => {
      vi.useFakeTimers();
      try {
        const onResolved = vi.fn();
        render(<ParseHarness onResolved={onResolved} />);

        fireEvent.change(screen.getByTestId("capture-textarea"), {
          target: { value: "Follow up with Alex" },
        });
        fireEvent.keyDown(screen.getByTestId("capture-textarea"), {
          key: "Enter",
        });
        fireEvent.click(screen.getByTestId("resolve-parsed"));

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
        render(<ParseHarness onResolved={onResolved} />);

        fireEvent.change(screen.getByTestId("capture-textarea"), {
          target: { value: "Follow up with Alex" },
        });
        fireEvent.keyDown(screen.getByTestId("capture-textarea"), {
          key: "Enter",
        });
        fireEvent.click(screen.getByTestId("resolve-parsed"));

        vi.advanceTimersByTime(2500);
        expect(onResolved).toHaveBeenCalledWith("parsed");
      } finally {
        vi.useRealTimers();
      }
    });

    it("an explicit click dismisses the conclusion immediately, well before the dwell elapses", () => {
      vi.useFakeTimers();
      try {
        const onResolved = vi.fn();
        render(<ParseHarness onResolved={onResolved} />);

        fireEvent.change(screen.getByTestId("capture-textarea"), {
          target: { value: "Follow up with Alex" },
        });
        fireEvent.keyDown(screen.getByTestId("capture-textarea"), {
          key: "Enter",
        });
        fireEvent.click(screen.getByTestId("resolve-parsed"));

        vi.advanceTimersByTime(100);
        fireEvent.click(screen.getByTestId("capture-conclusion"));

        expect(onResolved).toHaveBeenCalledWith("parsed");
      } finally {
        vi.useRealTimers();
      }
    });

    it("Enter dismisses the conclusion immediately, well before the dwell elapses", () => {
      vi.useFakeTimers();
      try {
        const onResolved = vi.fn();
        render(<ParseHarness onResolved={onResolved} />);

        fireEvent.change(screen.getByTestId("capture-textarea"), {
          target: { value: "Follow up with Alex" },
        });
        fireEvent.keyDown(screen.getByTestId("capture-textarea"), {
          key: "Enter",
        });
        fireEvent.click(screen.getByTestId("resolve-parsed"));

        vi.advanceTimersByTime(100);
        fireEvent.keyDown(screen.getByTestId("capture-textarea"), {
          key: "Enter",
        });

        expect(onResolved).toHaveBeenCalledWith("parsed");
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("44px hit targets (#594)", () => {
    // #594: covers every phase's actionable controls, including the
    // degraded and conclusion ones an e2e run in mock-mode (which never
    // fails a parse) can never reach.
    it("return-hook input and save controls carry a 44px hit-target class in the idle phase", () => {
      render(<ParseHarness />);

      fireEvent.change(screen.getByTestId("capture-textarea"), {
        target: { value: "Follow up with Alex" },
      });

      expect(screen.getByTestId("capture-return-hook").className).toContain(
        "min-h-[44px]",
      );
      expect(screen.getByTestId("capture-save-raw").className).toContain(
        "min-h-[44px]",
      );
      expect(screen.getByTestId("capture-save").className).toContain(
        "min-h-11",
      );
    });

    it("the degraded phase's retry-mock and keep-raw actions carry the 44px hit-target class", async () => {
      render(<ParseHarness />);

      fireEvent.change(screen.getByTestId("capture-textarea"), {
        target: { value: "Follow up with Alex" },
      });
      fireEvent.keyDown(screen.getByTestId("capture-textarea"), {
        key: "Enter",
      });
      fireEvent.click(screen.getByTestId("fail-parse"));

      await screen.findByTestId("capture-degraded");
      expect(screen.getByTestId("capture-retry-mock").className).toContain(
        "min-h-[44px]",
      );
      expect(screen.getByTestId("capture-keep-raw").className).toContain(
        "min-h-[44px]",
      );
    });

    it("the conclusion 'back to' control carries the 44px hit-target class", async () => {
      render(<ParseHarness />);

      fireEvent.change(screen.getByTestId("capture-textarea"), {
        target: { value: "Follow up with Alex" },
      });
      fireEvent.keyDown(screen.getByTestId("capture-textarea"), {
        key: "Enter",
      });
      fireEvent.click(screen.getByTestId("resolve-parsed"));

      await waitFor(() => {
        expect(screen.getByTestId("capture-conclusion")).toBeInTheDocument();
      });
      expect(screen.getByTestId("capture-conclusion").className).toContain(
        "min-h-[44px]",
      );
    });
  });
});
