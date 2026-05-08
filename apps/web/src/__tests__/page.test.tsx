import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import HomePage from "../app/page";

describe("HomePage", () => {
  it("renders the heading", () => {
    render(<HomePage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "LifeOS"
    );
  });

  it("mentions quick capture", () => {
    render(<HomePage />);
    expect(screen.getByText("Quick Capture")).toBeDefined();
    expect(
      screen.getByPlaceholderText("What's on your mind? Type anything...")
    ).toBeDefined();
  });
});
