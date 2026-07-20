import { fireEvent, render, screen } from "@testing-library/react";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import CapturePage from "../app/capture/page";
import { AppShell } from "../app/components/AppShell";

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
    // R2-C (#483 round 2): mock area colors retuned off raw Tailwind seed
    // hues — see lib/mockData.ts and lib/areaAccent.ts.
    expect(shell.style.getPropertyValue("--acc")).toBe("#4c80cd");

    fireEvent.click(screen.getByRole("button", { name: "Side Project" }));

    expect(shell.style.getPropertyValue("--acc")).toBe("#d87248");
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
