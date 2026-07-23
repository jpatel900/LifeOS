import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FirstTinyStepCard } from "./FirstTinyStepCard";

describe("FirstTinyStepCard", () => {
  it("associates each visible First move label with a stable, unique input id", () => {
    const onSave = vi.fn();
    const { rerender } = render(
      <>
        <FirstTinyStepCard value={null} onSave={onSave} />
        <FirstTinyStepCard value={null} onSave={onSave} />
      </>,
    );

    const inputs = screen.getAllByRole("textbox", { name: "First move" });
    const ids = inputs.map((input) => input.id);

    expect(ids[0]).not.toBe("");
    expect(new Set(ids).size).toBe(2);
    for (const input of inputs) {
      expect(
        document.querySelector(`label[for="${input.id}"]`),
      ).toHaveTextContent("First move");
    }

    rerender(
      <>
        <FirstTinyStepCard value={null} onSave={onSave} />
        <FirstTinyStepCard value={null} onSave={onSave} />
      </>,
    );

    expect(
      screen
        .getAllByRole("textbox", { name: "First move" })
        .map((input) => input.id),
    ).toEqual(ids);
  });

  it("opens an existing step for editing and saves a trimmed value with Enter", () => {
    const onSave = vi.fn();
    render(<FirstTinyStepCard value="Open the document" onSave={onSave} />);

    fireEvent.click(screen.getByTestId("first-tiny-step-card"));
    const input = screen.getByRole("textbox", { name: "First move" });
    expect(input).toHaveFocus();

    fireEvent.change(input, { target: { value: "  Write one heading  " } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSave).toHaveBeenCalledWith("Write one heading");
  });

  it("keeps blank input editable with an actionable validation message", () => {
    const onSave = vi.fn();
    render(<FirstTinyStepCard value={null} onSave={onSave} />);

    const input = screen.getByRole("textbox", { name: "First move" });
    expect(input).toHaveFocus();
    fireEvent.click(screen.getByTestId("first-tiny-step-save"));

    expect(onSave).not.toHaveBeenCalled();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter a first move before saving",
    );

    fireEvent.change(input, { target: { value: "Open the document" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("first-tiny-step-save"));

    expect(onSave).toHaveBeenCalledWith("Open the document");
  });
});
