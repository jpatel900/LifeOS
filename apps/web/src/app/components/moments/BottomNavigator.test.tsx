import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SAVED_ON_THIS_DEVICE_SHORT } from "@/lib/statusVocabulary";
import { BottomNavigator } from "./BottomNavigator";

describe("BottomNavigator", () => {
  it("renders a moment switcher (distinct testids from the header instance) and a settings link", () => {
    render(
      <BottomNavigator
        value="flow"
        onChange={vi.fn()}
        onCapture={vi.fn()}
        onOpenPalette={vi.fn()}
      />,
    );

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
    render(
      <BottomNavigator
        value="start"
        onChange={onChange}
        onCapture={vi.fn()}
        onOpenPalette={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("moment-switcher-bottom-nav-close"));
    expect(onChange).toHaveBeenCalledWith("close");
  });

  it("is hidden at sm and up (sm:hidden) so it only ever renders below 640px", () => {
    render(
      <BottomNavigator
        value="start"
        onChange={vi.fn()}
        onCapture={vi.fn()}
        onOpenPalette={vi.fn()}
      />,
    );
    expect(screen.getByTestId("bottom-navigator")).toHaveClass("sm:hidden");
  });

  it("is fixed to the viewport bottom, above the capture pill's z-index band", () => {
    render(
      <BottomNavigator
        value="start"
        onChange={vi.fn()}
        onCapture={vi.fn()}
        onOpenPalette={vi.fn()}
      />,
    );
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
        onCapture={vi.fn()}
        onOpenPalette={vi.fn()}
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
    render(
      <BottomNavigator
        value="start"
        onChange={vi.fn()}
        onCapture={vi.fn()}
        onOpenPalette={vi.fn()}
      />,
    );
    const link = screen.getByTestId("bottom-navigator-settings-link");
    expect(link).toHaveClass("min-h-[44px]");
    expect(link).toHaveClass("touch-manipulation");
  });

  // #593 — the mobile capture action lives in this band (one bottom-band
  // action model; the floating pill is desktop-only).
  describe("capture action (#593)", () => {
    it("renders a 44px-floor capture button that fires onCapture", () => {
      const onCapture = vi.fn();
      render(
        <BottomNavigator
          value="start"
          onChange={vi.fn()}
          onCapture={onCapture}
          onOpenPalette={vi.fn()}
        />,
      );
      const button = screen.getByTestId("bottom-navigator-capture");
      expect(button).toHaveClass("min-h-[44px]");
      fireEvent.click(button);
      expect(onCapture).toHaveBeenCalledTimes(1);
    });

    it("disables while capture is resolving, mirroring the desktop pill", () => {
      const onCapture = vi.fn();
      render(
        <BottomNavigator
          value="start"
          onChange={vi.fn()}
          onCapture={onCapture}
          onOpenPalette={vi.fn()}
          captureDisabled
        />,
      );
      const button = screen.getByTestId("bottom-navigator-capture");
      expect(button).toBeDisabled();
      expect(button).toHaveTextContent("Resolving…");
      fireEvent.click(button);
      expect(onCapture).not.toHaveBeenCalled();
    });

    it("surfaces the offline queue badge with a non-color signal", () => {
      render(
        <BottomNavigator
          value="start"
          onChange={vi.fn()}
          onCapture={vi.fn()}
          onOpenPalette={vi.fn()}
          unsyncedCount={2}
        />,
      );
      const badge = screen.getByTestId("bottom-navigator-capture-badge");
      expect(badge).toHaveTextContent("2");
      expect(badge).toHaveTextContent(`captures ${SAVED_ON_THIS_DEVICE_SHORT}`);
    });
  });

  // C2-S6 (#687), Criterion 3: the palette's touch trigger. Before this, the
  // palette's only triggers were keydown and `?palette=1` — no tap path
  // existed below `sm`.
  describe("palette trigger (#687 C2-S6, Criterion 3)", () => {
    it("renders a 44px-floor, plain-language 'More' trigger that fires onOpenPalette", () => {
      const onOpenPalette = vi.fn();
      render(
        <BottomNavigator
          value="start"
          onChange={vi.fn()}
          onCapture={vi.fn()}
          onOpenPalette={onOpenPalette}
        />,
      );
      const trigger = screen.getByTestId("bottom-navigator-more");
      expect(trigger).toHaveClass("min-h-[44px]");
      expect(trigger).toHaveAccessibleName("More");
      fireEvent.click(trigger);
      expect(onOpenPalette).toHaveBeenCalledTimes(1);
    });
  });
});
