import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HealthDashboardResult } from "@/lib/data/health";
import HealthPage from "../app/health/page";

const mocks = vi.hoisted(() => ({
  createSupabaseBrowserClient: vi.fn(),
  getHealthDashboard: vi.fn(),
  captureEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: mocks.createSupabaseBrowserClient,
}));

vi.mock("@/lib/data/health", () => ({
  getHealthDashboard: mocks.getHealthDashboard,
}));

vi.mock("@/lib/observability", () => ({
  captureEvent: mocks.captureEvent,
}));

function readyResult(
  checks: HealthDashboardResult["checks"],
): HealthDashboardResult {
  return {
    provider: "mock",
    checkedAt: "2026-05-14T00:00:00.000Z",
    checks,
    persistence: "not_applicable",
    persistenceMessage: null,
  };
}

describe("HealthPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createSupabaseBrowserClient.mockReturnValue({ client: "mock" });
    vi.useRealTimers();
  });

  it("treats optional-disabled states as informational non-warnings", async () => {
    mocks.getHealthDashboard.mockResolvedValue(
      readyResult([
        {
          id: "mock-mode",
          subsystem: "mock mode",
          status: "healthy",
          score: 100,
          summary: "Mock mode is available.",
          details: { informational: true, summary: "Mock mode is available." },
        },
        {
          id: "google-calendar",
          subsystem: "Google Calendar",
          status: "healthy",
          score: 100,
          summary:
            "Google Calendar is not configured; planning remains local-only.",
          details: {
            configured: false,
            informational: true,
            summary:
              "Google Calendar is not configured; planning remains local-only.",
          },
        },
      ]),
    );

    render(<HealthPage />);

    expect(
      screen.getByRole("button", { name: "Run system check" }),
    ).toBeDefined();
    expect(await screen.findByText("No active warnings")).toBeDefined();
    expect(
      screen.queryByText("No blocking issues right now"),
    ).not.toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByText("Google Calendar")).toBeDefined();
  });

  it("keeps real failures visible in repair focus", async () => {
    mocks.getHealthDashboard.mockResolvedValue(
      readyResult([
        {
          id: "auth",
          subsystem: "auth session",
          status: "critical",
          score: 0,
          summary: "Supabase auth is unavailable in the current client.",
          details: {
            summary: "Supabase auth is unavailable in the current client.",
          },
        },
        {
          id: "mock-mode",
          subsystem: "mock mode",
          status: "healthy",
          score: 100,
          summary: "Mock mode is available.",
          details: { summary: "Mock mode is available." },
        },
      ]),
    );

    render(<HealthPage />);

    expect(await screen.findByText("What needs attention now")).toBeDefined();
    expect(screen.getByRole("listitem")).toHaveTextContent(
      "auth session: Supabase auth is unavailable in the current client.",
    );
    expect(screen.queryByText("No blocking issues right now")).toBeNull();
  });

  it("does not show raw loader exceptions in the health error panel", async () => {
    mocks.getHealthDashboard.mockRejectedValue(
      new Error("jwt token sk-secret-123 stack trace"),
    );

    render(<HealthPage />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Health checks could not load");
    expect(alert).toHaveTextContent(
      "Unable to load health checks right now. Verify auth/session and storage mode, then retry.",
    );
    expect(alert).not.toHaveTextContent("sk-secret-123");
  });

  it("shows a visible disabled reason while a system check is running", async () => {
    let resolveDashboard: ((result: HealthDashboardResult) => void) | null =
      null;
    const pendingDashboard = new Promise<HealthDashboardResult>((resolve) => {
      resolveDashboard = resolve;
    });
    mocks.getHealthDashboard.mockReturnValue(pendingDashboard);

    render(<HealthPage />);

    const runButton = screen.getByRole("button", { name: "Run system check" });
    expect(runButton).toBeDisabled();
    expect(screen.getByText("Run in progress. Please wait.")).toBeDefined();

    if (!resolveDashboard) {
      throw new Error("resolveDashboard was not set.");
    }
    const finishDashboard = resolveDashboard as (
      result: HealthDashboardResult,
    ) => void;
    finishDashboard(
      readyResult([
        {
          id: "mock-mode",
          subsystem: "mock mode",
          status: "healthy",
          score: 100,
          summary: "Mock mode is available.",
          details: { informational: true, summary: "Mock mode is available." },
        },
      ]),
    );

    expect(await screen.findByText("System check complete.")).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Run system check" }),
    ).not.toBeDisabled();
  });

  it("moves from loading to error when health loading exceeds timeout", async () => {
    vi.useFakeTimers();
    mocks.getHealthDashboard.mockImplementation(
      () => new Promise<HealthDashboardResult>(() => {}),
    );

    render(<HealthPage />);

    expect(screen.getByText("Loading health...")).toBeDefined();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Health checks could not load");
    expect(alert).toHaveTextContent(
      "Health checks are taking too long. Verify your connection or session, then run the check again.",
    );
    expect(
      screen.getByRole("button", { name: "Run system check" }),
    ).not.toBeDisabled();
  });

  it("shows success feedback after a manual re-run", async () => {
    mocks.getHealthDashboard
      .mockResolvedValueOnce(
        readyResult([
          {
            id: "auth",
            subsystem: "auth session",
            status: "watch",
            score: 60,
            summary: "Sign in before checking Supabase areas.",
            details: { summary: "Sign in before checking Supabase areas." },
          },
        ]),
      )
      .mockResolvedValueOnce(
        readyResult([
          {
            id: "auth",
            subsystem: "auth session",
            status: "healthy",
            score: 100,
            summary: "Authenticated Supabase session is active.",
            details: { summary: "Authenticated Supabase session is active." },
          },
        ]),
      );

    render(<HealthPage />);

    expect(await screen.findByText("System check complete.")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Run system check" }));

    await waitFor(() => {
      expect(mocks.getHealthDashboard).toHaveBeenCalledTimes(2);
    });

    expect(await screen.findByText("System check complete.")).toBeDefined();
  });

  it("keeps the top health answer visually primary and the trust summary secondary", async () => {
    mocks.getHealthDashboard.mockResolvedValue(
      readyResult([
        {
          id: "auth",
          subsystem: "auth session",
          status: "healthy",
          score: 100,
          summary: "Authenticated Supabase session is active.",
          details: { summary: "Authenticated Supabase session is active." },
        },
      ]),
    );

    render(<HealthPage />);

    expect(await screen.findByTestId("health-reliability-card")).toHaveClass(
      "workflow-primary-card",
    );
    expect(screen.getByTestId("health-trust-summary-card")).toHaveClass(
      "workflow-secondary-card",
    );
  });
});
