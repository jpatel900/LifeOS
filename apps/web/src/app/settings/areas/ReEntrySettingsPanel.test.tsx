import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { ReEntrySettingsPanel } from "./ReEntrySettingsPanel";
import { readReEntryThreshold } from "@/lib/reEntry/preferences";

describe("return setting", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());
  it("loads the seed and saves with an honest device label", () => {
    render(<ReEntrySettingsPanel />);
    expect(screen.getByLabelText(/Welcome me back/)).toHaveValue(3);
    fireEvent.change(screen.getByLabelText(/Welcome me back/), {
      target: { value: "7" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save return setting" }),
    );
    expect(readReEntryThreshold()).toBe(7);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Saved on this device.",
    );
  });
  it("does not accept a fractional day through form submission", () => {
    render(<ReEntrySettingsPanel />);
    fireEvent.change(screen.getByLabelText(/Welcome me back/), {
      target: { value: "2.5" },
    });
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Save return setting" })
        .closest("form")!,
    );
    expect(readReEntryThreshold()).toBe(3);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Choose a whole number from 1 to 365 days.",
    );
  });
  it("reports blocked storage without claiming success", () => {
    render(<ReEntrySettingsPanel />);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save return setting" }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("could not save");
    expect(screen.getByRole("status")).not.toHaveTextContent(
      "Saved on this device.",
    );
  });
});
