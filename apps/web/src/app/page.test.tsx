import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import HomePage from "./page";

// P7a tests the ROUTING decision in page.tsx — which home `/` renders — not the
// full component trees (those are covered by their own suites). Mocking both
// children keeps this deterministic and free of provider setup.
vi.mock("./components/CockpitRoute", () => ({
  CockpitRoute: ({ stage }: { stage: string }) => (
    <div data-testid="cockpit-route">{stage}</div>
  ),
}));
vi.mock("./components/moments/TodayMoments", () => ({
  TodayMoments: () => <div data-testid="today-moments-home" />,
}));

describe("HomePage route gate (P7a — NEXT_PUBLIC_MOMENTS_HOME)", () => {
  const original = process.env.NEXT_PUBLIC_MOMENTS_HOME;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_MOMENTS_HOME;
    } else {
      process.env.NEXT_PUBLIC_MOMENTS_HOME = original;
    }
  });

  it("renders the stage cockpit today grid when the flag is off (default)", () => {
    delete process.env.NEXT_PUBLIC_MOMENTS_HOME;
    render(<HomePage />);
    expect(screen.getByTestId("cockpit-route").textContent).toBe("today");
    expect(screen.queryByTestId("today-moments-home")).toBeNull();
  });

  it("renders the moments home when the flag is on", () => {
    process.env.NEXT_PUBLIC_MOMENTS_HOME = "true";
    render(<HomePage />);
    expect(screen.getByTestId("today-moments-home")).toBeTruthy();
    expect(screen.queryByTestId("cockpit-route")).toBeNull();
  });
});
