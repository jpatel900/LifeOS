import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import HomePage from "../app/page";
import CapturePage from "../app/capture/page";
import CalendarPage from "../app/calendar/page";
import ExecutePage from "../app/execute/page";
import HealthPage from "../app/health/page";
import ReviewPage from "../app/review/page";
import AreasSettingsPage from "../app/settings/areas/page";
import TriagePage from "../app/triage/page";
import { AppShell } from "../app/components/AppShell";
import RootLayout from "../app/layout";

const navigationMock = vi.hoisted(() => ({
  pathname: "/capture",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationMock.pathname,
}));

function renderThroughAppShell(children: ReactNode, pathname = "/capture") {
  navigationMock.pathname = pathname;
  return render(<AppShell>{children}</AppShell>);
}

function expectElement(value: unknown) {
  expect(isValidElement(value)).toBe(true);
  return value as ReactElement<{ children?: ReactNode }>;
}

describe("workflow route provider wiring", () => {
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

  it("renders the capture route through the real app shell provider", async () => {
    renderThroughAppShell(<CapturePage />);

    expect(await screen.findByText("Raw first")).toBeDefined();
    expect(screen.getByText("Sorting help")).toBeDefined();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeDefined();
    expect(screen.getByRole("navigation", { name: "Supporting" })).toBeDefined();
    expect(
      screen.queryByRole("button", { name: "Save quick note" }),
    ).toBeNull();
    expect(screen.queryByLabelText("Quick note text")).toBeNull();
    expect(screen.queryByTestId("app-shell-context-header")).toBeNull();
    expect(
      screen.getByRole("heading", { level: 1, name: "Capture" }),
    ).toBeDefined();
    expect(
      screen.getByPlaceholderText("What's on your mind? Type anything..."),
    ).toBeDefined();
  });

  it("keeps Areas out of the primary workflow nav and in supporting admin nav", () => {
    renderThroughAppShell(<TriagePage />, "/triage");

    const primaryNav = screen.getByRole("navigation", { name: "Primary" });
    const supportingNav = screen.getByRole("navigation", {
      name: "Supporting",
    });

    expect(primaryNav).not.toHaveTextContent("Areas");
    expect(screen.getByRole("link", { name: "Areas admin" })).toBeDefined();
    expect(supportingNav).toHaveTextContent("Areas admin");
  });

  it("marks Areas active in supporting nav instead of primary workflow nav", async () => {
    renderThroughAppShell(<AreasSettingsPage />, "/settings/areas");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Areas" }),
    ).toBeDefined();
    expect(screen.getByRole("link", { name: "Areas admin" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen
        .getByRole("navigation", { name: "Primary" })
        .querySelector('[aria-current="page"]'),
    ).toBeNull();
  });

  it("removes the extra shell context band on Home, Capture, Planning, Execute, and Review", async () => {
    renderThroughAppShell(<HomePage />, "/");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Today" }),
    ).toBeDefined();
    expect(screen.queryByTestId("app-shell-context-header")).toBeNull();

    renderThroughAppShell(<CapturePage />, "/capture");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Capture" }),
    ).toBeDefined();
    expect(screen.queryByTestId("app-shell-context-header")).toBeNull();

    renderThroughAppShell(<CalendarPage />, "/calendar");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Planning" }),
    ).toBeDefined();
    expect(screen.queryByTestId("app-shell-context-header")).toBeNull();

    renderThroughAppShell(<ExecutePage />, "/execute");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Execute" }),
    ).toBeDefined();
    expect(screen.queryByTestId("app-shell-context-header")).toBeNull();

    renderThroughAppShell(<ReviewPage />, "/review");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Review" }),
    ).toBeDefined();
    expect(screen.queryByTestId("app-shell-context-header")).toBeNull();
  });

  it("keeps the extra shell context band off on quiet routes", async () => {
    for (const { pathname, createPage } of [
      { pathname: "/", createPage: () => <HomePage /> },
      { pathname: "/capture", createPage: () => <CapturePage /> },
      { pathname: "/calendar", createPage: () => <CalendarPage /> },
      { pathname: "/execute", createPage: () => <ExecutePage /> },
      { pathname: "/review", createPage: () => <ReviewPage /> },
    ] as const) {
      cleanup();
      renderThroughAppShell(createPage(), pathname);

      expect(await screen.findByRole("heading", { level: 1 })).toBeDefined();
      expect(screen.queryByTestId("app-shell-context-header")).toBeNull();
    }
  });

  it("keeps quick note controls off on Home and Capture", async () => {
    for (const { pathname, createPage } of [
      { pathname: "/", createPage: () => <HomePage /> },
      { pathname: "/capture", createPage: () => <CapturePage /> },
    ] as const) {
      cleanup();
      renderThroughAppShell(createPage(), pathname);

      expect(await screen.findByRole("heading", { level: 1 })).toBeDefined();
      expect(screen.queryByRole("button", { name: "Save quick note" })).toBeNull();
      expect(screen.queryByLabelText("Quick note text")).toBeNull();
      expect(
        screen.queryByText(
          "Saved on this device only. Review in Triage or Review.",
        ),
      ).toBeNull();
    }
  });

  it("shows quick note save feedback in the app shell", async () => {
    renderThroughAppShell(<TriagePage />, "/triage");

    expect(screen.queryByLabelText("Quick note text")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Quick note" }));
    fireEvent.click(screen.getByRole("button", { name: "Save quick note" }));
    expect(
      await screen.findByText(
        "Quick note was not saved. Type a note first, or use Capture.",
      ),
    ).toBeDefined();

    fireEvent.change(screen.getByRole("textbox", { name: "Quick note text" }), {
      target: { value: "quick-note-route-smoke" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save quick note" }));

    expect(await screen.findByText("Saved.")).toBeDefined();
    expect(
      screen
        .getAllByRole("link", { name: "Triage" })
        .some((link) => link.getAttribute("href") === "/triage"),
    ).toBe(true);
    expect(
      screen
        .getAllByRole("link", { name: "Review" })
        .some((link) => link.getAttribute("href") === "/review"),
    ).toBe(true);
  });

  it.each([
    ["home", () => <HomePage />],
    ["triage", () => <TriagePage />],
    ["calendar", () => <CalendarPage />],
    ["execute", () => <ExecutePage />],
    ["review", () => <ReviewPage />],
    ["health", () => <HealthPage />],
    ["settings", () => <AreasSettingsPage />],
  ])(
    "renders the %s route without a manual WorkflowProvider",
    async (_name, createPage) => {
      renderThroughAppShell(createPage());

      expect(screen.getByRole("navigation", { name: "Primary" })).toBeDefined();
      expect(screen.getByLabelText("Current area")).toBeDefined();
      expect(await screen.findByRole("heading", { level: 1 })).toBeDefined();
    },
  );
});
