import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../app/components/AppShell";

const mockPathname = vi.fn(() => "/capture");

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
}));

describe("AppShell area accent", () => {
  beforeEach(() => {
    mockPathname.mockReturnValue("/capture");
  });

  it("updates the shell accent when the selected area changes", () => {
    render(
      <AppShell>
        <div>Accent probe</div>
      </AppShell>,
    );

    const shell = screen.getByTestId("app-shell-root");
    const areaSelect = screen.getByLabelText("Current area");

    expect(shell.style.getPropertyValue("--area-accent")).toBe("#2563eb");

    fireEvent.change(areaSelect, {
      target: { value: "area-side-project" },
    });

    expect(shell.style.getPropertyValue("--area-accent")).toBe("#f97316");
    expect(areaSelect).toHaveValue("area-side-project");
    expect(screen.queryByTestId("app-shell-context-header")).toBeNull();
  });

  it("marks the active nav item with aria-current", () => {
    render(
      <AppShell>
        <div>Accent probe</div>
      </AppShell>,
    );

    expect(screen.getByRole("link", { name: "Capture" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Review" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(
      screen.getByRole("link", { name: "Areas admin" }),
    ).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("keeps workflow internals out of the primary area panel and exposes a skip link", () => {
    render(
      <AppShell>
        <div>Accent probe</div>
      </AppShell>,
    );

    expect(
      screen.getByRole("link", { name: "Skip to main content" }),
    ).toHaveAttribute("href", "#main-content");
    expect(screen.queryByText(/Session workflow area/i)).toBeNull();
  });
});
