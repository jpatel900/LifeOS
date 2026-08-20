import { render, screen } from "@testing-library/react";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "../app/page";
import CapturePage from "../app/capture/page";
import CalendarPage from "../app/calendar/page";
import ExecutePage from "../app/execute/page";
import HealthPage from "../app/health/page";
import ReviewPage from "../app/review/page";
import AreasSettingsPage from "../app/settings/areas/page";
import AreasOverviewPage from "../app/areas/page";
import TriagePage from "../app/triage/page";
import { AppShell } from "../app/components/AppShell";
import RootLayout from "../app/layout";

const navigationMock = vi.hoisted(() => ({
  pathname: "/capture",
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationMock.pathname,
  useRouter: () => ({ push: navigationMock.push }),
}));

function renderThroughAppShell(children: ReactNode, pathname = "/capture") {
  navigationMock.pathname = pathname;
  return render(<AppShell>{children}</AppShell>);
}

function expectElement(value: unknown) {
  expect(isValidElement(value)).toBe(true);
  return value as ReactElement<{ children?: ReactNode }>;
}

describe("handoff cockpit route provider wiring", () => {
  // #687: the demoted stage pages are redirect shims when the moments home is
  // live; the cockpit renders they assert require the #590 rollback config.
  // The `/` moments test below re-enables the flag inside its own body.
  const ORIGINAL_MOMENTS_HOME = process.env.NEXT_PUBLIC_MOMENTS_HOME;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_MOMENTS_HOME = "false";
  });
  afterAll(() => {
    if (ORIGINAL_MOMENTS_HOME === undefined) {
      delete process.env.NEXT_PUBLIC_MOMENTS_HOME;
    } else {
      process.env.NEXT_PUBLIC_MOMENTS_HOME = ORIGINAL_MOMENTS_HOME;
    }
  });

  it("keeps the root html/body layout delegated to the client app shell", () => {
    const probe = <span data-testid="layout-probe" />;
    const root = expectElement(RootLayout({ children: probe }));
    const body = expectElement(root.props.children);
    const shell = expectElement(body.props.children);

    expect(root.type).toBe("html");
    expect(body.type).toBe("body");
    expect(shell.type).toBe(AppShell);
    expect(shell.props.children).toBe(probe);
  });

  // Post go-live (P7d), `/` renders the moments home; the demoted stage routes
  // below still render the shared cockpit and stay wired through the provider.
  it("renders / through the moments home with one h1 and a first-focusable skip link", async () => {
    // Moments home is the live `/`: lift the rollback pin for this test only.
    delete process.env.NEXT_PUBLIC_MOMENTS_HOME;
    const { container } = renderThroughAppShell(
      await HomePage({ searchParams: Promise.resolve({}) }),
      "/",
    );

    expect(await screen.findByTestId("today-moments")).toBeDefined();
    expect(screen.queryByTestId("lifeos-cockpit")).toBeNull();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      container.querySelector(
        'a[href="#stage-content"],button,input,select,textarea,[tabindex]:not([tabindex="-1"])',
      ),
    ).toBe(screen.getByRole("link", { name: "Skip to stage content" }));
  });

  it.each([
    [
      "/capture",
      () => <CapturePage />,
      "Saved exactly as you write it. Sort it into a task later, in Triage.",
    ],
    ["/triage", () => <TriagePage />, "Inbox clear"],
    ["/calendar", () => <CalendarPage />, "Hour rail"],
    ["/execute", () => <ExecutePage />, "Focus queue"],
    ["/review", () => <ReviewPage />, /Ready to close|carry over/],
    [
      "/health",
      () => <HealthPage />,
      // #692: anchored so it matches the glance headline only, not the
      // "Needs a look: ..." line beneath it.
      /^(Everything is working|\d+ things? needs? a look)$/,
    ],
    ["/areas", () => <AreasOverviewPage />, "All areas overview"],
  ])(
    "renders %s through the shared cockpit",
    async (pathname, createPage, text) => {
      renderThroughAppShell(createPage(), pathname);

      const cockpit = await screen.findByTestId("lifeos-cockpit");
      expect(cockpit).toBeDefined();
      expect(
        cockpit.querySelector(
          'a[href="#stage-content"],button,input,select,textarea,[tabindex]:not([tabindex="-1"])',
        ),
      ).toBe(screen.getByRole("link", { name: "Skip to stage content" }));
      expect(
        screen.getByRole("navigation", { name: "Workflow stages" }),
      ).toBeDefined();
      expect(screen.getByText(text)).toBeDefined();
    },
  );

  it("labels the capture textarea and health ring control programmatically", async () => {
    renderThroughAppShell(<CapturePage />, "/capture");

    expect(
      await screen.findByRole("textbox", { name: "Capture thought" }),
    ).toBeDefined();
    expect(
      screen.getByRole("heading", { level: 1, name: "Capture" }),
    ).toBeDefined();

    renderThroughAppShell(<HealthPage />, "/health");

    expect(
      // #692: the ring's accessible name is now the plain glance sentence.
      await screen.findByRole("button", { name: /Check the system again/i }),
    ).toBeDefined();
  });

  it("keeps settings outside the cockpit but inside the provider", async () => {
    renderThroughAppShell(<AreasSettingsPage />, "/settings/areas");

    expect(screen.queryByTestId("lifeos-cockpit")).toBeNull();
    expect(
      await screen.findByRole("heading", { level: 1, name: "Areas" }),
    ).toBeDefined();
    expect(screen.getByRole("link", { name: "Cockpit" })).toHaveAttribute(
      "href",
      "/",
    );
  });
});
