import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HealthPage from "../app/health/page";
import { AppShell } from "../app/components/AppShell";
import { HEALTH_CHECK_PRESENTATION } from "../app/components/cockpit/HealthView";
import { healthChecks as demoHealthChecks } from "../lib/mockData";
import { BANNED_ON_USER_SURFACE } from "./helpers/plainLanguageVocabulary";

vi.mock("next/navigation", () => ({
  usePathname: () => "/health",
  useRouter: () => ({ push: vi.fn() }),
}));

const mocks = vi.hoisted(() => ({
  createSupabaseBrowserClient: vi.fn(),
  getHealthDashboard: vi.fn(),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: mocks.createSupabaseBrowserClient,
}));

vi.mock("@/lib/data/health", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data/health")>()),
  getHealthDashboard: mocks.getHealthDashboard,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createSupabaseBrowserClient.mockReturnValue(null);
});

/**
 * NFR-006 half 1 — implementation vocabulary that must never reach a
 * user-facing layer of this screen. It is still allowed (and expected) inside
 * the developer disclosure, which this helper strips out before asserting.
 *
 * The list itself now lives in `./helpers/plainLanguageVocabulary`, shared
 * with the repo-wide guard in `plainLanguageGuard.test.ts`, so this
 * screen-scoped DOM assertion can never drift behind the repo-wide scan.
 */
function userFacingText() {
  const cockpit = screen
    .getByTestId("lifeos-cockpit")
    .cloneNode(true) as HTMLElement;
  cockpit
    .querySelectorAll('[data-testid="health-developer-details"]')
    .forEach((node) => node.remove());
  return cockpit.textContent ?? "";
}

function renderHealth() {
  return render(
    <AppShell>
      <HealthPage />
    </AppShell>,
  );
}

describe("Health cockpit", () => {
  it("leads with the plain glance answer and layers the rest (#692)", async () => {
    renderHealth();

    // GLANCE — the headline answers "is everything working" and the line
    // under it answers "does anything need me", both in plain words.
    expect(await screen.findByText("3 things need a look")).toBeDefined();
    expect(screen.getByTestId("health-glance-needs-you").textContent).toContain(
      "Needs a look:",
    );

    // DETAIL — grouped, not an arbitrary top-3 slice, and not truncated.
    expect(screen.getByTestId("health-group-work")).toBeDefined();
    expect(screen.getByTestId("health-group-connections")).toBeDefined();
    expect(screen.getByText("Your work and account")).toBeDefined();
    expect(screen.getByText("Connected apps")).toBeDefined();

    // DEVELOPER — present, explicitly labeled, and holding the technical names.
    const developer = screen.getByTestId("health-developer-details");
    expect(screen.getByText("Developer details")).toBeDefined();
    expect(developer.textContent).toContain("ai_parsing");
    expect(developer.textContent).toContain("calendar_connector");

    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(screen.getByRole("button", { name: "Check again" })).toBeDefined();
  });

  it("every check the app can produce has a plain name and a group (#692)", async () => {
    const { getHealthDashboard } =
      await vi.importActual<typeof import("@/lib/data/health")>(
        "@/lib/data/health",
      );
    const live = await getHealthDashboard(null);

    const ids = new Set<string>([
      ...live.checks.map((check) => check.id),
      ...demoHealthChecks.map((check) => check.id),
      // Signed-in-only checks, which the mock path above never reaches.
      "health-transition-rpcs",
      "health-core-reads",
      "health-ai-provider-incidents",
    ]);

    const unmapped = [...ids].filter((id) => !HEALTH_CHECK_PRESENTATION[id]);
    expect(unmapped).toEqual([]);
  });

  it("keeps implementation vocabulary out of every user-facing layer (#692 / NFR-006)", async () => {
    // Drive the screen with the real check set, vendor rows included, so the
    // guard sees exactly what the owner saw on his own screen.
    const { getHealthDashboard } =
      await vi.importActual<typeof import("@/lib/data/health")>(
        "@/lib/data/health",
      );
    mocks.createSupabaseBrowserClient.mockReturnValue({});
    mocks.getHealthDashboard.mockResolvedValue(await getHealthDashboard(null));

    renderHealth();
    await screen.findByTestId("health-developer-details");

    const visible = userFacingText();
    for (const banned of BANNED_ON_USER_SURFACE) {
      expect(
        banned.test(visible),
        `user-facing copy must not match ${banned}`,
      ).toBe(false);
    }

    // ...and the same words ARE still reachable, one explicit disclosure down.
    // Visibility is layered, never truncated (NFR-006).
    const developer = screen.getByTestId(
      "health-developer-details",
    ).textContent;
    expect(developer).toContain("supabase config");
    expect(developer).toContain("Sentry");
    expect(developer).toContain("PostHog");
    expect(developer).toContain("Langfuse");
  });

  it("renders persisted-mode probe results instead of demo copy", async () => {
    mocks.createSupabaseBrowserClient.mockReturnValue({});
    mocks.getHealthDashboard.mockResolvedValue({
      provider: "supabase",
      checkedAt: "2026-07-04T00:00:00.000Z",
      persistence: "persisted",
      persistenceMessage: null,
      checks: [
        {
          id: "health-transition-rpcs",
          subsystem: "transition RPCs",
          status: "critical",
          score: 0,
          summary:
            "1 action for moving work between steps is missing, so those steps will fail. Someone technical needs to finish setting this up.",
          details: { missing: ["accept_time_block_proposal"] },
        },
        {
          id: "health-core-reads",
          subsystem: "core table reads",
          status: "healthy",
          score: 100,
          summary: "All of your saved work is loading correctly.",
          details: {},
        },
      ],
    });

    renderHealth();

    expect(
      (await screen.findAllByText("Moving work between steps")).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/1 action for moving work between steps is missing/)
        .length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "Checked. A record of this check was saved to your account.",
      ),
    ).toBeDefined();
    // The demo checks are gone once real results arrive.
    expect(screen.queryByText("Where your work is kept")).toBeNull();
    expect(screen.queryByText("AI helper")).toBeNull();
    // The technical name is still reachable in the developer layer only.
    expect(
      screen.getByTestId("health-developer-details").textContent,
    ).toContain("transition RPCs");
    expect(userFacingText()).not.toContain("transition RPCs");
  });

  it("re-running the system check refreshes the persisted display", async () => {
    mocks.createSupabaseBrowserClient.mockReturnValue({});
    mocks.getHealthDashboard.mockResolvedValueOnce({
      provider: "supabase",
      checkedAt: "2026-07-04T00:00:00.000Z",
      persistence: "persisted",
      persistenceMessage: null,
      checks: [
        {
          id: "health-transition-rpcs",
          subsystem: "transition RPCs",
          status: "critical",
          score: 0,
          summary:
            "1 action for moving work between steps is missing, so those steps will fail. Someone technical needs to finish setting this up.",
          details: {},
        },
      ],
    });
    mocks.getHealthDashboard.mockResolvedValueOnce({
      provider: "supabase",
      checkedAt: "2026-07-04T00:05:00.000Z",
      persistence: "persisted",
      persistenceMessage: null,
      checks: [
        {
          id: "health-transition-rpcs",
          subsystem: "transition RPCs",
          status: "healthy",
          score: 100,
          summary: "Moving work between steps is working.",
          details: {},
        },
      ],
    });

    renderHealth();

    expect(
      (
        await screen.findAllByText(
          /1 action for moving work between steps is missing/,
        )
      ).length,
    ).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(
      (await screen.findAllByText("Moving work between steps is working."))
        .length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryAllByText(
        /1 action for moving work between steps is missing/,
      ),
    ).toHaveLength(0);
    expect(mocks.getHealthDashboard).toHaveBeenCalledTimes(2);
  });
});
