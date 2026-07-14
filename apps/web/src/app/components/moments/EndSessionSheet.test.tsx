import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EndSessionSheet } from "./EndSessionSheet";

/**
 * #572 (execute/review contract completion, epic #555 item 5): the end
 * sheet stands between "end this session" and any closed/verdict copy.
 * These tests cover the sequence (Save disabled/labeled "Saving…" until
 * the caller's promise resolves — state truth, #551/#563 precedent) and
 * that all four outcomes (done/partial/skipped/stuck) are reachable and
 * forwarded with the chosen duration/note.
 */

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("EndSessionSheet", () => {
  it("prefills duration from the session clock and defaults outcome to Done", () => {
    render(
      <EndSessionSheet
        open
        taskTitle="Ship the launch email"
        elapsedMinutes={18}
        onCancel={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByTestId("end-session-minutes")).toHaveValue(18);
    expect(screen.getByTestId("end-session-outcome-completed")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("does not call onSave until the user clicks Save", () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <EndSessionSheet
        open
        taskTitle="Task"
        elapsedMinutes={10}
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByTestId("end-session-outcome-partial"));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("disables Save and shows Saving… until the awaited save resolves — no verdict before that", async () => {
    const { promise, resolve } = deferred<void>();
    const onSave = vi.fn().mockReturnValue(promise);
    render(
      <EndSessionSheet
        open
        taskTitle="Task"
        elapsedMinutes={10}
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByTestId("end-session-save"));

    // Mid-flight: Save is disabled and relabeled, not a closed verdict.
    const saveButton = screen.getByTestId("end-session-save");
    expect(saveButton).toBeDisabled();
    expect(saveButton).toHaveTextContent("Saving…");
    expect(onSave).toHaveBeenCalledTimes(1);

    resolve();
    await waitFor(() => expect(saveButton).not.toBeDisabled());
    expect(saveButton).toHaveTextContent("Save");
  });

  it.each([
    ["completed", "end-session-outcome-completed"],
    ["partial", "end-session-outcome-partial"],
    ["skipped", "end-session-outcome-skipped"],
    ["stuck", "end-session-outcome-stuck"],
  ] as const)(
    "forwards the %s outcome with the edited duration and note",
    async (outcome, testId) => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      render(
        <EndSessionSheet
          open
          taskTitle="Task"
          elapsedMinutes={10}
          onCancel={vi.fn()}
          onSave={onSave}
        />,
      );

      fireEvent.click(screen.getByTestId(testId));
      fireEvent.change(screen.getByTestId("end-session-minutes"), {
        target: { value: "22" },
      });
      fireEvent.change(screen.getByTestId("end-session-note"), {
        target: { value: "A note about it" },
      });
      fireEvent.click(screen.getByTestId("end-session-save"));

      await waitFor(() =>
        expect(onSave).toHaveBeenCalledWith(outcome, 22, "A note about it"),
      );
    },
  );

  it("forwards a null note when left blank", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <EndSessionSheet
        open
        taskTitle="Task"
        elapsedMinutes={5}
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByTestId("end-session-save"));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith("completed", 5, null),
    );
  });

  it("re-primes to a fresh draft every time it opens", () => {
    const { rerender } = render(
      <EndSessionSheet
        open={false}
        taskTitle="Task"
        elapsedMinutes={5}
        onCancel={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    rerender(
      <EndSessionSheet
        open
        taskTitle="Task"
        elapsedMinutes={31}
        onCancel={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByTestId("end-session-minutes")).toHaveValue(31);
    expect(screen.getByTestId("end-session-note")).toHaveValue("");
  });
});
