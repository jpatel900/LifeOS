import { render, screen, fireEvent, createEvent } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { MomentSwitcher, type MomentValue } from "./MomentSwitcher";

/**
 * #715 — the keyboard contract can only be proven against a STATEFUL parent.
 * MomentSwitcher is fully controlled: rendered with a frozen `value` and a
 * `vi.fn()` onChange, an arrow press would leave `value` unmoved, the roving
 * tabIndex unmoved, and every "it wrapped" assertion vacuously true against a
 * switcher still sitting on tab 1. This harness owns the state the real call
 * sites (TodayMoments / BottomNavigator) own, and reports each change so a
 * test can assert both the resulting DOM and the callback payload.
 */
function Harness({
  initial = "start",
  onChange,
  idPrefix,
}: {
  initial?: MomentValue;
  onChange?: (value: MomentValue) => void;
  idPrefix?: string;
}) {
  const [value, setValue] = useState<MomentValue>(initial);
  return (
    <MomentSwitcher
      value={value}
      idPrefix={idPrefix}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

const MOMENTS = ["start", "flow", "close"] as const;

/** Which tabs a sequential Tab press could land on (`tabIndex=0`). */
function tabStops(base = "moment-switcher"): MomentValue[] {
  return MOMENTS.filter(
    (moment) =>
      screen.getByTestId(`${base}-${moment}`).getAttribute("tabindex") === "0",
  );
}

/** Which tab is selected right now, per `aria-selected`. */
function selectedTab(base = "moment-switcher"): MomentValue[] {
  return MOMENTS.filter(
    (moment) =>
      screen.getByTestId(`${base}-${moment}`).getAttribute("aria-selected") ===
      "true",
  );
}

/** Which tab holds DOM focus right now. */
function focusedTab(base = "moment-switcher"): MomentValue | null {
  return (
    MOMENTS.find(
      (moment) =>
        screen.getByTestId(`${base}-${moment}`) === document.activeElement,
    ) ?? null
  );
}

/** Press a key on whatever tab currently has focus. */
function pressOnFocusedTab(key: string): void {
  fireEvent.keyDown(document.activeElement as Element, { key });
}

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
    const selectedHint = screen
      .getByTestId("moment-switcher-start")
      .querySelector("kbd")!;
    const unselectedHint = screen
      .getByTestId("moment-switcher-flow")
      .querySelector("kbd")!;

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

  // R3-C (#483 round 3): self-hosting Inter reopened the masthead's
  // right-cluster row-1 overflow (measured 18.41px over budget at desktop
  // widths — see TodayMoments.tsx's header comment), and the AreaSelector's
  // worst-case (long area name) claw-back needed more than the secondary
  // cluster alone could give up. This tab padding drops one step,
  // `px-3`->`px-2.5` — still visually dominant (only accent fill, still by
  // far the widest control) but a small, deliberate contributor to the
  // claw-back. Regression: a future padding bump here silently reopens the
  // 2-row wrap for realistic (not just the shortest demo) area names.
  it("tabs use the tightened px-2.5 padding, not the pre-Inter-reflow px-3 (round-3 regression)", () => {
    render(<MomentSwitcher value="start" onChange={vi.fn()} />);
    const tab = screen.getByTestId("moment-switcher-flow");
    expect(tab).toHaveClass("px-2.5");
    expect(tab.className).not.toMatch(/\bpx-3\b/);
  });

  // ===================================================================
  // #715 — the ARIA tabs keyboard contract.
  //
  // This control has declared `role="tablist"`/`role="tab"` since P2 while
  // behaving as three plain buttons: three sequential Tab stops, no arrow
  // keys, no Home/End, no roving tabIndex. Everything below pins the
  // interaction model that closes that gap, so it can never silently
  // regress back into a lying role. Interaction model: APG horizontal tabs,
  // automatic activation (selection follows focus), arrows WRAP at both
  // ends (#715 acceptance criterion 2).
  // ===================================================================

  it("declares the horizontal orientation its arrow keys actually implement", () => {
    render(<MomentSwitcher value="start" onChange={vi.fn()} />);
    expect(screen.getByRole("tablist")).toHaveAttribute(
      "aria-orientation",
      "horizontal",
    );
  });

  it("roving tabIndex: the selected tab is the switcher's ONLY Tab stop", () => {
    const { rerender } = render(
      <MomentSwitcher value="start" onChange={vi.fn()} />,
    );
    expect(tabStops()).toEqual(["start"]);
    expect(screen.getByTestId("moment-switcher-flow")).toHaveAttribute(
      "tabindex",
      "-1",
    );
    expect(screen.getByTestId("moment-switcher-close")).toHaveAttribute(
      "tabindex",
      "-1",
    );

    // The stop travels with the selection rather than multiplying.
    rerender(<MomentSwitcher value="flow" onChange={vi.fn()} />);
    expect(tabStops()).toEqual(["flow"]);
    rerender(<MomentSwitcher value="close" onChange={vi.fn()} />);
    expect(tabStops()).toEqual(["close"]);
  });

  it("ArrowRight moves and selects one tab at a time, wrapping Close -> Start", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    screen.getByTestId("moment-switcher-start").focus();
    expect(focusedTab()).toBe("start");

    pressOnFocusedTab("ArrowRight");
    expect(focusedTab()).toBe("flow");
    expect(selectedTab()).toEqual(["flow"]);
    expect(tabStops()).toEqual(["flow"]);

    pressOnFocusedTab("ArrowRight");
    expect(focusedTab()).toBe("close");
    expect(selectedTab()).toEqual(["close"]);

    // The wrap: Right from the last tab lands on the first, not nowhere.
    pressOnFocusedTab("ArrowRight");
    expect(focusedTab()).toBe("start");
    expect(selectedTab()).toEqual(["start"]);
    expect(tabStops()).toEqual(["start"]);

    expect(onChange.mock.calls.map(([value]) => value)).toEqual([
      "flow",
      "close",
      "start",
    ]);
  });

  it("ArrowLeft moves and selects backwards, wrapping Start -> Close", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    screen.getByTestId("moment-switcher-start").focus();

    // The wrap in the other direction, taken first from the first tab.
    pressOnFocusedTab("ArrowLeft");
    expect(focusedTab()).toBe("close");
    expect(selectedTab()).toEqual(["close"]);

    pressOnFocusedTab("ArrowLeft");
    expect(focusedTab()).toBe("flow");
    expect(selectedTab()).toEqual(["flow"]);

    expect(onChange.mock.calls.map(([value]) => value)).toEqual([
      "close",
      "flow",
    ]);
  });

  it("Home jumps to Start and End jumps to Close, from anywhere", () => {
    const onChange = vi.fn();
    render(<Harness initial="flow" onChange={onChange} />);

    screen.getByTestId("moment-switcher-flow").focus();

    pressOnFocusedTab("End");
    expect(focusedTab()).toBe("close");
    expect(selectedTab()).toEqual(["close"]);

    pressOnFocusedTab("Home");
    expect(focusedTab()).toBe("start");
    expect(selectedTab()).toEqual(["start"]);

    // Already at an end: the key is a no-move, not a wrap or a crash.
    pressOnFocusedTab("Home");
    expect(focusedTab()).toBe("start");
    expect(selectedTab()).toEqual(["start"]);

    expect(onChange.mock.calls.map(([value]) => value)).toEqual([
      "close",
      "start",
      "start",
    ]);
  });

  it("focus and selection never separate — the focused tab is always the selected one", () => {
    render(<Harness />);
    screen.getByTestId("moment-switcher-start").focus();

    for (const key of [
      "ArrowRight",
      "ArrowRight",
      "End",
      "Home",
      "ArrowLeft",
    ]) {
      pressOnFocusedTab(key);
      expect(selectedTab()).toEqual([focusedTab()]);
      expect(tabStops()).toEqual([focusedTab()]);
    }
  });

  it("swallows the default action for the four keys it owns, and only those", () => {
    render(<Harness />);
    const tab = screen.getByTestId("moment-switcher-start");
    tab.focus();

    // Home/End would otherwise scroll the page out from under the user;
    // the horizontal arrows would nudge a scrollable ancestor.
    for (const key of ["ArrowRight", "ArrowLeft", "Home", "End"]) {
      const event = createEvent.keyDown(document.activeElement as Element, {
        key,
      });
      fireEvent(document.activeElement as Element, event);
      expect(event.defaultPrevented, `${key} should be claimed`).toBe(true);
    }
  });

  it("leaves every other key alone — 1/2/3, Tab, and the vertical arrows pass through", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    screen.getByTestId("moment-switcher-start").focus();

    for (const key of ["1", "2", "3", "Tab", "ArrowUp", "ArrowDown", "Enter"]) {
      const event = createEvent.keyDown(document.activeElement as Element, {
        key,
      });
      fireEvent(document.activeElement as Element, event);
      expect(event.defaultPrevented, `${key} should pass through`).toBe(false);
    }
    // Nothing moved: the switcher never touched any of them.
    expect(onChange).not.toHaveBeenCalled();
    expect(selectedTab()).toEqual(["start"]);
    expect(focusedTab()).toBe("start");
  });

  it("ignores arrows held with a modifier — those combos belong to the app or the OS", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    screen.getByTestId("moment-switcher-start").focus();

    for (const modifier of ["metaKey", "ctrlKey", "altKey"] as const) {
      fireEvent.keyDown(document.activeElement as Element, {
        key: "ArrowRight",
        [modifier]: true,
      });
    }
    expect(onChange).not.toHaveBeenCalled();
    expect(selectedTab()).toEqual(["start"]);
  });

  it("clicking still selects, and hands the clicked tab the single Tab stop", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    fireEvent.click(screen.getByTestId("moment-switcher-close"));
    expect(onChange).toHaveBeenCalledWith("close");
    expect(selectedTab()).toEqual(["close"]);
    expect(tabStops()).toEqual(["close"]);
  });

  // #574: the mobile bottom navigator mounts a SECOND switcher, so both are
  // in the DOM at every viewport (CSS hides whichever the breakpoint does
  // not want). The contract has to hold per instance — #715 acceptance
  // criterion 6.
  it("the bottom-navigator instance carries the same contract on its own ids", () => {
    const onChange = vi.fn();
    render(<Harness idPrefix="bottom-nav" onChange={onChange} />);
    const base = "moment-switcher-bottom-nav";

    expect(tabStops(base)).toEqual(["start"]);
    screen.getByTestId(`${base}-start`).focus();

    pressOnFocusedTab("ArrowLeft");
    expect(focusedTab(base)).toBe("close");
    expect(selectedTab(base)).toEqual(["close"]);
    expect(tabStops(base)).toEqual(["close"]);
    expect(onChange).toHaveBeenCalledWith("close");
  });

  // PR #850 pinned the e2e axe scan's readiness gate to these exact
  // selectors (`helpers/pinnedSurfaces.ts` waits for
  // `moment-switcher[-bottom-nav]-<moment>` with `aria-selected="true"`
  // before scanning). Renaming a testid or moving `aria-selected` off these
  // buttons silently re-opens the flake class that PR closed.
  it("keeps the testids and aria-selected the e2e axe readiness gate waits on", () => {
    render(<MomentSwitcher value="flow" onChange={vi.fn()} />);
    expect(screen.getByTestId("moment-switcher-flow")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByTestId("moment-switcher-flow").tagName).toBe("BUTTON");
  });
});
