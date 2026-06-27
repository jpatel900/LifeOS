import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import HomePage from "../app/page";
import { AppShell } from "../app/components/AppShell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

describe("Today cockpit", () => {
  it("renders one dominant next action and the glance bar", async () => {
    render(
      <AppShell>
        <HomePage />
      </AppShell>,
    );

    expect(await screen.findByText("One move now")).toBeDefined();
    expect(screen.getByText("At a glance")).toBeDefined();
    expect(
      screen.getByRole("navigation", { name: "Workflow stages" }),
    ).toBeDefined();
    expect(screen.queryByRole("button", { name: "Save thought" })).toBeNull();
  });
});
