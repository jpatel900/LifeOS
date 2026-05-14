import { render, screen } from "@testing-library/react";
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

    expect(await screen.findByText("No active warnings")).toBeDefined();
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

    expect(await screen.findByText("Repair focus")).toBeDefined();
    expect(screen.getByText("auth session: Supabase auth is unavailable in the current client.")).toBeDefined();
    expect(screen.queryByText("No active warnings")).toBeNull();
  });

  it("does not show raw loader exceptions in the health error panel", async () => {
    mocks.getHealthDashboard.mockRejectedValue(
      new Error("jwt token sk-secret-123 stack trace"),
    );

    render(<HealthPage />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Health checks could not load");
    expect(alert).toHaveTextContent(
      "Unable to load health checks right now. Verify auth/session and provider status, then retry.",
    );
    expect(alert).not.toHaveTextContent("sk-secret-123");
  });
});
