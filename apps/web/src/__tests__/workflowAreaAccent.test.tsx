import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CapturePage from "../app/capture/page";
import AreasSettingsPage from "../app/settings/areas/page";
import { AppShell } from "../app/components/AppShell";
import { deriveAccent } from "@/lib/cockpit/accent";

const mockPathname = vi.fn(() => "/capture");

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({ push: vi.fn() }),
}));

describe("handoff cockpit area accents", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    mockPathname.mockReturnValue("/capture");
  });

  it("uses the exact handoff accent derivation", () => {
    expect(deriveAccent("#6b78e8", { dark: true, sf2: "#1b1e25" })).toEqual({
      acc: "#6b78e8",
      acc2: "#838eec",
      accSf: "#2b304c",
      accRng: "#434b87",
      onAcc: "#ffffff",
    });
  });

  it("re-derives root variables when the active area changes", async () => {
    render(
      <AppShell>
        <CapturePage />
      </AppShell>,
    );

    const cockpit = await screen.findByTestId("lifeos-cockpit");
    // R2-C (#483 round 2): mock area colors retuned off raw Tailwind seed
    // hues — see lib/mockData.ts and lib/areaAccent.ts.
    expect(cockpit.style.getPropertyValue("--acc")).toBe("#4c80cd");

    fireEvent.click(screen.getByRole("button", { name: "Volunteer Work" }));

    expect(cockpit.style.getPropertyValue("--acc")).toBe("#8965ba");
  });

  it("keeps Areas admin outside the cockpit visual system", async () => {
    mockPathname.mockReturnValue("/settings/areas");
    render(
      <AppShell>
        <AreasSettingsPage />
      </AppShell>,
    );

    expect(screen.queryByTestId("lifeos-cockpit")).toBeNull();
    expect(
      await screen.findByRole("heading", { level: 1, name: "Areas" }),
    ).toBeDefined();
  });
});
