import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import HomePage from "../app/page";

describe("HomePage", () => {
  it("renders the heading", () => {
    render(<HomePage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "LifeOS",
    );
  });

  it("shows the primary capture CTA and next-step guidance", () => {
    render(<HomePage />);
    expect(screen.getByRole("link", { name: "Save a thought" })).toBeDefined();
    expect(
      screen.getByText("1. Save one thought in Capture."),
    ).toBeDefined();
    expect(screen.getByText("2. Accept or reject it in Triage.")).toBeDefined();
  });
});
