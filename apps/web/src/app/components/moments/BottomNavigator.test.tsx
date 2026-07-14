import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BottomNavigator } from "./BottomNavigator";

describe("BottomNavigator", () => {
  it("renders a moment switcher (distinct testids from the header instance) and a settings link", () => {
    render(<BottomNavigator value="flow" onChange={vi.fn()} />);

    expect(screen.getByTestId("bottom-navigator")).toBeInTheDocument();
    expect(
      screen.getByTestId("moment-switcher-bottom-nav"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("moment-switcher-bottom-nav-flow"),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByTestId("bottom-navigator-settings-link"),
    ).toHaveAttribute("href", "/settings/areas");
  });

  // Same value/onChange path as the header MomentSwitcher — no forked
  // state, this is a second view onto the same moment.
  it("fires the same onChange the header switcher would, with the clicked tab's value", () => {
    const onChange = vi.fn();
    render(<BottomNavigator value="start" onChange={onChange} />);

    fireEvent.click(screen.getByTestId("moment-switcher-bottom-nav-close"));
    expect(onChange).toHaveBeenCalledWith("close");
  });

  it("is hidden at sm and up (sm:hidden) so it only ever renders below 640px", () => {
    render(<BottomNavigator value="start" onChange={vi.fn()} />);
    expect(screen.getByTestId("bottom-navigator")).toHaveClass("sm:hidden");
  });

  it("is fixed to the viewport bottom, above the capture pill's z-index band", () => {
    render(<BottomNavigator value="start" onChange={vi.fn()} />);
    const nav = screen.getByTestId("bottom-navigator");
    expect(nav).toHaveClass("fixed");
    expect(nav).toHaveClass("bottom-0");
    expect(nav).toHaveClass("z-40");
  });

  it("accepts a custom settings href", () => {
    render(
      <BottomNavigator
        value="start"
        onChange={vi.fn()}
        settingsHref="/settings/custom"
      />,
    );
    expect(
      screen.getByTestId("bottom-navigator-settings-link"),
    ).toHaveAttribute("href", "/settings/custom");
  });

  // SP-9 parity: the settings link reaches the >=44px hit-area floor even
  // though it's a bare text affordance (HIT_TARGET_MIN, matching the
  // pattern's other standalone-backgrounded-or-centered call sites).
  it("settings link carries hit-area and touch-manipulation utilities", () => {
    render(<BottomNavigator value="start" onChange={vi.fn()} />);
    const link = screen.getByTestId("bottom-navigator-settings-link");
    expect(link).toHaveClass("min-h-[44px]");
    expect(link).toHaveClass("touch-manipulation");
  });
});
