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
    // #687: HomePage is an async server component now (it reads searchParams
    // for the redirect-shim deep links) — resolve it before rendering.
    render(
      <AppShell>
        {await HomePage({ searchParams: Promise.resolve({}) })}
      </AppShell>,
    );

    expect(await screen.findByText("One move now")).toBeDefined();
    expect(screen.getByText("At a glance")).toBeDefined();
    expect(
      screen.getByRole("navigation", { name: "Workflow stages" }),
    ).toBeDefined();
    // #703: anchored on the capture surface's save control by testid, not by
    // a button label. A label lookup here is no longer a real claim — the
    // one capture action is now named "Capture", which is also the name of a
    // stage-nav button on this very screen, so a name-based negative would be
    // either trivially true (an old label nothing renders any more) or
    // trivially false (matching the nav). The testid only exists on the
    // capture stage, which this Today fallback is not.
    expect(screen.queryByTestId("capture-page-save")).toBeNull();
  });
});
