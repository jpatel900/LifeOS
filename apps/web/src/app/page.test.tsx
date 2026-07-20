import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

// #501: MomentsThemeShell reads next-themes' useTheme() to mirror
// resolvedTheme onto the shell's data-theme. Mock it per-test below so the
// shell tests don't need a real ThemeProvider.
const { useThemeMock } = vi.hoisted(() => ({ useThemeMock: vi.fn() }));
vi.mock("next-themes", () => ({
  useTheme: useThemeMock,
}));

describe("HomePage route gate (P7a — NEXT_PUBLIC_MOMENTS_HOME)", () => {
  const original = process.env.NEXT_PUBLIC_MOMENTS_HOME;

  beforeEach(() => {
    useThemeMock.mockReturnValue({ resolvedTheme: "dark" });
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_MOMENTS_HOME;
    } else {
      process.env.NEXT_PUBLIC_MOMENTS_HOME = original;
    }
  });

  it("renders the moments home by default (P7d go-live — flag unset)", () => {
    delete process.env.NEXT_PUBLIC_MOMENTS_HOME;
    render(<HomePage />);
    expect(screen.getByTestId("today-moments-home")).toBeTruthy();
    expect(screen.queryByTestId("cockpit-route")).toBeNull();
  });

  it('renders the stage cockpit today grid only when explicitly disabled ("false")', () => {
    process.env.NEXT_PUBLIC_MOMENTS_HOME = "false";
    render(<HomePage />);
    expect(screen.getByTestId("cockpit-route").textContent).toBe("today");
    expect(screen.queryByTestId("today-moments-home")).toBeNull();
  });
});

describe("MomentsHomeShell data-theme (#501 — follows next-themes, not cockpit's own store)", () => {
  const original = process.env.NEXT_PUBLIC_MOMENTS_HOME;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_MOMENTS_HOME;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_MOMENTS_HOME;
    } else {
      process.env.NEXT_PUBLIC_MOMENTS_HOME = original;
    }
  });

  it('sets data-theme="light" when the app theme resolves to light', () => {
    useThemeMock.mockReturnValue({ resolvedTheme: "light" });
    render(<HomePage />);
    expect(screen.getByTestId("moments-home-shell")).toHaveAttribute(
      "data-theme",
      "light",
    );
  });

  it("leaves data-theme unset when the app theme resolves to dark", () => {
    useThemeMock.mockReturnValue({ resolvedTheme: "dark" });
    render(<HomePage />);
    expect(screen.getByTestId("moments-home-shell")).not.toHaveAttribute(
      "data-theme",
    );
  });

  it("stays unset (dark) before next-themes has mounted/resolved a theme", () => {
    useThemeMock.mockReturnValue({ resolvedTheme: undefined });
    render(<HomePage />);
    expect(screen.getByTestId("moments-home-shell")).not.toHaveAttribute(
      "data-theme",
    );
  });
});
