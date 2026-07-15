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

  // SP-9: tabs reach a >=44px effective hit area and drop the 300ms
  // double-tap delay on coarse pointers.
  it("tabs carry hit-area and touch-manipulation utilities", () => {
    render(<MomentSwitcher value="start" onChange={vi.fn()} />);
    const tab = screen.getByTestId("moment-switcher-flow");
    expect(tab).toHaveClass("min-h-[44px]");
    expect(tab).toHaveClass("touch-manipulation");
  });

  // D-10 R2 (#483 round 2, blocker #3 — mixed control heights): the track's
  // `.workflow-shell__nav` class carried an *unlayered* `padding: 0.35rem`
  // (globals.css) that Tailwind's cascade layers always rank above the
  // layered `p-1` utility it used to pair with, inflating this pill to
  // ~57px against the masthead's other 44px-floor controls — a 13px visible
  // height mismatch. Regression: the track no longer carries that class or
  // any of its own padding, so the tab's own `min-h-[44px]` is the only
  // contributor to the pill's height.
  it("the track carries no padding and does not use the workflow-shell__nav class (round-1 height-mismatch regression)", () => {
    render(<MomentSwitcher value="start" onChange={vi.fn()} />);
    const track = screen.getByTestId("moment-switcher");
    expect(track.className).not.toMatch(/\bworkflow-shell__nav\b/);
    expect(track.className).not.toMatch(/\bp-1\b/);
  });

  // D-10 R2 (#483 round 2, blocker #6 — kbd chip inconsistency + "busy"
  // permanent stamps): every tab's kbd hint now shares kbdChip.ts's single
  // treatment and is hidden below `sm` (no physical keyboard on touch) and
  // hover/focus-revealed above it, rather than permanently stamped.
  it("kbd hints are hidden below sm and only reveal on hover/focus of their own tab", () => {
    render(<MomentSwitcher value="start" onChange={vi.fn()} />);
    const selectedHint = screen.getByTestId("moment-switcher-start").querySelector("kbd")!;
    const unselectedHint = screen.getByTestId("moment-switcher-flow").querySelector("kbd")!;

    for (const hint of [selectedHint, unselectedHint]) {
      expect(hint).toHaveClass("hidden");
      expect(hint).toHaveClass("opacity-0");
      expect(hint).toHaveClass("sm:group-hover:opacity-100");
      expect(hint).toHaveClass("sm:group-focus-within:opacity-100");
    }
    // The selected tab's hint uses the on-accent contrast variant (it sits
    // on a bg-primary fill); the unselected tab's uses the neutral one.
    expect(selectedHint.className).toMatch(/text-primary-foreground\/90/);
    expect(unselectedHint.className).toMatch(/text-muted-foreground/);
  });

  // D-10 R2: real focus-visible ring using the app's own --ring token,
  // replacing the bare browser default outline every masthead control fell
  // through to on Tab (round-1 blocker #4).
  it("tabs carry the app's focus-visible ring token, not the browser default", () => {
    render(<MomentSwitcher value="start" onChange={vi.fn()} />);
    const tab = screen.getByTestId("moment-switcher-flow");
    expect(tab).toHaveClass("outline-none");
    expect(tab).toHaveClass("focus-visible:ring-2");
    expect(tab).toHaveClass("focus-visible:ring-ring");
    expect(tab).toHaveClass("focus-visible:ring-offset-2");
  });
});
