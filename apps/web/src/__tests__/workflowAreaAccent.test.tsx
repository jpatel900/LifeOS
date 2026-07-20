import { fireEvent, render, screen } from "@testing-library/react";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import CapturePage from "../app/capture/page";
import AreasSettingsPage from "../app/settings/areas/page";
import { AppShell } from "../app/components/AppShell";
import { deriveAccent } from "@/lib/cockpit/accent";

// #687: the demoted stage pages (/capture, /triage, /execute, ...) are
// redirect shims into the moments home under the shipping config. This suite
// exercises the cockpit surfaces themselves, which render only under the
// #590 rollback (NEXT_PUBLIC_MOMENTS_HOME=false) — pin that config here.
const ORIGINAL_MOMENTS_HOME = process.env.NEXT_PUBLIC_MOMENTS_HOME;
beforeEach(() => {
  // beforeEach, not beforeAll: process.env is process-global and shared by
  // every test file in a vitest worker, so re-pin before each test rather
  // than once per file.
  process.env.NEXT_PUBLIC_MOMENTS_HOME = "false";
});
afterAll(() => {
  if (ORIGINAL_MOMENTS_HOME === undefined) {
    delete process.env.NEXT_PUBLIC_MOMENTS_HOME;
  } else {
    process.env.NEXT_PUBLIC_MOMENTS_HOME = ORIGINAL_MOMENTS_HOME;
  }
});

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
