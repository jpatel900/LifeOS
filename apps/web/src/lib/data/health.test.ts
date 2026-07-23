import { describe, expect, it, vi } from "vitest";
import { getObservabilityHealthSnapshot } from "@/lib/observability";
import {
  deriveProviderIncidents,
  getHealthDashboard,
  type HealthDashboardCheck,
  type MinimalHealthSupabaseClient,
} from "./health";

const userId = "550e8400-e29b-41d4-a716-446655440001";
const rpcExistsError = { message: "task not found" };
const fixedNow = new Date("2026-05-08T20:00:00.000Z");

function readableTraceTable(data: unknown[] = []) {
  return {
    select: vi.fn().mockReturnValue({
      gte: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data, error: null }),
        }),
      }),
    }),
  };
}

function readableTable() {
  return {
    select: vi.fn().mockReturnValue({
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
  };
}

function checkBySubsystem(checks: HealthDashboardCheck[], subsystem: string) {
  const check = checks.find((item) => item.subsystem === subsystem);
  expect(check).toBeDefined();
  return check!;
}

describe("deriveProviderIncidents", () => {
  it("detects three failed traces inside an inclusive 30-minute rolling window", () => {
    const incidents = deriveProviderIncidents(
      [
        {
          feature: "parse",
          status: "failed",
          created_at: "2026-05-08T19:00:00.000Z",
          latency_ms: 500,
        },
        {
          feature: "parse",
          status: "failed",
          created_at: "2026-05-08T19:15:00.000Z",
          latency_ms: 600,
        },
        {
          feature: "parse",
          status: "failed",
          created_at: "2026-05-08T19:30:00.000Z",
          latency_ms: 700,
        },
      ],
      fixedNow,
    );

    expect(incidents).toEqual([
      {
        feature: "parse",
        failedCount: 3,
        windowStartedAt: "2026-05-08T19:00:00.000Z",
        windowEndedAt: "2026-05-08T19:30:00.000Z",
        latestFailedAt: "2026-05-08T19:30:00.000Z",
        latestLatencyMs: 700,
      },
    ]);
  });

  it("keeps mixed features separate and clears the incident after recovery", () => {
    const incidents = deriveProviderIncidents(
      [
        {
          feature: "parse",
          status: "failed",
          created_at: "2026-05-08T19:00:00.000Z",
        },
        {
          feature: "task_map_draft",
          status: "failed",
          created_at: "2026-05-08T19:01:00.000Z",
        },
        {
          feature: "parse",
          status: "failed",
          created_at: "2026-05-08T19:10:00.000Z",
        },
        {
          feature: "task_map_draft",
          status: "failed",
          created_at: "2026-05-08T19:11:00.000Z",
        },
        {
          feature: "parse",
          status: "failed",
          created_at: "2026-05-08T19:20:00.000Z",
        },
        {
          feature: "task_map_draft",
          status: "failed",
          created_at: "2026-05-08T19:21:00.000Z",
        },
        {
          feature: "parse",
          status: "passed",
          created_at: "2026-05-08T19:35:00.000Z",
        },
      ],
      fixedNow,
    );

    expect(incidents.map((incident) => incident.feature)).toEqual([
      "task_map_draft",
    ]);
  });

  it("does not detect failures outside one 30-minute window", () => {
    expect(
      deriveProviderIncidents(
        [
          {
            feature: "parse",
            status: "failed",
            created_at: "2026-05-08T18:00:00.000Z",
          },
          {
            feature: "parse",
            status: "failed",
            created_at: "2026-05-08T18:31:00.000Z",
          },
          {
            feature: "parse",
            status: "failed",
            created_at: "2026-05-08T19:02:00.000Z",
          },
        ],
        fixedNow,
      ),
    ).toEqual([]);
  });
});

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
      "healthy",
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
      "healthy",
    );
    expect(checkBySubsystem(result.checks, "areas").status).toBe("healthy");
    expect(checkBySubsystem(result.checks, "capture persistence").status).toBe(
      "healthy",
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
      if (table === "ai_call_traces") return readableTraceTable();
      return readableTable();
    });

    const result = await getHealthDashboard(
      {
        from,
        rpc: vi.fn().mockResolvedValue({ data: null, error: rpcExistsError }),
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

  it("surfaces repeated AI-provider failures from persisted trace data", async () => {
    const areasEq = vi.fn().mockResolvedValue({ data: [], error: null });
    const areasOrder = vi.fn().mockReturnValue({ eq: areasEq });
    const areasSelect = vi.fn().mockReturnValue({ order: areasOrder });
    const captureLimit = vi.fn().mockResolvedValue({ data: [], error: null });
    const captureSelect = vi.fn().mockReturnValue({ limit: captureLimit });
    const healthInsert = vi.fn().mockResolvedValue({ error: null });
    const traceTable = readableTraceTable([
      {
        surface: "parse",
        validation_outcome: "failed",
        created_at: "2026-05-08T19:00:00.000Z",
        latency_ms: 800,
      },
      {
        surface: "parse",
        validation_outcome: "failed",
        created_at: "2026-05-08T19:12:00.000Z",
        latency_ms: 900,
      },
      {
        surface: "parse",
        validation_outcome: "failed",
        created_at: "2026-05-08T19:24:00.000Z",
        latency_ms: 1000,
      },
    ]);
    const from = vi.fn((table: string) => {
      if (table === "areas") return { select: areasSelect };
      if (table === "capture_items") return { select: captureSelect };
      if (table === "health_checks") return { insert: healthInsert };
      if (table === "ai_call_traces") return traceTable;
      return readableTable();
    });

    const result = await getHealthDashboard(
      {
        from,
        rpc: vi.fn().mockResolvedValue({ data: null, error: rpcExistsError }),
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

    const incidentCheck = checkBySubsystem(
      result.checks,
      "AI provider incidents",
    );
    expect(from).toHaveBeenCalledWith("ai_call_traces");
    expect(incidentCheck.status).toBe("watch");
    expect(incidentCheck.summary).toContain("AI provider incident");
    expect(incidentCheck.details).toMatchObject({
      incident_count: 1,
      affected_features: ["parse"],
      latest_failed_at: "2026-05-08T19:24:00.000Z",
      window_minutes: 30,
      threshold: 3,
    });
  });

  it("accepts Supabase area timestamps with offsets during signed-in health reads", async () => {
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
          created_at: "2026-05-07T00:00:00.000-04:00",
          updated_at: "2026-05-07T00:00:00.000-04:00",
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
      if (table === "ai_call_traces") return readableTraceTable();
      return readableTable();
    });

    const result = await getHealthDashboard(
      {
        from,
        rpc: vi.fn().mockResolvedValue({ data: null, error: rpcExistsError }),
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

    expect(result.persistence).toBe("persisted");
    expect(checkBySubsystem(result.checks, "areas").status).toBe("healthy");
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
      if (table === "ai_call_traces") return readableTraceTable();
      return readableTable();
    });

    const result = await getHealthDashboard(
      {
        from,
        rpc: vi.fn().mockResolvedValue({ data: null, error: rpcExistsError }),
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
    expect(result.persistenceMessage).toBe(
      "Supabase denied access for this user/session.",
    );
    expect(checkBySubsystem(result.checks, "areas").status).toBe("healthy");
  });

  it("classifies missing transition RPCs as named persisted-mode failures", async () => {
    const healthInsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn((table: string) => {
      if (table === "areas") {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }
      if (table === "health_checks") return { insert: healthInsert };
      if (table === "ai_call_traces") return readableTraceTable();
      return readableTable();
    });
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST202", message: "Could not find the function" },
      })
      .mockResolvedValue({ data: null, error: rpcExistsError });

    const result = await getHealthDashboard(
      {
        from,
        rpc,
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: userId } },
            error: null,
          }),
        },
      } as MinimalHealthSupabaseClient,
      { now: () => fixedNow, supabaseConfigured: true },
    );

    const transitionRpcs = checkBySubsystem(result.checks, "transition RPCs");
    expect(transitionRpcs.status).toBe("critical");
    expect(transitionRpcs.summary).toContain("accept_time_block_proposal");
    expect(transitionRpcs.details).toMatchObject({
      missing: ["accept_time_block_proposal"],
    });
    expect(result.persistence).toBe("persisted");
  });

  it("keeps Google Calendar health deterministic when config exists without OAuth connection metadata", async () => {
    const result = await getHealthDashboard(null, {
      now: () => fixedNow,
      supabaseConfigured: false,
      googleCalendarConfigured: true,
      googleCalendarConnectionPresent: false,
    });

    const calendar = checkBySubsystem(result.checks, "Google Calendar");
    expect(calendar.status).toBe("healthy");
    expect(calendar.score).toBe(100);
    expect(calendar.summary).toContain("no active connection metadata");
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

  it("normalizes auth/read failures without echoing raw sensitive text", async () => {
    const secretLikeMessage =
      "JWT expired for token sk-secret-123 and authorization failed";
    const result = await getHealthDashboard(
      {
        from: vi.fn(),
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: { message: secretLikeMessage },
          }),
        },
      } as MinimalHealthSupabaseClient,
      {
        now: () => fixedNow,
        supabaseConfigured: true,
      },
    );

    const auth = checkBySubsystem(result.checks, "auth session");
    expect(auth.status).toBe("critical");
    expect(auth.summary).toContain("authentication failed");
    expect(auth.summary).not.toContain("sk-secret-123");
    expect(JSON.stringify(result)).not.toContain(secretLikeMessage);
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
      expect(checkBySubsystem(result.checks, "Langfuse").details).toMatchObject(
        {
          provider_state: expectedStates.Langfuse,
        },
      );

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain("example.ingest.sentry.io/123");
      expect(serialized).not.toContain("phc_test_token");
      expect(serialized).not.toContain("sk-lf-secret");
      expect(serialized).not.toContain("pk-lf-public");
    },
  );
});

// #688: the owner's reported symptom — "auth session: Supabase authentication
// failed while checking this subsystem" on a merely signed-out session.
// supabase-js reports no-session as an ERROR from getUser(), and that message
// contains "auth", so it used to normalize into critical failure language.
describe("signed-out auth session is calm, not a failure (#688)", () => {
  it("classifies supabase's missing-session error as informational signed-out", async () => {
    const getUser = vi.fn().mockResolvedValue({
      data: { user: null },
      error: new Error("Auth session missing!"),
    });

    const result = await getHealthDashboard(
      { from: vi.fn(), auth: { getUser } } as MinimalHealthSupabaseClient,
      { now: () => fixedNow, supabaseConfigured: true },
    );

    const check = checkBySubsystem(result.checks, "auth session");
    expect(check.status).toBe("healthy");
    expect(check.details.mode).toBe("signed_out");
    expect(check.summary).toBe(
      "You're not signed in. Work is saving on this device only.",
    );
    // The exact failure wording the owner saw must be gone.
    expect(check.summary).not.toMatch(/authentication failed/i);
  });

  it("keeps failure language for a real auth failure with a live session", async () => {
    const getUser = vi.fn().mockResolvedValue({
      data: { user: null },
      error: new Error("JWT expired: token is no longer valid"),
    });

    const result = await getHealthDashboard(
      { from: vi.fn(), auth: { getUser } } as MinimalHealthSupabaseClient,
      { now: () => fixedNow, supabaseConfigured: true },
    );

    const check = checkBySubsystem(result.checks, "auth session");
    expect(check.status).toBe("critical");
    expect(check.summary).toMatch(/authentication failed/i);
  });

  it("signed-out areas and capture checks stay informational with a sign-in step", async () => {
    const getUser = vi.fn().mockResolvedValue({
      data: { user: null },
      error: new Error("Auth session missing!"),
    });

    const result = await getHealthDashboard(
      { from: vi.fn(), auth: { getUser } } as MinimalHealthSupabaseClient,
      { now: () => fixedNow, supabaseConfigured: true },
    );

    for (const subsystem of ["areas", "capture persistence"]) {
      const check = checkBySubsystem(result.checks, subsystem);
      expect(check.status).toBe("healthy");
      expect(check.details.mode).toBe("signed_out");
      expect(check.summary).toMatch(/^Sign in to check/);
    }
  });
});
