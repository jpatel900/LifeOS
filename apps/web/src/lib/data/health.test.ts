import { beforeEach, describe, expect, it, vi } from "vitest";
import { getObservabilityHealthSnapshot } from "@/lib/observability";
import { logLearningWriteFailure } from "./workflow/shared";
import { resetLearningWriteFailures } from "./learningWriteFailures";
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
    // #692: the same three facts, now asserted through the plain-language
    // wording the person actually reads.
    expect(checkBySubsystem(result.checks, "areas").summary).toContain(
      "starter areas",
    );
    expect(checkBySubsystem(result.checks, "AI parser").summary).toContain(
      "turned off",
    );
    expect(
      checkBySubsystem(result.checks, "Google Calendar").summary,
    ).toContain("not set up");
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
    // #758: `health-check-record` reports on this very insert, so it is
    // appended after it and is deliberately absent from the persisted payload.
    // Re-anchored to that truth rather than dropped.
    expect(healthInsert).toHaveBeenCalledWith(
      result.checks
        .filter((check) => check.id !== "health-check-record")
        .map((check) => ({
          user_id: userId,
          area_id: null,
          subsystem: check.subsystem,
          status: check.status,
          score: check.score,
          details_json: check.details,
          checked_at: "2026-05-08T20:00:00.000Z",
        })),
    );
    // #758: a signed-in account never records "mock mode" against itself.
    expect(result.checks.map((check) => check.subsystem)).not.toContain(
      "mock mode",
    );
    expect(checkBySubsystem(result.checks, "on-device fallback").status).toBe(
      "healthy",
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
    expect(incidentCheck.summary).toContain("AI helper failed several times");
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
      "This account is not allowed to see that. Sign in again, or use the account this work belongs to.",
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
    // #692: the RPC name is a developer identifier, so it now lives only in
    // `details.missing` (the health screen's developer layer renders it) and
    // no longer in the sentence the person reads. The naming guarantee is
    // asserted on `details`, which is the stronger surface.
    expect(transitionRpcs.summary).not.toContain("accept_time_block_proposal");
    expect(transitionRpcs.summary).toContain(
      "1 action for moving work between steps is missing",
    );
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
    expect(calendar.summary).toContain("set up but not connected yet");
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

    // #692: the row still says the capture is on and still promises the
    // privacy guardrails — in words a non-technical reader can act on. The
    // vendor identity stays in `subsystem` / `details`, i.e. the developer layer.
    expect(checkBySubsystem(result.checks, "Sentry").summary).toContain(
      "Crash reports are on",
    );
    expect(checkBySubsystem(result.checks, "Sentry").summary).toContain(
      "never your screen, your typing, or your personal details",
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
    // #692: still a failure, still critical, still tells the person what to
    // do — without the vendor name or the word "authentication".
    expect(auth.summary).toBe(
      "Your sign-in could not be confirmed. Sign in again to continue.",
    );
    expect(auth.summary).not.toContain("sk-secret-123");
    expect(auth.summary).not.toMatch(/supabase/i);
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
    expect(check.summary).not.toMatch(/supabase|subsystem/i);
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
    // #692: the classification is untouched — a live-session auth failure is
    // still critical and still tells the person to sign in again. Only the
    // wording changed (no vendor name, no "authentication failed").
    expect(check.status).toBe("critical");
    expect(check.details.mode).not.toBe("signed_out");
    expect(check.summary).toBe(
      "Your sign-in could not be confirmed. Sign in again to continue.",
    );
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

/**
 * #758 — the honesty half. The grants bug is fixed by a migration; these tests
 * are about what this screen is allowed to CLAIM while its own reads and writes
 * are failing.
 */
describe("health dashboard honesty (#758)", () => {
  beforeEach(() => {
    resetLearningWriteFailures();
  });

  function signedInClient(
    overrides: (table: string) => unknown | undefined,
    healthInsertError: unknown = null,
  ) {
    const areasEq = vi.fn().mockResolvedValue({ data: [], error: null });
    const areasOrder = vi.fn().mockReturnValue({ eq: areasEq });

    return {
      from: vi.fn((table: string) => {
        const override = overrides(table);
        if (override) return override;
        if (table === "areas") {
          // `areas` is read twice with different chains: the area listing
          // (`.order(...).eq(...)`) and the core-read probe (`.limit(1)`).
          return {
            select: vi.fn().mockReturnValue({
              order: areasOrder,
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }
        if (table === "health_checks") {
          return {
            insert: vi.fn().mockResolvedValue({ error: healthInsertError }),
          };
        }
        if (table === "ai_call_traces") return readableTraceTable();
        return readableTable();
      }),
      rpc: vi.fn().mockResolvedValue({ data: null, error: rpcExistsError }),
      auth: {
        getUser: vi
          .fn()
          .mockResolvedValue({ data: { user: { id: userId } }, error: null }),
      },
    } as MinimalHealthSupabaseClient;
  }

  function deniedTable(message: string) {
    return {
      select: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue({
          data: null,
          error: { code: "42501", message },
        }),
      }),
    };
  }

  it("reports the audit trail as critical when the owner's own read is denied", async () => {
    const denialMessage = "permission denied for table suggestion_records";
    const result = await getHealthDashboard(
      signedInClient((table) =>
        table === "suggestion_records" || table === "override_records"
          ? deniedTable(
              table === "suggestion_records"
                ? denialMessage
                : "permission denied for table override_records",
            )
          : undefined,
      ),
      { now: () => fixedNow, supabaseConfigured: true },
    );

    const check = checkBySubsystem(result.checks, "meta-learning audit trail");
    expect(check.status).toBe("critical");
    expect(check.details.failed).toEqual([
      "suggestion_records",
      "override_records",
    ]);
    expect(check.details.failure_code).toBe("no_access");

    // The verdict the screen renders is derived from exactly this: at least one
    // non-healthy check means the headline can no longer say all-clear.
    expect(result.checks.some((item) => item.status !== "healthy")).toBe(true);
  });

  it("never puts a raw database message on the screen", async () => {
    const denialMessage = "permission denied for table suggestion_records";
    const result = await getHealthDashboard(
      signedInClient((table) =>
        table === "suggestion_records" ? deniedTable(denialMessage) : undefined,
      ),
      { now: () => fixedNow, supabaseConfigured: true },
    );

    for (const check of result.checks) {
      expect(check.summary).not.toContain(denialMessage);
      expect(check.summary).not.toMatch(/permission denied/i);
      expect(check.summary).not.toMatch(/42501/);
      expect(JSON.stringify(check.details)).not.toContain(denialMessage);
    }
  });

  it("counts silently-failed learning writes into a watch state", async () => {
    logLearningWriteFailure(new Error("boom"), {
      table: "suggestion_records",
    });
    logLearningWriteFailure(new Error("boom"), { table: "override_records" });

    const result = await getHealthDashboard(
      signedInClient(() => undefined),
      { now: () => fixedNow, supabaseConfigured: true },
    );

    const check = checkBySubsystem(result.checks, "meta-learning audit trail");
    expect(check.status).toBe("watch");
    expect(check.summary).toContain("2 decisions could not be added");
    expect(check.details.write_failures_this_page).toBe(2);
    expect(check.details.write_failure_tables).toEqual([
      "override_records",
      "suggestion_records",
    ]);
  });

  it("stays healthy and all-clear when every audit-trail read and write works", async () => {
    const result = await getHealthDashboard(
      signedInClient(() => undefined),
      { now: () => fixedNow, supabaseConfigured: true },
    );

    expect(
      checkBySubsystem(result.checks, "meta-learning audit trail").status,
    ).toBe("healthy");
    expect(
      result.checks
        .filter((check) => check.status !== "healthy")
        .map((check) => `${check.subsystem}:${check.status}`),
    ).toEqual([]);
  });

  it("makes a failed record of its own check part of the verdict, not just a footnote", async () => {
    const result = await getHealthDashboard(
      signedInClient(() => undefined, { message: "insert failed" }),
      { now: () => fixedNow, supabaseConfigured: true },
    );

    expect(result.persistence).toBe("unavailable");
    const check = checkBySubsystem(result.checks, "health check record");
    expect(check.status).toBe("watch");
    // The bug this closes: "Everything is working" rendered directly above
    // "a record of it could not be saved to your account".
    expect(result.checks.some((item) => item.status !== "healthy")).toBe(true);
  });

  it("does not record 'mock mode' against a signed-in account", async () => {
    const result = await getHealthDashboard(
      signedInClient(() => undefined),
      {
        now: () => fixedNow,
        supabaseConfigured: true,
      },
    );

    expect(result.checks.map((check) => check.subsystem)).not.toContain(
      "mock mode",
    );
    const fallback = checkBySubsystem(result.checks, "on-device fallback");
    expect(fallback.details.mode).toBe("account_with_fallback");
    expect(fallback.details.probed).toBe(false);

    // With no account at all, "mock mode" is the truthful name and stays.
    const mockResult = await getHealthDashboard(null, {
      now: () => fixedNow,
      supabaseConfigured: false,
    });
    expect(mockResult.checks.map((check) => check.subsystem)).toContain(
      "mock mode",
    );
  });
});
