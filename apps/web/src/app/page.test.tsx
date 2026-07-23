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
  TodayMoments: ({ deepLink }: { deepLink?: unknown }) => (
    <div
      data-testid="today-moments-home"
      data-deeplink={JSON.stringify(deepLink ?? null)}
    />
  ),
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

  it("renders the moments home by default (P7d go-live — flag unset)", async () => {
    delete process.env.NEXT_PUBLIC_MOMENTS_HOME;
    render(await HomePage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByTestId("today-moments-home")).toBeTruthy();
    expect(screen.queryByTestId("cockpit-route")).toBeNull();
  });

  it('renders the stage cockpit today grid only when explicitly disabled ("false")', async () => {
    process.env.NEXT_PUBLIC_MOMENTS_HOME = "false";
    render(await HomePage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByTestId("cockpit-route").textContent).toBe("today");
    expect(screen.queryByTestId("today-moments-home")).toBeNull();
  });

  // #687: the demoted stage routes redirect here carrying their target as
  // query params; the moments home must translate them into a deepLink so the
  // matching sheet/moment/overlay opens on arrival.
  it("passes the triage sheet deep-link from ?sheet=triage", async () => {
    delete process.env.NEXT_PUBLIC_MOMENTS_HOME;
    render(
      await HomePage({ searchParams: Promise.resolve({ sheet: "triage" }) }),
    );
    expect(
      screen.getByTestId("today-moments-home").getAttribute("data-deeplink"),
    ).toBe(JSON.stringify({ sheet: "triage" }));
  });

  it("passes the flow moment deep-link from ?moment=flow", async () => {
    delete process.env.NEXT_PUBLIC_MOMENTS_HOME;
    render(
      await HomePage({ searchParams: Promise.resolve({ moment: "flow" }) }),
    );
    expect(
      screen.getByTestId("today-moments-home").getAttribute("data-deeplink"),
    ).toBe(JSON.stringify({ moment: "flow" }));
  });

  it("passes the capture overlay deep-link from ?capture=1", async () => {
    delete process.env.NEXT_PUBLIC_MOMENTS_HOME;
    render(await HomePage({ searchParams: Promise.resolve({ capture: "1" }) }));
    expect(
      screen.getByTestId("today-moments-home").getAttribute("data-deeplink"),
    ).toBe(JSON.stringify({ overlay: "capture" }));
  });

  it("passes a null deep-link for a plain home visit (no params)", async () => {
    delete process.env.NEXT_PUBLIC_MOMENTS_HOME;
    render(await HomePage({ searchParams: Promise.resolve({}) }));
    expect(
      screen.getByTestId("today-moments-home").getAttribute("data-deeplink"),
    ).toBe("null");
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

  it('sets data-theme="light" when the app theme resolves to light', async () => {
    useThemeMock.mockReturnValue({ resolvedTheme: "light" });
    render(await HomePage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByTestId("moments-home-shell")).toHaveAttribute(
      "data-theme",
      "light",
    );
  });

  it("leaves data-theme unset when the app theme resolves to dark", async () => {
    useThemeMock.mockReturnValue({ resolvedTheme: "dark" });
    render(await HomePage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByTestId("moments-home-shell")).not.toHaveAttribute(
      "data-theme",
    );
  });

  it("stays unset (dark) before next-themes has mounted/resolved a theme", async () => {
    useThemeMock.mockReturnValue({ resolvedTheme: undefined });
    render(await HomePage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByTestId("moments-home-shell")).not.toHaveAttribute(
      "data-theme",
    );
  });
});
