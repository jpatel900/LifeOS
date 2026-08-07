import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowProvider } from "@/lib/WorkflowContext";
import { STORAGE_KEY } from "@/lib/workflowContext/reducerCore";
import type { WorkflowState } from "@/lib/workflow";
import type { HealthDashboardCheck } from "@/lib/data/health";
import {
  GOLDEN_AREA_ID,
  acceptLatestDraft,
  captureWorkflow,
  workflowSeed,
} from "@/__tests__/helpers/workflowReachability";
import { BANNED_ON_USER_SURFACE } from "@/__tests__/helpers/plainLanguageVocabulary";

/**
 * C2-S4 (#687) — the ported Health surface.
 *
 * Red-first on `origin/main` @ 9909da8e: `HealthSheet` does not exist there and
 * the moments home has no Health surface at all — `SideRail`'s "View area
 * health →" pushes the browser to the legacy `/health` route. Every assertion
 * below fails on that base.
 *
 * The check runner is mocked, deliberately: what this file proves is WHEN the
 * check runs, what the surface says about its result, and that every legacy
 * capability is on screen. What the check itself concludes is `lib/data/health`'s
 * own job and is pinned in `lib/data/health.test.ts`.
 */

const mocks = vi.hoisted(() => ({
  createSupabaseBrowserClient: vi.fn(),
  getHealthDashboard: vi.fn(),
  readPurposeGaugeSamples: vi.fn(),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: mocks.createSupabaseBrowserClient,
}));

vi.mock("@/lib/data/health", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data/health")>()),
  getHealthDashboard: mocks.getHealthDashboard,
}));

vi.mock("@/lib/data/purposeGaugeSamples", () => ({
  readPurposeGaugeSamples: mocks.readPurposeGaugeSamples,
}));

// Imported AFTER the mocks so the component picks them up.
const { HealthSheet } = await import("./HealthSheet");

const AREA = GOLDEN_AREA_ID;
const NOW = new Date("2026-08-06T18:00:00");

function check(over: Partial<HealthDashboardCheck>): HealthDashboardCheck {
  return {
    id: "health-areas",
    subsystem: "areas",
    status: "healthy",
    score: 100,
    summary: "Your areas loaded.",
    details: {},
    ...over,
  } as HealthDashboardCheck;
}

const ALL_HEALTHY: HealthDashboardCheck[] = [
  check({ id: "health-areas", subsystem: "areas" }),
  check({ id: "health-google-calendar", subsystem: "google_calendar" }),
  check({ id: "health-observability-sentry", subsystem: "sentry" }),
];

function seedState(): WorkflowState {
  let state = workflowSeed();
  state = captureWorkflow(state, "Something open");
  return acceptLatestDraft(state);
}

function renderSheet(options: { open?: boolean; state?: WorkflowState } = {}): {
  onClose: ReturnType<typeof vi.fn>;
} {
  const onClose = vi.fn();
  window.sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(options.state ?? seedState()),
  );
  render(
    <WorkflowProvider>
      <HealthSheet
        open={options.open ?? true}
        onClose={onClose}
        selectedAreaId={AREA}
        now={NOW}
      />
    </WorkflowProvider>,
  );
  return { onClose };
}

beforeEach(() => {
  window.sessionStorage.clear();
  vi.clearAllMocks();
  mocks.readPurposeGaugeSamples.mockResolvedValue([]);
  mocks.getHealthDashboard.mockResolvedValue({
    provider: "supabase",
    checkedAt: NOW.toISOString(),
    checks: ALL_HEALTHY,
    persistence: "persisted",
    persistenceMessage: null,
  });
  // A real client, so the component takes the account branch.
  mocks.createSupabaseBrowserClient.mockReturnValue({ from: vi.fn() });
});

afterEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe("HealthSheet — the ported Health surface", () => {
  it("renders nothing when closed", () => {
    renderSheet({ open: false });
    expect(screen.queryByTestId("health-sheet")).not.toBeInTheDocument();
  });

  /**
   * The load-bearing difference from the legacy screen, and the reason this
   * port is safe to mount on every home render.
   *
   * `HealthView` ran its check in a MOUNT effect, which is correct for a route
   * you navigate to. `TodayMoments` mounts every sheet unconditionally, so an
   * ungated mount effect would fire the whole probe suite — four deliberate
   * 400s and a `health_checks` write — on every visit to the home, for every
   * user, asked for or not. That would also make every `@signed-in` spec in the
   * suite trip the account-failure guard.
   */
  it("does not run the system check while it is closed — the probes and the health_checks write are asked-only", async () => {
    renderSheet({ open: false });
    await waitFor(() =>
      expect(screen.queryByTestId("health-sheet")).toBeNull(),
    );
    expect(mocks.getHealthDashboard).not.toHaveBeenCalled();
    expect(mocks.readPurposeGaugeSamples).not.toHaveBeenCalled();
  });

  it("runs the system check once when it is opened", async () => {
    renderSheet();
    await waitFor(() =>
      expect(mocks.getHealthDashboard).toHaveBeenCalledTimes(1),
    );
  });

  it("says everything is working, and that nothing needs the person, when every check is healthy", async () => {
    renderSheet();
    await waitFor(() =>
      expect(screen.getByTestId("health-sheet-headline")).toHaveTextContent(
        "Everything is working",
      ),
    );
    expect(screen.getByTestId("health-sheet-needs-you")).toHaveTextContent(
      "Nothing needs you right now.",
    );
  });

  /**
   * Target Card 1's Health clause (#758): the surface must never say
   * "everything is working" while its own checks fail — and it must NAME what
   * failed, in the plain words the person can act on, not the subsystem id.
   */
  it("names the failing check in plain words instead of claiming all-clear", async () => {
    mocks.getHealthDashboard.mockResolvedValue({
      provider: "supabase",
      checkedAt: NOW.toISOString(),
      checks: [
        check({ id: "health-areas" }),
        check({
          id: "health-capture-persistence",
          subsystem: "capture_persistence",
          status: "critical",
          score: 0,
          summary: "Captures could not be saved.",
        }),
      ],
      persistence: "persisted",
      persistenceMessage: null,
    });
    renderSheet();

    await waitFor(() =>
      expect(screen.getByTestId("health-sheet-headline")).toHaveTextContent(
        "1 thing needs a look",
      ),
    );
    // The plain label from HEALTH_CHECK_PRESENTATION, not "capture_persistence".
    expect(screen.getByTestId("health-sheet-needs-you")).toHaveTextContent(
      "Needs a look: Thoughts you capture.",
    );
  });

  it("groups every check under its plain-language group, and shows each check's own plain name", async () => {
    renderSheet();
    await waitFor(() =>
      expect(screen.getByTestId("health-sheet-group-work")).toBeInTheDocument(),
    );
    expect(
      screen.getByTestId("health-sheet-group-connections"),
    ).toHaveTextContent("Connected apps");
    expect(screen.getByTestId("health-sheet-group-privacy")).toHaveTextContent(
      "What leaves this app",
    );
    // Reachable, not truncated: the checks are in the DOM under their groups.
    expect(screen.getByTestId("health-sheet-group-work")).toHaveTextContent(
      "Your areas",
    );
    expect(
      screen.getByTestId("health-sheet-group-connections"),
    ).toHaveTextContent("Google Calendar");
  });

  /**
   * #688's sign-in door survives — and improves. The legacy screen sent the
   * person to `/login?next=/health`, which after this port would land them back
   * on the legacy shell. It now returns them to the sheet they were reading.
   */
  it("offers a sign-in door on a signed-out check, returning to this sheet and not to the legacy route", async () => {
    mocks.getHealthDashboard.mockResolvedValue({
      provider: "supabase",
      checkedAt: NOW.toISOString(),
      checks: [
        check({
          id: "health-auth-session",
          subsystem: "auth_session",
          status: "watch",
          score: 50,
          summary: "You are not signed in.",
          details: { mode: "signed_out" },
        }),
      ],
      persistence: "skipped",
      persistenceMessage: "Checked. No record of this check was saved.",
    });
    renderSheet();

    const link = await screen.findByTestId(
      "health-sheet-signin-link-health-auth-session",
    );
    expect(link).toHaveAttribute("href", "/login?next=%2F%3Fsheet%3Dhealth");
    expect(link.getAttribute("href")).not.toContain("health-route-legacy");
    expect(link.getAttribute("href")).not.toMatch(/next=%2Fhealth/);
  });

  it("keeps the People & commitments signal", async () => {
    renderSheet();
    await waitFor(() =>
      expect(
        screen.getByTestId("health-sheet-aging-signals"),
      ).toHaveTextContent("People & commitments"),
    );
  });

  it("re-runs the check on Check again, and says truthfully where the record went", async () => {
    renderSheet();
    await waitFor(() =>
      expect(mocks.getHealthDashboard).toHaveBeenCalledTimes(1),
    );
    await waitFor(() =>
      expect(screen.getByTestId("health-sheet-message")).toHaveTextContent(
        "Checked. A record of this check was saved to your account.",
      ),
    );

    screen.getByTestId("health-sheet-check-again").click();
    await waitFor(() =>
      expect(mocks.getHealthDashboard).toHaveBeenCalledTimes(2),
    );
  });

  /**
   * The message must describe what actually happened. A check that could not be
   * recorded may not claim it was.
   */
  it("never claims a record was saved when it was not", async () => {
    mocks.getHealthDashboard.mockResolvedValue({
      provider: "supabase",
      checkedAt: NOW.toISOString(),
      checks: ALL_HEALTHY,
      persistence: "unavailable",
      persistenceMessage: "Checked. No record of this check was saved.",
    });
    renderSheet();
    await waitFor(() =>
      expect(screen.getByTestId("health-sheet-message")).toHaveTextContent(
        "Checked. No record of this check was saved.",
      ),
    );
  });

  it("keeps the five FR-047 Mirror gauges, imported rather than re-implemented", async () => {
    renderSheet();
    await waitFor(() =>
      expect(screen.getByTestId("health-sheet")).toBeInTheDocument(),
    );
    // MirrorPanel's own doctrine line — proof it is the real panel.
    expect(screen.getByTestId("health-sheet")).toHaveTextContent(
      /Observation only/i,
    );
  });

  /**
   * NFR-006, ported: implementation vocabulary is allowed ONLY inside the
   * developer disclosure. This strips that node and scans what is left, the
   * same shape `src/__tests__/healthPage.test.tsx` uses on the legacy screen.
   */
  it("keeps implementation vocabulary inside the developer disclosure and out of the user-facing layer", async () => {
    renderSheet();
    await waitFor(() =>
      expect(
        screen.getByTestId("health-sheet-developer-details"),
      ).toBeInTheDocument(),
    );
    // The raw subsystem name is present — in the developer layer.
    expect(
      screen.getByTestId("health-sheet-developer-details"),
    ).toHaveTextContent("google_calendar");

    const surface = screen
      .getByTestId("health-sheet")
      .cloneNode(true) as HTMLElement;
    surface
      .querySelectorAll('[data-testid="health-sheet-developer-details"]')
      .forEach((node) => node.remove());
    const visible = surface.textContent ?? "";

    for (const banned of BANNED_ON_USER_SURFACE) {
      expect(
        banned.test(visible),
        `user-facing copy must not match ${banned}`,
      ).toBe(false);
    }
  });
});
