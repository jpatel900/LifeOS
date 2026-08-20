import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Area } from "@lifeos/schemas";
import { WorkflowProvider } from "@/lib/WorkflowContext";
import { AreaRegistryCards } from "./AreaRegistryCards";

/**
 * C2-S9 (#687 round-3 fresh-eyes judge, score 8.0): the settings page's
 * per-area quick links ("Capture here", "Plan area", "Review area") used to
 * href to a bare `/?capture=1` / `/?sheet=plan`, relying entirely on an
 * onClick side effect to switch the active area — a middle-click, "open in
 * new tab", or copied link address never runs that handler, so the arrival
 * URL was born without `?area=` and a fresh browser landed on the WRONG
 * area. These tests pin the href itself, independent of any click.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/settings/areas",
}));

const PERSONAL_AREA: Area = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "22222222-2222-4222-8222-222222222222",
  name: "Personal",
  slug: "personal",
  description: "Personal area",
  color: "#439458",
  icon: null,
  sort_order: 0,
  is_active: true,
  created_at: "2026-05-27T00:00:00.000Z",
  updated_at: "2026-05-27T00:00:00.000Z",
};

function renderCards(areas: Area[] = [PERSONAL_AREA]) {
  return render(
    <WorkflowProvider>
      <AreaRegistryCards
        provider="mock"
        areas={areas}
        tasks={[]}
        blocks={[]}
        reviewEntries={[]}
        replaceReadyAreas={() => {}}
      />
    </WorkflowProvider>,
  );
}

describe("AreaRegistryCards quick-link hrefs (#687 finding 1, C2-S9)", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('"Capture here" hrefs to /?capture=1&area=<the area\'s own workflow id>', () => {
    renderCards();

    // "personal" is one of the four legacy seed slugs
    // (workflowAreaMapping.ts), so its workflow area id is the readable
    // "area-personal", not the raw uuid — matching what selectedAreaId and
    // every other consumer already use.
    expect(screen.getByRole("link", { name: "Capture here" })).toHaveAttribute(
      "href",
      "/?capture=1&area=area-personal",
    );
  });

  it('"Plan area" and "Review area" href with the same ?area= carried', () => {
    renderCards();

    expect(screen.getByRole("link", { name: "Plan area" })).toHaveAttribute(
      "href",
      "/?sheet=plan&area=area-personal",
    );
    expect(screen.getByRole("link", { name: "Review area" })).toHaveAttribute(
      "href",
      "/?sheet=review&area=area-personal",
    );
  });

  it("a custom area with no canonical slug mapping carries its own uuid, not a fabricated one", () => {
    const customArea: Area = {
      ...PERSONAL_AREA,
      id: "33333333-3333-4333-8333-333333333333",
      name: "Deep Work",
      slug: "deep-work",
    };
    renderCards([customArea]);

    expect(screen.getByRole("link", { name: "Capture here" })).toHaveAttribute(
      "href",
      "/?capture=1&area=33333333-3333-4333-8333-333333333333",
    );
  });
});
