import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowProvider } from "@/lib/WorkflowContext";
import {
  ONBOARDING_COMPLETED_KEY,
  ONBOARDING_OUTCOME_TOAST_KEY,
} from "@/lib/onboarding/onboarding";
import WelcomePage from "./page";

/**
 * C3 (Part of #687, C3 card 10) — the ritual's own route, red-first.
 *
 * Before this slice the ritual only ever rendered INLINE on `/`
 * (TodayMoments.tsx), with no address of its own — this is the test that
 * would have failed on `main`: mounting `<WelcomePage>` directly and
 * expecting the ritual to be reachable there at all. Seeds a genuine
 * zero-state session the same way `tests/e2e/onboarding-ritual.spec.ts`
 * does (writing the pre-hydration `lifeos.phase2.workflow` sessionStorage
 * slot `WorkflowProvider`'s initializer reads synchronously), so this stays
 * a real integration through the shared `useOnboardingRitual` predicate
 * rather than a second, drifting mock of it.
 */

const routerMock = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
  usePathname: () => "/welcome",
}));

const WORKFLOW_STORAGE_KEY = "lifeos.phase2.workflow";

const ZERO_WORKFLOW_STATE = {
  areas: [],
  captureItems: [],
  taskDrafts: [],
  projectDrafts: [],
  ambiguityAssessments: [],
  timeBlockProposalDrafts: [],
  projects: [],
  tasks: [],
  timeBlockProposals: [],
  calendarBlocks: [],
  executionSessions: [],
  healthChecks: [],
  reviewLog: [],
  wipRefusal: null,
};

function seedZeroState() {
  window.sessionStorage.setItem(
    WORKFLOW_STORAGE_KEY,
    JSON.stringify(ZERO_WORKFLOW_STATE),
  );
}

function renderWelcome() {
  return render(
    <WorkflowProvider>
      <WelcomePage />
    </WorkflowProvider>,
  );
}

describe("/welcome (C3 onboarding own-URL)", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    window.localStorage.clear();
    window.sessionStorage.clear();
    routerMock.replace.mockClear();
    routerMock.push.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("is reachable at its own route: a zero-state session renders the ritual here directly, with no `/` involved", async () => {
    seedZeroState();
    renderWelcome();

    expect(await screen.findByTestId("onboarding-ritual")).toBeInTheDocument();
    expect(screen.getByTestId("welcome-screen")).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-step-areas")).toBeInTheDocument();
    // The hand-off is one-directional: landing directly on /welcome never
    // bounces back to Today while the ritual is genuinely eligible.
    expect(routerMock.replace).not.toHaveBeenCalledWith("/");
  });

  it("bounces an ineligible visit (already completed) straight back to Today", async () => {
    // Not a zero state — the seeded demo provider has areas already, and
    // the device also carries a completed record, matching an established
    // account that typed /welcome into the address bar directly.
    window.localStorage.setItem(
      ONBOARDING_COMPLETED_KEY,
      JSON.stringify({ completedAt: new Date().toISOString() }),
    );
    renderWelcome();

    await vi.waitFor(() => {
      expect(routerMock.replace).toHaveBeenCalledWith("/");
    });
    expect(screen.queryByTestId("onboarding-ritual")).not.toBeInTheDocument();
  });

  it("completing the ritual hands off to Today and stages the payoff toast", async () => {
    seedZeroState();
    renderWelcome();

    await screen.findByTestId("onboarding-step-areas");
    act(() => {
      screen.getByTestId("onboarding-areas-skip").click();
    });
    await screen.findByTestId("onboarding-step-day");
    act(() => {
      screen.getByTestId("onboarding-day-skip").click();
    });
    await screen.findByTestId("onboarding-step-capture");
    act(() => {
      screen.getByTestId("onboarding-capture-skip").click();
    });

    expect(routerMock.replace).toHaveBeenCalledWith("/");
    expect(window.sessionStorage.getItem(ONBOARDING_OUTCOME_TOAST_KEY)).toBe(
      "skipped",
    );
  });
});
