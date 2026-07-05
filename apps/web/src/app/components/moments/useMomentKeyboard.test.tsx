import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  useMomentKeyboard,
  type MomentKeyboardHandlers,
} from "./useMomentKeyboard";

function Harness(props: MomentKeyboardHandlers) {
  useMomentKeyboard(props);
  return null;
}

function fireKey(init: KeyboardEventInit, target: EventTarget = window) {
  target.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, ...init }),
  );
}

function makeHandlers(): MomentKeyboardHandlers {
  return {
    onSwitchMoment: vi.fn(),
    onCapture: vi.fn(),
    onPalette: vi.fn(),
    onPrimary: vi.fn(),
    onEscape: vi.fn(),
  };
}

describe("useMomentKeyboard", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("maps 1/2/3 to onSwitchMoment(start/flow/close)", () => {
    const handlers = makeHandlers();
    render(<Harness {...handlers} />);

    fireKey({ key: "1" });
    fireKey({ key: "2" });
    fireKey({ key: "3" });

    expect(handlers.onSwitchMoment).toHaveBeenNthCalledWith(1, "start");
    expect(handlers.onSwitchMoment).toHaveBeenNthCalledWith(2, "flow");
    expect(handlers.onSwitchMoment).toHaveBeenNthCalledWith(3, "close");
  });

  it("maps c/C to onCapture", () => {
    const handlers = makeHandlers();
    render(<Harness {...handlers} />);

    fireKey({ key: "c" });
    fireKey({ key: "C" });

    expect(handlers.onCapture).toHaveBeenCalledTimes(2);
  });

  it("maps Cmd/Ctrl+K to onPalette and prevents default", () => {
    const handlers = makeHandlers();
    render(<Harness {...handlers} />);

    const event = new KeyboardEvent("keydown", {
      key: "k",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    const preventSpy = vi.spyOn(event, "preventDefault");
    window.dispatchEvent(event);

    expect(handlers.onPalette).toHaveBeenCalledTimes(1);
    expect(preventSpy).toHaveBeenCalled();

    fireKey({ key: "k", metaKey: true });
    expect(handlers.onPalette).toHaveBeenCalledTimes(2);
  });

  it("maps Enter to onPrimary and Escape to onEscape", () => {
    const handlers = makeHandlers();
    render(<Harness {...handlers} />);

    fireKey({ key: "Enter" });
    fireKey({ key: "Escape" });

    expect(handlers.onPrimary).toHaveBeenCalledTimes(1);
    expect(handlers.onEscape).toHaveBeenCalledTimes(1);
  });

  it("suppresses every mapping except Escape/Enter when an input is focused, including the palette combo", () => {
    const handlers = makeHandlers();
    render(<Harness {...handlers} />);

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    fireKey({ key: "1" }, input);
    fireKey({ key: "c" }, input);
    fireKey({ key: "k", ctrlKey: true }, input);

    expect(handlers.onSwitchMoment).not.toHaveBeenCalled();
    expect(handlers.onCapture).not.toHaveBeenCalled();
    expect(handlers.onPalette).not.toHaveBeenCalled();

    fireKey({ key: "Enter" }, input);
    fireKey({ key: "Escape" }, input);

    expect(handlers.onPrimary).toHaveBeenCalledTimes(1);
    expect(handlers.onEscape).toHaveBeenCalledTimes(1);
  });

  it("passes through other modifier combos untouched (e.g. Ctrl+C is not intercepted)", () => {
    const handlers = makeHandlers();
    render(<Harness {...handlers} />);

    fireKey({ key: "c", ctrlKey: true });
    fireKey({ key: "1", metaKey: true });
    fireKey({ key: "1", altKey: true });

    expect(handlers.onCapture).not.toHaveBeenCalled();
    expect(handlers.onSwitchMoment).not.toHaveBeenCalled();
  });

  it("is inert when enabled is false", () => {
    const handlers = makeHandlers();
    render(<Harness {...handlers} enabled={false} />);

    fireKey({ key: "1" });
    fireKey({ key: "Escape" });

    expect(handlers.onSwitchMoment).not.toHaveBeenCalled();
    expect(handlers.onEscape).not.toHaveBeenCalled();
  });

  it("removes its listener on unmount", () => {
    const handlers = makeHandlers();
    const { unmount } = render(<Harness {...handlers} />);
    unmount();

    fireKey({ key: "1" });

    expect(handlers.onSwitchMoment).not.toHaveBeenCalled();
  });
});
