import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CapturePage from "../app/capture/page";
import { AppShell } from "../app/components/AppShell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/capture",
}));

describe("Capture cockpit", () => {
  it("saves a thought through the single primary action and routes it to triage", async () => {
    render(
      <AppShell>
        <CapturePage />
      </AppShell>,
    );

    fireEvent.change(await screen.findByPlaceholderText("Drop the thought here."), {
      target: { value: "Draft agenda for the planning meeting" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save thought" }));

    expect(await screen.findByText("Saved to Triage")).toBeDefined();
    expect(await screen.findByText("Draft agenda for the planning meeting")).toBeDefined();
    expect(screen.getByRole("button", { name: "Do today" })).toBeDefined();
  });

  it("keeps organize as an accessory toggle, not a second primary action", async () => {
    render(
      <AppShell>
        <CapturePage />
      </AppShell>,
    );

    expect(await screen.findByRole("button", { name: "Organize after save" })).toBeDefined();
    expect(screen.getAllByRole("button", { name: "Save thought" })).toHaveLength(1);
  });
});
