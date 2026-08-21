import { render } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  useMomentKeyboard,
  type MomentKeyboardHandlers,
} from "./useMomentKeyboard";

function Harness(props: MomentKeyboardHandlers) {
  useMomentKeyboard(props);
  return null;
}

function ColdMountHarness(props: MomentKeyboardHandlers) {
  useLayoutEffect(() => {
    fireKey({ key: "c" });
  }, []);

  return <Harness {...props} />;
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

  it("receives capture during cold mount before passive effects run", () => {
    const handlers = makeHandlers();
    render(<ColdMountHarness {...handlers} />);

    expect(handlers.onCapture).toHaveBeenCalledTimes(1);
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

  it("suppresses every mapping except Escape when an input is focused, including Enter and the palette combo", () => {
    const handlers = makeHandlers();
    render(<Harness {...handlers} />);

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    fireKey({ key: "1" }, input);
    fireKey({ key: "c" }, input);
    fireKey({ key: "k", ctrlKey: true }, input);
    fireKey({ key: "Enter" }, input);
    fireKey({ key: "Escape" }, input);

    expect(handlers.onSwitchMoment).not.toHaveBeenCalled();
    expect(handlers.onCapture).not.toHaveBeenCalled();
    expect(handlers.onPalette).not.toHaveBeenCalled();
    expect(handlers.onPrimary).not.toHaveBeenCalled();
    expect(handlers.onEscape).toHaveBeenCalledTimes(1);
  });

  it("does not map Enter from a focused button or link to the global primary action", () => {
    const handlers = makeHandlers();
    render(<Harness {...handlers} />);

    const button = document.createElement("button");
    const link = document.createElement("a");
    link.href = "#stage-content";
    document.body.append(button, link);

    fireKey({ key: "Enter" }, button);
    fireKey({ key: "Enter" }, link);

    expect(handlers.onPrimary).not.toHaveBeenCalled();
  });

  // #687 round-6 judge (WORST DEFECT): every advertised shortcut died the
  // moment focus landed on ANY control (theme toggle, clock toggle, moment
  // tab, pipeline stage...) — clicking a button focuses it, the keydown
  // listener sees that button as `event.target`, and the old `isTypingTarget`
  // folded BUTTON/A into the same "typing, block everything" bucket as
  // INPUT/TEXTAREA. A button is not a text-entry context — Enter/Space
  // activate it natively (the test above), but 1/2/3, C and Ctrl+K must keep
  // working. A keyboard-only user was locked out after their very first Tab.
  // Red-first: this test fails on the pre-fix isTypingTarget (which returns
  // true for tag === "BUTTON"/"A"), confirmed by temporarily reverting
  // useMomentKeyboard.ts's isTypingTarget to include BUTTON/A again.
  it("keeps 1/2/3, C and Ctrl+K working when a button or link has focus (not a typing context)", () => {
    const handlers = makeHandlers();
    render(<Harness {...handlers} />);

    const button = document.createElement("button");
    const link = document.createElement("a");
    link.href = "#stage-content";
    document.body.append(button, link);

    fireKey({ key: "1" }, button);
    fireKey({ key: "c" }, button);
    fireKey({ key: "k", ctrlKey: true }, button);
    expect(handlers.onSwitchMoment).toHaveBeenCalledWith("start");
    expect(handlers.onCapture).toHaveBeenCalledTimes(1);
    expect(handlers.onPalette).toHaveBeenCalledTimes(1);

    fireKey({ key: "2" }, link);
    fireKey({ key: "c" }, link);
    expect(handlers.onSwitchMoment).toHaveBeenCalledWith("flow");
    expect(handlers.onCapture).toHaveBeenCalledTimes(2);
  });

  // Same defect, Escape half: the report explicitly names "even after Escape
  // closes the resulting sheet" as still broken for every OTHER shortcut —
  // Escape itself already worked from a button/link (it falls through
  // isTypingTarget either way), this pins that it keeps working post-fix too.
  it("Escape still works when a button or link has focus", () => {
    const handlers = makeHandlers();
    render(<Harness {...handlers} />);

    const button = document.createElement("button");
    document.body.appendChild(button);

    fireKey({ key: "Escape" }, button);
    expect(handlers.onEscape).toHaveBeenCalledTimes(1);
  });

  // The capture overlay's own composer is a real <textarea> (CaptureCore.tsx)
  // — unlike BUTTON/A, typing there must still be swallowed as text entry, or
  // "C" would re-fire onCapture (or worse) while the user is mid-sentence.
  it("still suppresses shortcuts (except Escape) while typing in a textarea", () => {
    const handlers = makeHandlers();
    render(<Harness {...handlers} />);

    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    textarea.focus();

    fireKey({ key: "c" }, textarea);
    fireKey({ key: "1" }, textarea);
    fireKey({ key: "k", ctrlKey: true }, textarea);
    fireKey({ key: "Escape" }, textarea);

    expect(handlers.onCapture).not.toHaveBeenCalled();
    expect(handlers.onSwitchMoment).not.toHaveBeenCalled();
    expect(handlers.onPalette).not.toHaveBeenCalled();
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
