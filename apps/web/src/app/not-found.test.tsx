import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import NotFound from "./not-found";

/**
 * Final UX Loop C2-S7 (#687 finding 1, "BRANDED 404"): before this file
 * existed, an unrouted path fell through to Next's bare default 404 — no
 * shell chrome, no way home. This pins the replacement stays calm, plain,
 * and gives exactly one way out.
 */
describe("NotFound (#687 finding 1)", () => {
  it("names the problem in plain words and offers one way home", () => {
    render(<NotFound />);

    expect(
      screen.getByRole("heading", { name: "Page not found" }),
    ).toBeInTheDocument();

    const home = screen.getByRole("link", { name: "Go to Today" });
    expect(home).toBeInTheDocument();
    expect(home).toHaveAttribute("href", "/");
  });
});
