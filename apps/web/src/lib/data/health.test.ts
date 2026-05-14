import { describe, expect, it, vi } from "vitest";
import { getObservabilityHealthSnapshot } from "@/lib/observability";
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
      "Observability privacy",
      "Sentry",
      "PostHog",
      "Langfuse",
    ]);
    expect(checkBySubsystem(result.checks, "mock mode").status).toBe("healthy");
    expect(checkBySubsystem(result.checks, "supabase config").status).toBe(
      "watch",
    );
    expect(checkBySubsystem(result.checks, "areas").summary).toContain(
      "mock areas",
    );
    expect(checkBySubsystem(result.checks, "AI parser").summary).toContain(
      "not configured",
    );
    expect(
      checkBySubsystem(result.checks, "Google Calendar").summary,
    ).toContain("not configured");
    expect(
      checkBySubsystem(result.checks, "Google Calendar").details,
    ).toMatchObject({
      configured: false,
      connection_present: false,
    });
    expect(
      checkBySubsystem(result.checks, "Observability privacy").details,
    ).toMatchObject({
      active_provider_count: 0,
      active_providers: [],
      active_transport_modes: [],
      network_telemetry_enabled: false,
      session_replay_enabled: false,
      autocapture_enabled: false,
      ai_content_tracing_enabled: false,
    });
    expect(checkBySubsystem(result.checks, "Sentry").status).toBe("healthy");
    expect(checkBySubsystem(result.checks, "PostHog").status).toBe("healthy");
    expect(checkBySubsystem(result.checks, "Langfuse").status).toBe("healthy");
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
    expect(checkBySubsystem(result.checks, "auth session").status).toBe(
      "watch",
    );
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

  it("keeps Google Calendar health deterministic when config exists without OAuth connection metadata", async () => {
    const result = await getHealthDashboard(null, {
      now: () => fixedNow,
      supabaseConfigured: false,
      googleCalendarConfigured: true,
      googleCalendarConnectionPresent: false,
    });

    const calendar = checkBySubsystem(result.checks, "Google Calendar");
    expect(calendar.status).toBe("watch");
    expect(calendar.score).toBe(70);
    expect(calendar.summary).toContain("no connection metadata");
    expect(calendar.details).toMatchObject({
      configured: true,
      connection_present: false,
    });
  });

  it("shows observability readiness safely without exposing config values", async () => {
    const result = await getHealthDashboard(null, {
      now: () => fixedNow,
      supabaseConfigured: false,
      observability: getObservabilityHealthSnapshot({
        NODE_ENV: "production",
        NEXT_PUBLIC_SENTRY_DSN: "https://abc@example.ingest.sentry.io/123",
        NEXT_PUBLIC_POSTHOG_TOKEN: "phc_test_token",
        LANGFUSE_SECRET_KEY: "sk-lf-secret",
      }),
    });

    expect(checkBySubsystem(result.checks, "Sentry").summary).toContain(
      "sanitized error capture is enabled",
    );
    expect(checkBySubsystem(result.checks, "Sentry").details).toMatchObject({
      transport_mode: "sentry_sdk",
    });
    expect(checkBySubsystem(result.checks, "PostHog").status).toBe("watch");
    expect(checkBySubsystem(result.checks, "Langfuse").status).toBe("watch");

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("example.ingest.sentry.io/123");
    expect(serialized).not.toContain("phc_test_token");
    expect(serialized).not.toContain("sk-lf-secret");
  });

  it.each([
    {
      label: "Sentry only",
      env: {
        NEXT_PUBLIC_SENTRY_DSN: "https://abc@example.ingest.sentry.io/123",
      },
      activeProviders: ["sentry"],
      activeTransportModes: ["sentry_sdk"],
      expectedStates: {
        Sentry: "configured",
        PostHog: "disabled",
        Langfuse: "disabled",
      },
    },
    {
      label: "PostHog only",
      env: {
        NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
        NEXT_PUBLIC_POSTHOG_TOKEN: "phc_test_token",
      },
      activeProviders: ["posthog"],
      activeTransportModes: ["posthog_js"],
      expectedStates: {
        Sentry: "disabled",
        PostHog: "configured",
        Langfuse: "disabled",
      },
    },
    {
      label: "Langfuse only",
      env: {
        LANGFUSE_BASE_URL: "https://cloud.langfuse.com",
        LANGFUSE_PUBLIC_KEY: "pk-lf-public",
        LANGFUSE_SECRET_KEY: "sk-lf-secret",
      },
      activeProviders: ["langfuse"],
      activeTransportModes: ["langfuse_sdk"],
      expectedStates: {
        Sentry: "disabled",
        PostHog: "disabled",
        Langfuse: "configured",
      },
    },
    {
      label: "all providers enabled",
      env: {
        NEXT_PUBLIC_SENTRY_DSN: "https://abc@example.ingest.sentry.io/123",
        NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
        NEXT_PUBLIC_POSTHOG_TOKEN: "phc_test_token",
        LANGFUSE_BASE_URL: "https://cloud.langfuse.com",
        LANGFUSE_PUBLIC_KEY: "pk-lf-public",
        LANGFUSE_SECRET_KEY: "sk-lf-secret",
      },
      activeProviders: ["sentry", "posthog", "langfuse"],
      activeTransportModes: ["sentry_sdk", "posthog_js", "langfuse_sdk"],
      expectedStates: {
        Sentry: "configured",
        PostHog: "configured",
        Langfuse: "configured",
      },
    },
  ])(
    "reports provider-state health safely for $label",
    async ({ env, activeProviders, activeTransportModes, expectedStates }) => {
      const result = await getHealthDashboard(null, {
        now: () => fixedNow,
        observability: getObservabilityHealthSnapshot(env),
        supabaseConfigured: false,
      });

      expect(
        checkBySubsystem(result.checks, "Observability privacy").details,
      ).toMatchObject({
        active_provider_count: activeProviders.length,
        active_providers: activeProviders,
        active_transport_modes: activeTransportModes,
        network_telemetry_enabled: activeProviders.length > 0,
      });
      expect(checkBySubsystem(result.checks, "Sentry").details).toMatchObject({
        provider_state: expectedStates.Sentry,
      });
      expect(checkBySubsystem(result.checks, "PostHog").details).toMatchObject({
        provider_state: expectedStates.PostHog,
      });
      expect(checkBySubsystem(result.checks, "Langfuse").details).toMatchObject({
        provider_state: expectedStates.Langfuse,
      });

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain("example.ingest.sentry.io/123");
      expect(serialized).not.toContain("phc_test_token");
      expect(serialized).not.toContain("sk-lf-secret");
      expect(serialized).not.toContain("pk-lf-public");
    },
  );
});
