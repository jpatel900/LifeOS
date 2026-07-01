import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ExecutePage from "../app/execute/page";
import { AppShell } from "../app/components/AppShell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/execute",
}));

describe("Execute cockpit", () => {
  it("keeps execution focused on the planned-block picker and timer", async () => {
    render(
      <AppShell>
        <ExecutePage />
      </AppShell>,
    );

    expect(await screen.findByText("Focus queue")).toBeDefined();
    expect(screen.getByText("Pick a block")).toBeDefined();
    expect(
      screen.queryByRole("button", { name: "Stop on this device" }),
    ).toBeNull();
  });
});
