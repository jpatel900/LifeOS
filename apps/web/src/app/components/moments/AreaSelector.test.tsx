import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AreaSelector } from "./AreaSelector";

const AREAS = [
  { id: "area-1", name: "Product", color: "#6d8bff" },
  { id: "area-2", name: "Finance", color: "#46c08a" },
];

describe("AreaSelector", () => {
  it("renders the selected area's name, swatch, and a real 'A' kbd hint", () => {
    render(
      <AreaSelector areas={AREAS} value="area-1" onChange={vi.fn()} />,
    );

    const trigger = screen.getByTestId("today-moments-area-switcher");
    expect(trigger).toHaveTextContent("Product");
    expect(trigger).toHaveTextContent("A");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("aria-label", "Area");
  });

  it("shows a neutral (uncolored) swatch for 'All areas', not a fabricated hue", () => {
    render(<AreaSelector areas={AREAS} value={null} onChange={vi.fn()} />);

    const trigger = screen.getByTestId("today-moments-area-switcher");
    expect(trigger).toHaveTextContent("All areas");
    // Colored areas render an inline `background: <hex>` swatch; "All
    // areas" has no color of its own, so its dot is outline-only — a real
    // `--muted-foreground` token border, never a fabricated background hue.
    const swatch = trigger.querySelector("span[aria-hidden='true']");
    expect(swatch).toHaveClass("border-[1.5px]");
    expect(swatch).toHaveStyle({ borderColor: "var(--muted-foreground)" });
    expect(swatch?.getAttribute("style") ?? "").not.toContain("background");
  });

  it("opens the listbox on click, listing 'All areas' plus every area, with the current value marked selected", () => {
    render(
      <AreaSelector areas={AREAS} value="area-2" onChange={vi.fn()} />,
    );

    fireEvent.click(screen.getByTestId("today-moments-area-switcher"));

    const listbox = screen.getByTestId("area-selector-listbox");
    expect(listbox).toBeInTheDocument();
    expect(screen.getByTestId("area-selector-option-all")).toHaveTextContent(
      "All areas",
    );
    expect(
      screen.getByTestId("area-selector-option-area-1"),
    ).toHaveTextContent("Product");
    expect(
      screen.getByTestId("area-selector-option-area-2"),
    ).toHaveAttribute("aria-selected", "true");
  });

  it("selecting an option calls onChange with that area's id and closes the popup", () => {
    const onChange = vi.fn();
    render(<AreaSelector areas={AREAS} value={null} onChange={onChange} />);

    fireEvent.click(screen.getByTestId("today-moments-area-switcher"));
    fireEvent.click(screen.getByTestId("area-selector-option-area-2"));

    expect(onChange).toHaveBeenCalledWith("area-2");
    expect(screen.queryByTestId("area-selector-listbox")).not.toBeInTheDocument();
  });

  it("selecting an option survives the real mousedown-then-click sequence a real mouse click produces (regression: mousedown on a non-focusable option used to blur the trigger and close/unmount the popup before the click landed, so nothing was ever selected)", () => {
    const onChange = vi.fn();
    render(<AreaSelector areas={AREAS} value={null} onChange={onChange} />);

    const trigger = screen.getByTestId("today-moments-area-switcher");
    trigger.focus();
    fireEvent.click(trigger);
    const option = screen.getByTestId("area-selector-option-area-2");

    // A real mouse click is mousedown -> (browser may shift focus here) ->
    // mouseup -> click. jsdom doesn't auto-blur on mousedown to a
    // non-focusable element the way a real browser does, so this alone
    // wouldn't have caught the bug — the point of this test is the fix's
    // own mechanism: mousedown on the listbox must call preventDefault,
    // which this asserts directly, plus the end-to-end outcome.
    const mouseDownEvent = fireEvent.mouseDown(option);
    expect(mouseDownEvent).toBe(false); // false = preventDefault() was called
    fireEvent.click(option);

    expect(onChange).toHaveBeenCalledWith("area-2");
    expect(screen.queryByTestId("area-selector-listbox")).not.toBeInTheDocument();
  });

  it("selecting 'All areas' calls onChange with null", () => {
    const onChange = vi.fn();
    render(<AreaSelector areas={AREAS} value="area-1" onChange={onChange} />);

    fireEvent.click(screen.getByTestId("today-moments-area-switcher"));
    fireEvent.click(screen.getByTestId("area-selector-option-all"));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("keyboard: ArrowDown opens the list, Enter selects the highlighted option and closes", () => {
    const onChange = vi.fn();
    render(<AreaSelector areas={AREAS} value="area-1" onChange={onChange} />);

    const trigger = screen.getByTestId("today-moments-area-switcher");
    trigger.focus();

    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(screen.getByTestId("area-selector-listbox")).toBeInTheDocument();

    // Selected is area-1 (index 1); ArrowDown from there highlights area-2 (index 2).
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith("area-2");
    expect(screen.queryByTestId("area-selector-listbox")).not.toBeInTheDocument();
  });

  it("keyboard: Escape closes without changing the selection", () => {
    const onChange = vi.fn();
    render(<AreaSelector areas={AREAS} value="area-1" onChange={onChange} />);

    const trigger = screen.getByTestId("today-moments-area-switcher");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(screen.getByTestId("area-selector-listbox")).toBeInTheDocument();

    fireEvent.keyDown(trigger, { key: "Escape" });

    expect(screen.queryByTestId("area-selector-listbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("closes when a click lands outside the widget", () => {
    render(
      <div>
        <AreaSelector areas={AREAS} value="area-1" onChange={vi.fn()} />
        <button type="button" data-testid="outside">
          Outside
        </button>
      </div>,
    );

    fireEvent.click(screen.getByTestId("today-moments-area-switcher"));
    expect(screen.getByTestId("area-selector-listbox")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(screen.queryByTestId("area-selector-listbox")).not.toBeInTheDocument();
  });

  it("the global 'A' key cycles All areas -> area-1 -> area-2 -> All areas", () => {
    const onChange = vi.fn();
    render(<AreaSelector areas={AREAS} value={null} onChange={onChange} />);

    fireEvent.keyDown(window, { key: "a" });
    expect(onChange).toHaveBeenLastCalledWith("area-1");
  });

  it("cycling wraps from the last area back to 'All areas'", () => {
    const onChange = vi.fn();
    render(<AreaSelector areas={AREAS} value="area-2" onChange={onChange} />);

    fireEvent.keyDown(window, { key: "a" });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("does not cycle on 'A' when shortcutEnabled is false (an overlay is open)", () => {
    const onChange = vi.fn();
    render(
      <AreaSelector
        areas={AREAS}
        value={null}
        onChange={onChange}
        shortcutEnabled={false}
      />,
    );

    fireEvent.keyDown(window, { key: "a" });
    expect(onChange).not.toHaveBeenCalled();
  });

  // D-10 R2 (#483 round 2, blocker #4): real focus-visible ring using the
  // app's own --ring token, and upgraded to HIT_TARGET_MIN so a very short
  // area name can never shrink the trigger under the 44px hit-target floor
  // once the kbd hint drops out of the mobile layout.
  it("the trigger carries the app's focus-visible ring token and a min-width floor", () => {
    render(<AreaSelector areas={AREAS} value="area-1" onChange={vi.fn()} />);
    const trigger = screen.getByTestId("today-moments-area-switcher");
    expect(trigger).toHaveClass("outline-none");
    expect(trigger).toHaveClass("focus-visible:ring-2");
    expect(trigger).toHaveClass("focus-visible:ring-ring");
    expect(trigger).toHaveClass("focus-visible:ring-offset-2");
    expect(trigger).toHaveClass("min-w-[44px]");
  });

  // D-10 R2 (#483 round 2, blocker #6): the "A" kbd hint now shares
  // kbdChip.ts's single treatment — hidden below `sm` (no keyboard on
  // touch) and hover/focus-revealed above it, not permanently stamped.
  it("the 'A' kbd hint is hidden below sm and only reveals on hover/focus of the trigger", () => {
    render(<AreaSelector areas={AREAS} value="area-1" onChange={vi.fn()} />);
    const hint = screen
      .getByTestId("today-moments-area-switcher")
      .querySelector("kbd")!;
    expect(hint).toHaveClass("hidden");
    expect(hint).toHaveClass("opacity-0");
    expect(hint).toHaveClass("sm:group-hover:opacity-100");
  });

  it("does not cycle on 'A' while a button elsewhere has focus (typing-target guard, matches useMomentKeyboard's convention)", () => {
    const onChange = vi.fn();
    render(
      <div>
        <AreaSelector areas={AREAS} value={null} onChange={onChange} />
        <button type="button" data-testid="other-button">
          Other
        </button>
      </div>,
    );

    const other = screen.getByTestId("other-button");
    other.focus();
    // Dispatched on the focused button itself — keydown bubbles to the
    // window listener with `event.target` correctly set to `other`,
    // exercising the real bubble path instead of forcing `target`.
    fireEvent.keyDown(other, { key: "a" });

    expect(onChange).not.toHaveBeenCalled();
  });

  // R3-C (#483 round 3): self-hosting Inter reopened the masthead's
  // right-cluster row-1 overflow (measured 18.41px over budget at desktop
  // widths — see TodayMoments.tsx's header comment). Part of the claw-back
  // is this trigger dropping one padding step (`px-3`->`px-2.5`).
  // Regression: a future padding bump here silently reopens the 2-row wrap.
  it("the trigger uses the tightened px-2.5 padding, not the pre-Inter-reflow px-3 (round-3 regression)", () => {
    render(<AreaSelector areas={AREAS} value="area-1" onChange={vi.fn()} />);
    const trigger = screen.getByTestId("today-moments-area-switcher");
    expect(trigger).toHaveClass("px-2.5");
    expect(trigger.className).not.toMatch(/\bpx-3\b/);
  });

  // R3-C (#483 round 3): a padding trim alone wasn't enough — an initial
  // fix (measured only against the demo's shortest area name, "Main Job")
  // still wrapped the masthead to 2 rows for real, longer area names
  // ("Volunteer Work", "Side Project" — both in this same demo data).
  // The label's original `max-w-[9rem]` (144px) was too generous to ever
  // engage truncation for realistic names, so the AreaSelector's rendered
  // width scaled with the selected area's name length with no hard ceiling.
  // Fixed with a real bound: `sm:max-w-[5rem]` (80px at `sm`+, empirically
  // verified in-browser to keep the masthead single-row for every demo
  // area, including the two long ones, with margin to spare) plus
  // `min-w-0` — required because a `truncate` span nested inside an
  // `inline-flex` button won't actually shrink below its own content's
  // intrinsic width without it (the classic flexbox `min-width: auto`
  // trap; `max-w` alone is silently ignored in that position).
  //
  // The cap is `sm:`-scoped, NOT applied below `sm`: mobile's AreaSelector
  // sits in its own dedicated 2-control row (with MastheadThemeToggle)
  // with no comparable space pressure, so the base `max-w-[9rem]` (this
  // component's original, pre-R3 value) still applies there — an earlier
  // draft of this fix applied the tight cap unconditionally and truncated
  // long area names on mobile with a quarter of the 390px viewport still
  // empty to the right of the control, reopening the exact "only verified
  // the short name" gap this packet exists to close, just on a different
  // viewport.
  //
  // Regression: the desktop cap must stay `sm:`-scoped (never bare
  // `max-w-[5rem]`, which would re-truncate mobile), the base must stay
  // `max-w-[9rem]`, and `min-w-0` must stay paired with it.
  it("the label span truncates at max-w-[9rem] on mobile and sm:max-w-[5rem] at sm+, both with min-w-0 (round-3 regression)", () => {
    render(
      <AreaSelector
        areas={[{ id: "area-1", name: "Volunteer Work", color: "#6d8bff" }]}
        value="area-1"
        onChange={vi.fn()}
      />,
    );
    const trigger = screen.getByTestId("today-moments-area-switcher");
    const label = trigger.querySelector("span:not([aria-hidden])")!;
    expect(label).toHaveClass("max-w-[9rem]");
    expect(label).toHaveClass("sm:max-w-[5rem]");
    expect(label).toHaveClass("min-w-0");
    expect(label).toHaveClass("truncate");
    expect(label.className).not.toMatch(/(?<!sm:)max-w-\[5rem\]\b/);
  });
});
