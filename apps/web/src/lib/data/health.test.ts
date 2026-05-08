import { describe, expect, it, vi } from "vitest";
import {
  getHealthDashboard,
  type HealthDashboardCheck,
  type MinimalHealthSupabaseClient,
} from "./health";

const userId = "550e8400-e29b-41d4-a716-446655440001";
const fixedNow = new Date("2026-05-08T20:00:00.000Z");

function checkBySubsystem(checks: HealthDashboardCheck[], subsystem: string) {
  const check = checks.find((item) => item.subsystem === subsystem);
  expect(check).toBeDefined();
  return check!;
}

describe("health dashboard data provider", () => {
  it("builds deterministic mock-mode health checks without Supabase", async () => {
    const result = await getHealthDashboard(null, {
      now: () => fixedNow,
      supabaseConfigured: false,
    });

    expect(result.provider).toBe("mock");
    expect(result.persistence).toBe("not_applicable");
    expect(result.checkedAt).toBe("2026-05-08T20:00:00.000Z");
    expect(result.checks.map((check) => check.subsystem)).toEqual([
      "mock mode",
      "supabase config",
      "auth session",
      "areas",
      "capture persistence",
      "AI parser",
      "Google Calendar",
    ]);
    expect(checkBySubsystem(result.checks, "mock mode").status).toBe("healthy");
    expect(checkBySubsystem(result.checks, "supabase config").status).toBe("watch");
    expect(checkBySubsystem(result.checks, "areas").summary).toContain(
      "mock areas",
    );
    expect(checkBySubsystem(result.checks, "AI parser").summary).toContain(
      "not configured",
    );
    expect(checkBySubsystem(result.checks, "Google Calendar").summary).toContain(
      "not configured",
    );
  });

  it("separates configured Supabase from missing auth/session state", async () => {
    const getUser = vi.fn().mockResolvedValue({
      data: { user: null },
      error: null,
    });
    const from = vi.fn();

    const result = await getHealthDashboard(
      { from, auth: { getUser } } as MinimalHealthSupabaseClient,
      {
        now: () => fixedNow,
        supabaseConfigured: true,
      },
    );

    expect(result.provider).toBe("supabase");
    expect(result.persistence).toBe("skipped");
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(from).not.toHaveBeenCalled();
    expect(checkBySubsystem(result.checks, "supabase config").status).toBe(
      "healthy",
    );
    expect(checkBySubsystem(result.checks, "auth session").status).toBe("watch");
    expect(checkBySubsystem(result.checks, "areas").status).toBe("watch");
    expect(checkBySubsystem(result.checks, "capture persistence").status).toBe(
      "watch",
    );
  });

  it("reads areas and capture status before persisting health checks", async () => {
    const areasEq = vi.fn().mockResolvedValue({
      data: [
        {
          id: "550e8400-e29b-41d4-a716-446655440101",
          user_id: userId,
          name: "Main Job",
          slug: "main-job",
          description: null,
          color: "#2563eb",
          icon: "briefcase",
          sort_order: 0,
          is_active: true,
          created_at: "2026-05-07T00:00:00.000Z",
          updated_at: "2026-05-07T00:00:00.000Z",
        },
      ],
      error: null,
    });
    const areasOrder = vi.fn().mockReturnValue({ eq: areasEq });
    const areasSelect = vi.fn().mockReturnValue({ order: areasOrder });

    const captureLimit = vi.fn().mockResolvedValue({ data: [], error: null });
    const captureSelect = vi.fn().mockReturnValue({ limit: captureLimit });

    const healthInsert = vi.fn().mockResolvedValue({ error: null });

    const from = vi.fn((table: string) => {
      if (table === "areas") return { select: areasSelect };
      if (table === "capture_items") return { select: captureSelect };
      if (table === "health_checks") return { insert: healthInsert };
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await getHealthDashboard(
      {
        from,
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: userId } },
            error: null,
          }),
        },
      } as MinimalHealthSupabaseClient,
      {
        now: () => fixedNow,
        supabaseConfigured: true,
      },
    );

    expect(from).toHaveBeenCalledWith("areas");
    expect(from).toHaveBeenCalledWith("capture_items");
    expect(from).toHaveBeenCalledWith("health_checks");
    expect(areasSelect).toHaveBeenCalledWith(
      "id,user_id,name,slug,description,color,icon,sort_order,is_active,created_at,updated_at",
    );
    expect(areasOrder).toHaveBeenCalledWith("sort_order", { ascending: true });
    expect(areasEq).toHaveBeenCalledWith("is_active", true);
    expect(captureSelect).toHaveBeenCalledWith("id");
    expect(captureLimit).toHaveBeenCalledWith(1);
    expect(result.persistence).toBe("persisted");
    expect(checkBySubsystem(result.checks, "areas").status).toBe("healthy");
    expect(checkBySubsystem(result.checks, "capture persistence").status).toBe(
      "healthy",
    );
    expect(healthInsert).toHaveBeenCalledWith(
      result.checks.map((check) => ({
        user_id: userId,
        area_id: null,
        subsystem: check.subsystem,
        status: check.status,
        score: check.score,
        details_json: check.details,
        checked_at: "2026-05-08T20:00:00.000Z",
      })),
    );
  });

  it("does not fail the dashboard when health_check persistence is unavailable", async () => {
    const areasEq = vi.fn().mockResolvedValue({ data: [], error: null });
    const areasOrder = vi.fn().mockReturnValue({ eq: areasEq });
    const areasSelect = vi.fn().mockReturnValue({ order: areasOrder });
    const captureLimit = vi.fn().mockResolvedValue({ data: [], error: null });
    const captureSelect = vi.fn().mockReturnValue({ limit: captureLimit });
    const healthInsert = vi
      .fn()
      .mockResolvedValue({ error: { message: "permission denied" } });
    const from = vi.fn((table: string) => {
      if (table === "areas") return { select: areasSelect };
      if (table === "capture_items") return { select: captureSelect };
      if (table === "health_checks") return { insert: healthInsert };
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await getHealthDashboard(
      {
        from,
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: userId } },
            error: null,
          }),
        },
      } as MinimalHealthSupabaseClient,
      {
        now: () => fixedNow,
        supabaseConfigured: true,
      },
    );

    expect(result.persistence).toBe("unavailable");
    expect(result.persistenceMessage).toBe("permission denied");
    expect(checkBySubsystem(result.checks, "areas").status).toBe("watch");
  });
});
