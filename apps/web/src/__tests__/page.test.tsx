import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HomePage from "../app/page";
import { AppShell } from "../app/components/AppShell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn() }),
}));

// Post go-live (P7d) `/` renders the moments home by default; the seven-stage
// cockpit today grid remains reachable as the explicit fallback
// (NEXT_PUBLIC_MOMENTS_HOME=false). This asserts that fallback still renders.
describe("Today cockpit fallback (NEXT_PUBLIC_MOMENTS_HOME=false)", () => {
  const original = process.env.NEXT_PUBLIC_MOMENTS_HOME;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_MOMENTS_HOME;
    } else {
      process.env.NEXT_PUBLIC_MOMENTS_HOME = original;
    }
  });

  it("renders one dominant next action and the glance bar", async () => {
    process.env.NEXT_PUBLIC_MOMENTS_HOME = "false";
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
    expect(screen.queryByRole("button", { name: "Save and sort" })).toBeNull();
  });
});
