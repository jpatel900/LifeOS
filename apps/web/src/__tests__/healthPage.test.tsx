import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import HealthPage from "../app/health/page";
import { AppShell } from "../app/components/AppShell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/health",
}));

describe("Health cockpit", () => {
  it("leads with the grouped health answer and hides full detail behind disclosure", async () => {
    render(
      <AppShell>
        <HealthPage />
      </AppShell>,
    );

    expect(await screen.findByText("All systems healthy")).toBeDefined();
    expect(screen.getByText("Storage")).toBeDefined();
    expect(screen.getByText("Integrations")).toBeDefined();
    expect(screen.getByText("Telemetry off")).toBeDefined();
    expect(screen.getByText("Full breakdown")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Run system check" }));
    expect(screen.getByRole("button", { name: "Run system check" })).toBeDefined();
  });
});
