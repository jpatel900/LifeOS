import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CapturePage from "../app/capture/page";
import TriagePage from "../app/triage/page";
import { AppShell } from "../app/components/AppShell";

const mockPathname = vi.fn(() => "/triage");

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
}));

describe("Triage cockpit", () => {
  it("shows the empty verdict-first triage state", async () => {
    render(
      <AppShell>
        <TriagePage />
      </AppShell>,
    );

    expect(await screen.findByText("Inbox clear")).toBeDefined();
    expect(screen.getByRole("button", { name: "Plan the day" })).toBeDefined();
  });

  it("lets a captured item move to Someday", async () => {
    mockPathname.mockReturnValue("/capture");
    render(
      <AppShell>
        <CapturePage />
      </AppShell>,
    );

    fireEvent.change(
      await screen.findByPlaceholderText("Drop the thought here."),
      {
        target: { value: "Review old someday notes" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save thought" }));
    fireEvent.click(await screen.findByRole("button", { name: "Someday" }));

    expect(await screen.findByText("Inbox clear")).toBeDefined();
  });
});
