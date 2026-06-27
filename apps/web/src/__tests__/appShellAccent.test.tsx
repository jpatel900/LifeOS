import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CapturePage from "../app/capture/page";
import { AppShell } from "../app/components/AppShell";

const mockPathname = vi.fn(() => "/capture");
const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({ push: pushMock }),
}));

describe("handoff cockpit accent", () => {
  beforeEach(() => {
    mockPathname.mockReturnValue("/capture");
    pushMock.mockClear();
  });

  it("derives cockpit accent variables from the active area", async () => {
    render(
      <AppShell>
        <CapturePage />
      </AppShell>,
    );

    const shell = await screen.findByTestId("lifeos-cockpit");
    expect(shell.style.getPropertyValue("--acc")).toBe("#2563eb");

    fireEvent.click(screen.getByRole("button", { name: "Side Project" }));

    expect(shell.style.getPropertyValue("--acc")).toBe("#f97316");
  });

  it("uses data-theme light only on the cockpit root", async () => {
    render(
      <AppShell>
        <CapturePage />
      </AppShell>,
    );

    const shell = await screen.findByTestId("lifeos-cockpit");
    expect(shell.getAttribute("data-theme")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Toggle theme" }));

    expect(shell.getAttribute("data-theme")).toBe("light");
  });
});
