import { fireEvent, render, screen } from "@testing-library/react";
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

vi.mock("next/navigation", () => ({
  usePathname: () => "/capture",
}));

function renderThroughAppShell(children: ReactNode) {
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

    expect(await screen.findByText(/Organization help:/)).toBeDefined();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Save quick note" }),
    ).toBeDefined();
    expect(screen.getByText("Saves in this browser only.")).toBeDefined();
    expect(
      screen.getByRole("heading", { level: 1, name: "Capture" }),
    ).toBeDefined();
    expect(
      screen.getByPlaceholderText("What's on your mind? Type anything..."),
    ).toBeDefined();
  });

  it("shows quick note save feedback in the app shell", async () => {
    renderThroughAppShell(<CapturePage />);

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
    expect(screen.getByText(/Review it in/i)).toBeDefined();
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
      expect(screen.getByLabelText("Current area context")).toHaveTextContent(
        "Session workflow area:",
      );
      expect(await screen.findByRole("heading", { level: 1 })).toBeDefined();
    },
  );
});
