import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CapturePage from "../app/capture/page";
import { AppShell } from "../app/components/AppShell";
import { stubParseCaptureFetch } from "./helpers/parseCaptureFetch";

vi.mock("next/navigation", () => ({
  usePathname: () => "/capture",
}));

describe("Capture cockpit", () => {
  let restoreFetch: () => void;

  beforeEach(() => {
    restoreFetch = stubParseCaptureFetch();
  });

  afterEach(() => {
    restoreFetch();
  });

  it("saves a thought through the single primary action and routes it to triage", async () => {
    render(
      <AppShell>
        <CapturePage />
      </AppShell>,
    );

    fireEvent.change(
      await screen.findByPlaceholderText("Drop the thought here."),
      {
        target: { value: "Draft agenda for the planning meeting" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save thought" }));

    expect(await screen.findByText("Saved; waiting in Triage")).toBeDefined();
    expect(
      await screen.findByText("Draft agenda for the planning meeting"),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Do today" })).toBeDefined();
  });

  it("blocks empty saves and keeps one primary capture action", async () => {
    render(
      <AppShell>
        <CapturePage />
      </AppShell>,
    );

    expect(await screen.findByText("Saves raw text first")).toBeDefined();
    expect(
      screen.queryByRole("button", { name: "Organize after save" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Save thought" })).toBeDisabled();
    expect(
      screen.getAllByRole("button", { name: "Save thought" }),
    ).toHaveLength(1);
  });
});
