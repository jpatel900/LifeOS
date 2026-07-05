import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MomentSwitcher } from "./MomentSwitcher";

describe("MomentSwitcher", () => {
  it("marks aria-selected on the active tab only", () => {
    render(<MomentSwitcher value="flow" onChange={vi.fn()} />);
    expect(screen.getByTestId("moment-switcher-start")).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(screen.getByTestId("moment-switcher-flow")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByTestId("moment-switcher-close")).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("fires onChange with the clicked tab's value", () => {
    const onChange = vi.fn();
    render(<MomentSwitcher value="start" onChange={onChange} />);

    fireEvent.click(screen.getByTestId("moment-switcher-close"));
    expect(onChange).toHaveBeenCalledWith("close");

    fireEvent.click(screen.getByTestId("moment-switcher-flow"));
    expect(onChange).toHaveBeenCalledWith("flow");
  });

  it("exposes tablist/tab roles", () => {
    render(<MomentSwitcher value="start" onChange={vi.fn()} />);
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
  });

  // SP-4: quick color transitions use the fast motion token and fall back
  // to no motion for prefers-reduced-motion users.
  it("tabs use the fast motion token with a reduced-motion fallback", () => {
    render(<MomentSwitcher value="start" onChange={vi.fn()} />);
    const tab = screen.getByTestId("moment-switcher-flow");
    expect(tab).toHaveClass("duration-[var(--motion-fast)]");
    expect(tab).toHaveClass("ease-[var(--motion-ease)]");
    expect(tab).toHaveClass("motion-reduce:transition-none");
    expect(tab).toHaveClass("motion-reduce:duration-0");
  });
});
