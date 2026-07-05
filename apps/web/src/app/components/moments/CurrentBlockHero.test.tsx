import { render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CurrentBlockHero,
  formatMmSs,
  type CurrentBlockHeroBlock,
} from "./CurrentBlockHero";

function makeBlock(
  overrides: Partial<CurrentBlockHeroBlock> = {},
): CurrentBlockHeroBlock {
  return {
    title: "Deep work: LifeOS moments pass",
    areaLabel: "Work",
    ...overrides,
  };
}

describe("formatMmSs", () => {
  it("formats seconds as mm:ss, zero-padded", () => {
    expect(formatMmSs(65)).toBe("1:05");
    expect(formatMmSs(5)).toBe("0:05");
    expect(formatMmSs(600)).toBe("10:00");
  });

  it("floors negative/fractional input at 0", () => {
    expect(formatMmSs(-5)).toBe("0:00");
    expect(formatMmSs(1.9)).toBe("0:01");
  });
});

describe("CurrentBlockHero", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders exactly one primary (Done) action", () => {
    render(
      <CurrentBlockHero
        block={makeBlock()}
        remaining={1500}
        total={1500}
        running
        timeDisplay="countdown"
        onDone={vi.fn()}
        onPause={vi.fn()}
        onExtend={vi.fn()}
        onToggleTime={vi.fn()}
      />,
    );

    const done = screen.getByTestId("current-block-hero-done");
    const pause = screen.getByTestId("current-block-hero-pause");
    const extend = screen.getByTestId("current-block-hero-extend");
    expect(done).toBeInTheDocument();
    expect(done.className).not.toEqual(pause.className);
    expect(done.className).not.toEqual(extend.className);
  });

  it("shows countdown formatted as mm:ss in countdown mode", () => {
    render(
      <CurrentBlockHero
        block={makeBlock()}
        remaining={125}
        total={1500}
        running
        timeDisplay="countdown"
        onDone={vi.fn()}
        onPause={vi.fn()}
        onExtend={vi.fn()}
        onToggleTime={vi.fn()}
      />,
    );

    expect(screen.getByTestId("current-block-hero-time")).toHaveTextContent(
      "2:05",
    );
  });

  it("enters warn state at or under the 10-minute threshold", () => {
    const { rerender } = render(
      <CurrentBlockHero
        block={makeBlock()}
        remaining={601}
        total={1500}
        running
        timeDisplay="countdown"
        onDone={vi.fn()}
        onPause={vi.fn()}
        onExtend={vi.fn()}
        onToggleTime={vi.fn()}
      />,
    );
    expect(
      screen.getByTestId("current-block-hero-time").className,
    ).not.toContain("state-warn");

    rerender(
      <CurrentBlockHero
        block={makeBlock()}
        remaining={600}
        total={1500}
        running
        timeDisplay="countdown"
        onDone={vi.fn()}
        onPause={vi.fn()}
        onExtend={vi.fn()}
        onToggleTime={vi.fn()}
      />,
    );
    expect(screen.getByTestId("current-block-hero-time").className).toContain(
      "state-warn",
    );
  });

  it("shows a wall-clock end time in clock mode", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-05T15:00:00.000Z"));

    render(
      <CurrentBlockHero
        block={makeBlock()}
        remaining={600}
        total={1500}
        running
        timeDisplay="clock"
        onDone={vi.fn()}
        onPause={vi.fn()}
        onExtend={vi.fn()}
        onToggleTime={vi.fn()}
      />,
    );

    expect(screen.getByTestId("current-block-hero-time")).toHaveTextContent(
      "until",
    );
  });

  it("fires onDone, onPause, onExtend(25), and onToggleTime", () => {
    const onDone = vi.fn();
    const onPause = vi.fn();
    const onExtend = vi.fn();
    const onToggleTime = vi.fn();

    render(
      <CurrentBlockHero
        block={makeBlock()}
        remaining={1500}
        total={1500}
        running
        timeDisplay="countdown"
        onDone={onDone}
        onPause={onPause}
        onExtend={onExtend}
        onToggleTime={onToggleTime}
      />,
    );

    fireEvent.click(screen.getByTestId("current-block-hero-done"));
    fireEvent.click(screen.getByTestId("current-block-hero-pause"));
    fireEvent.click(screen.getByTestId("current-block-hero-extend"));
    fireEvent.click(screen.getByTestId("current-block-hero-time"));

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(onExtend).toHaveBeenCalledWith(25);
    expect(onToggleTime).toHaveBeenCalledTimes(1);
  });

  it("shows Resume when not running", () => {
    render(
      <CurrentBlockHero
        block={makeBlock()}
        remaining={1500}
        total={1500}
        running={false}
        timeDisplay="countdown"
        onDone={vi.fn()}
        onPause={vi.fn()}
        onExtend={vi.fn()}
        onToggleTime={vi.fn()}
      />,
    );

    expect(screen.getByTestId("current-block-hero-pause")).toHaveTextContent(
      "Resume",
    );
  });
});
