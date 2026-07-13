import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HealthPage from "../app/health/page";
import { AppShell } from "../app/components/AppShell";

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

describe("Health cockpit", () => {
  it("leads with the grouped health answer and hides full detail behind disclosure", async () => {
    render(
      <AppShell>
        <HealthPage />
      </AppShell>,
    );

    expect(await screen.findByText("3 checks need attention")).toBeDefined();
    expect(screen.getByText("auth")).toBeDefined();
    expect(screen.getByText("database")).toBeDefined();
    expect(screen.getByText("ai_parsing")).toBeDefined();
    expect(screen.getByText("Full breakdown")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Run system check" }));
    expect(
      screen.getByRole("button", { name: "Run system check" }),
    ).toBeDefined();
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
            "Missing transition RPC: accept_time_block_proposal. Apply the pending Supabase migrations, then rerun the system check.",
          details: {},
        },
        {
          id: "health-core-reads",
          subsystem: "core table reads",
          status: "healthy",
          score: 100,
          summary:
            "Core user-owned workflow tables are readable for the active session.",
          details: {},
        },
      ],
    });

    render(
      <AppShell>
        <HealthPage />
      </AppShell>,
    );

    expect(
      (await screen.findAllByText("transition RPCs")).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/Missing transition RPC/).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText("Persisted health snapshot for this session."),
    ).toBeDefined();
    expect(screen.queryByText("auth")).toBeNull();
    expect(screen.queryByText("database")).toBeNull();
    expect(screen.queryByText("ai_parsing")).toBeNull();
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
            "Missing transition RPC: accept_time_block_proposal. Apply the pending Supabase migrations, then rerun the system check.",
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
          summary:
            "Required transition RPCs are callable without mutating workflow data.",
          details: {},
        },
      ],
    });

    render(
      <AppShell>
        <HealthPage />
      </AppShell>,
    );

    expect(
      (await screen.findAllByText(/Missing transition RPC/)).length,
    ).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Run system check" }));
    expect(
      (
        await screen.findAllByText(
          "Required transition RPCs are callable without mutating workflow data.",
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.queryAllByText(/Missing transition RPC/)).toHaveLength(0);
    expect(mocks.getHealthDashboard).toHaveBeenCalledTimes(2);
  });
});
