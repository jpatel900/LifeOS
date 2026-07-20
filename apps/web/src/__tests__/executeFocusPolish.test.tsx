import { render, screen } from "@testing-library/react";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import ExecutePage from "../app/execute/page";
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

vi.mock("next/navigation", () => ({
  usePathname: () => "/execute",
  useRouter: () => ({ push: vi.fn() }),
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
