import { AreaSchema, type HealthCheck } from "@lifeos/schemas";
import {
  getObservabilityHealthSnapshot,
  type ObservabilityHealthSnapshot,
  type ObservabilityProviderStatus,
} from "@/lib/observability";
import type { DataProvider } from "./workflow";

type HealthStatus = HealthCheck["status"];

export type HealthPersistenceStatus =
  | "not_applicable"
  | "skipped"
  | "persisted"
  | "unavailable";

export interface HealthDashboardCheck {
  id: string;
  subsystem: string;
  status: HealthStatus;
  score: number;
  summary: string;
  details: Record<string, string | number | boolean | string[] | null>;
}

export interface HealthDashboardResult {
  provider: DataProvider;
  checkedAt: string;
  checks: HealthDashboardCheck[];
  persistence: HealthPersistenceStatus;
  persistenceMessage: string | null;
}

export interface MinimalHealthSupabaseClient {
  from: (table: string) => unknown;
  auth?: {
    getUser: () => Promise<{
      data: { user: { id: string } | null };
      error: { message: string } | null;
    }>;
  };
}

interface HealthDashboardOptions {
  now?: () => Date;
  supabaseConfigured?: boolean;
  aiParserConfigured?: boolean;
  googleCalendarConfigured?: boolean;
  googleCalendarConnectionPresent?: boolean;
  observability?: ObservabilityHealthSnapshot;
}

const areaColumns =
  "id,user_id,name,slug,description,color,icon,sort_order,is_active,created_at,updated_at";

function getErrorMessage(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "Supabase request failed.";
}

function makeCheck(
  id: string,
  subsystem: string,
  status: HealthStatus,
  score: number,
  summary: string,
  details: HealthDashboardCheck["details"] = {},
): HealthDashboardCheck {
  return {
    id,
    subsystem,
    status,
    score,
    summary,
    details: {
      summary,
      ...details,
    },
  };
}

function configuredCheck(supabaseConfigured: boolean) {
  return supabaseConfigured
    ? makeCheck(
        "health-supabase-config",
        "supabase config",
        "healthy",
        100,
        "Supabase public URL and anon key are present.",
        { repair_steps: [] },
      )
    : makeCheck(
        "health-supabase-config",
        "supabase config",
        "watch",
        60,
        "Supabase config is missing; the app is using mock mode.",
        {
          repair_steps: [
            "Set NEXT_PUBLIC_SUPABASE_URL.",
            "Set NEXT_PUBLIC_SUPABASE_ANON_KEY.",
          ],
        },
      );
}

function integrationCheck(
  id: string,
  subsystem: string,
  configured: boolean,
  summary: string,
) {
  return configured
    ? makeCheck(id, subsystem, "healthy", 100, summary, { configured: true })
    : makeCheck(id, subsystem, "watch", 50, summary, {
        configured: false,
        repair_steps: ["Configure this integration in a later approved phase."],
      });
}

function googleCalendarCheck(options: HealthDashboardOptions) {
  const configured = options.googleCalendarConfigured ?? false;
  const connectionPresent = options.googleCalendarConnectionPresent ?? false;

  if (!configured) {
    return makeCheck(
      "health-google-calendar",
      "Google Calendar",
      "watch",
      50,
      "Google Calendar is not configured; planning remains local-only.",
      {
        configured: false,
        connection_present: false,
        repair_steps: ["Configure this integration in a later approved phase."],
      },
    );
  }

  if (!connectionPresent) {
    return makeCheck(
      "health-google-calendar",
      "Google Calendar",
      "watch",
      70,
      "Google Calendar config is present, but no connection metadata is active.",
      {
        configured: true,
        connection_present: false,
        repair_steps: [
          "Connect Google Calendar in a later approved OAuth phase.",
        ],
      },
    );
  }

  return makeCheck(
    "health-google-calendar",
    "Google Calendar",
    "healthy",
    100,
    "Google Calendar connection metadata is active.",
    {
      configured: true,
      connection_present: true,
      repair_steps: [],
    },
  );
}

function getObservabilityCheckStatus(provider: ObservabilityProviderStatus) {
  switch (provider.state) {
    case "disabled":
      return { status: "healthy" as const, score: 100 };
    case "configured":
      return { status: "healthy" as const, score: 100 };
    case "missing_config":
      return { status: "watch" as const, score: 60 };
    case "invalid_config":
      return { status: "watch" as const, score: 30 };
  }
}

function getObservabilityProviderSummary(provider: ObservabilityProviderStatus) {
  switch (provider.state) {
    case "disabled":
      return provider.provider === "sentry"
        ? "Sentry DSN is absent; sanitized error export is disabled."
        : provider.provider === "posthog"
          ? "PostHog public config is absent; manual product analytics is disabled."
        : `${provider.provider} is disabled; vendor telemetry stays off by default.`;
    case "configured":
      return provider.provider === "sentry"
        ? "Sentry DSN is present; sanitized error capture is enabled with replay, tracing, and default PII off."
        : provider.provider === "posthog"
          ? "PostHog public config is present; manual analytics is enabled with autocapture, replay, heatmaps, dead clicks, and console logs off."
        : `${provider.provider} config is present, but this provider remains disabled in the current phase.`;
    case "missing_config":
      return `${provider.provider} has partial configuration. Complete the config before any future enablement.`;
    case "invalid_config":
      return `${provider.provider} config is invalid. Fix the config before enablement.`;
  }
}

function observabilityChecks(snapshot: ObservabilityHealthSnapshot) {
  const checks = [
    makeCheck(
      "health-observability-privacy",
      "Observability privacy",
      "healthy",
      100,
      snapshot.guardrails.networkTelemetryEnabled
        ? "Selective sanitized telemetry may be enabled, but replay, autocapture, tracing, and AI content export remain off."
        : "Replay, autocapture, AI content tracing, and vendor telemetry remain disabled.",
      {
        ai_content_tracing_enabled:
          snapshot.guardrails.aiContentTracingEnabled,
        autocapture_enabled: snapshot.guardrails.autocaptureEnabled,
        environment: snapshot.environmentName,
        network_telemetry_enabled:
          snapshot.guardrails.networkTelemetryEnabled,
        session_replay_enabled: snapshot.guardrails.sessionReplayEnabled,
        transport_mode:
          snapshot.providers.find((provider) => provider.provider === "sentry")
            ?.transportMode ?? "noop",
      },
    ),
  ];

  for (const provider of snapshot.providers) {
    const health = getObservabilityCheckStatus(provider);

    checks.push(
      makeCheck(
        `health-observability-${provider.provider}`,
        provider.provider === "posthog"
          ? "PostHog"
          : provider.provider === "langfuse"
            ? "Langfuse"
            : "Sentry",
        health.status,
        health.score,
        getObservabilityProviderSummary(provider),
        {
          environment: snapshot.environmentName,
          invalid_key_count: provider.invalidKeys.length,
          missing_key_count: provider.missingKeys.length,
          provider: provider.provider,
          provider_state: provider.state,
          transport_mode: provider.transportMode,
        },
      ),
    );
  }

  return checks;
}

async function readAreas(client: MinimalHealthSupabaseClient) {
  const query = client.from("areas") as {
    select: (columns: string) => {
      order: (
        column: string,
        options: { ascending: boolean },
      ) => {
        eq: (
          column: string,
          value: boolean,
        ) => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };

  const { data, error } = await query
    .select(areaColumns)
    .order("sort_order", { ascending: true })
    .eq("is_active", true);

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  return AreaSchema.array().parse(data);
}

async function readCaptureStatus(client: MinimalHealthSupabaseClient) {
  const query = client.from("capture_items") as {
    select: (columns: string) => {
      limit: (count: number) => Promise<{ data: unknown; error: unknown }>;
    };
  };

  const { error } = await query.select("id").limit(1);

  if (error) {
    throw new Error(getErrorMessage(error));
  }
}

async function persistHealthChecks(
  client: MinimalHealthSupabaseClient,
  userId: string,
  checks: HealthDashboardCheck[],
  checkedAt: string,
) {
  const query = client.from("health_checks") as {
    insert: (rows: Record<string, unknown>[]) => Promise<{ error: unknown }>;
  };

  const { error } = await query.insert(
    checks.map((check) => ({
      user_id: userId,
      area_id: null,
      subsystem: check.subsystem,
      status: check.status,
      score: check.score,
      details_json: check.details,
      checked_at: checkedAt,
    })),
  );

  if (error) {
    return getErrorMessage(error);
  }

  return null;
}

export async function getHealthDashboard(
  client: MinimalHealthSupabaseClient | null,
  options: HealthDashboardOptions = {},
): Promise<HealthDashboardResult> {
  const checkedAt = (options.now ?? (() => new Date()))().toISOString();
  const observability =
    options.observability ?? getObservabilityHealthSnapshot();
  const supabaseConfigured = options.supabaseConfigured ?? client !== null;
  const checks: HealthDashboardCheck[] = [
    makeCheck(
      "health-mock-mode",
      "mock mode",
      "healthy",
      100,
      "Mock mode is available as the deterministic fallback path.",
      { available: true, repair_steps: [] },
    ),
    configuredCheck(supabaseConfigured),
  ];

  if (!client) {
    checks.push(
      makeCheck(
        "health-auth-session",
        "auth session",
        "watch",
        60,
        "No Supabase session is active because Supabase config is missing.",
        {
          authenticated: false,
          repair_steps: ["Configure Supabase and sign in."],
        },
      ),
      makeCheck(
        "health-areas",
        "areas",
        "healthy",
        100,
        "Default mock areas are readable.",
        { source: "mock", repair_steps: [] },
      ),
      makeCheck(
        "health-capture-persistence",
        "capture persistence",
        "healthy",
        90,
        "Capture persistence is available through browser mock workflow state.",
        { source: "mock", repair_steps: [] },
      ),
      integrationCheck(
        "health-ai-parser",
        "AI parser",
        options.aiParserConfigured ?? false,
        "AI parser is not configured in Phase 4E; parsing remains deterministic mock logic.",
      ),
      googleCalendarCheck(options),
      ...observabilityChecks(observability),
    );

    return {
      provider: "mock",
      checkedAt,
      checks,
      persistence: "not_applicable",
      persistenceMessage: null,
    };
  }

  let userId: string | null = null;

  if (!client.auth) {
    checks.push(
      makeCheck(
        "health-auth-session",
        "auth session",
        "critical",
        0,
        "Supabase auth is unavailable in the current client.",
        { repair_steps: ["Recreate the Supabase browser client."] },
      ),
    );
  } else {
    const { data, error } = await client.auth.getUser();
    if (error) {
      checks.push(
        makeCheck(
          "health-auth-session",
          "auth session",
          "critical",
          0,
          getErrorMessage(error),
          { authenticated: false, repair_steps: ["Sign in again."] },
        ),
      );
    } else if (!data.user) {
      checks.push(
        makeCheck(
          "health-auth-session",
          "auth session",
          "watch",
          60,
          "Supabase is configured, but no user session is active.",
          { authenticated: false, repair_steps: ["Sign in on /login."] },
        ),
      );
    } else {
      userId = data.user.id;
      checks.push(
        makeCheck(
          "health-auth-session",
          "auth session",
          "healthy",
          100,
          "Authenticated Supabase session is active.",
          { authenticated: true, repair_steps: [] },
        ),
      );
    }
  }

  if (userId) {
    try {
      const areas = await readAreas(client);
      checks.push(
        areas.length > 0
          ? makeCheck(
              "health-areas",
              "areas",
              "healthy",
              100,
              `${areas.length} active area${areas.length === 1 ? "" : "s"} readable from Supabase.`,
              {
                source: "supabase",
                active_area_count: areas.length,
                repair_steps: [],
              },
            )
          : makeCheck(
              "health-areas",
              "areas",
              "watch",
              65,
              "Supabase areas are readable, but no active areas exist.",
              {
                source: "supabase",
                active_area_count: 0,
                repair_steps: ["Create or reactivate at least one area."],
              },
            ),
      );
    } catch (error) {
      checks.push(
        makeCheck(
          "health-areas",
          "areas",
          "critical",
          0,
          error instanceof Error
            ? error.message
            : "Unable to read Supabase areas.",
          {
            source: "supabase",
            repair_steps: ["Check local Supabase and RLS access."],
          },
        ),
      );
    }

    try {
      await readCaptureStatus(client);
      checks.push(
        makeCheck(
          "health-capture-persistence",
          "capture persistence",
          "healthy",
          100,
          "capture_items is readable for the active user.",
          { source: "supabase", repair_steps: [] },
        ),
      );
    } catch (error) {
      checks.push(
        makeCheck(
          "health-capture-persistence",
          "capture persistence",
          "critical",
          0,
          error instanceof Error
            ? error.message
            : "Unable to check capture_items access.",
          {
            source: "supabase",
            repair_steps: ["Check capture_items grants, RLS, and auth state."],
          },
        ),
      );
    }
  } else {
    checks.push(
      makeCheck(
        "health-areas",
        "areas",
        "watch",
        60,
        "Sign in before checking Supabase areas.",
        { source: "supabase", repair_steps: ["Sign in on /login."] },
      ),
      makeCheck(
        "health-capture-persistence",
        "capture persistence",
        "watch",
        60,
        "Sign in before checking capture_items persistence.",
        { source: "supabase", repair_steps: ["Sign in on /login."] },
      ),
    );
  }

  checks.push(
    integrationCheck(
      "health-ai-parser",
      "AI parser",
      options.aiParserConfigured ?? false,
      "AI parser is not configured in Phase 4E; parsing remains deterministic mock logic.",
    ),
    googleCalendarCheck(options),
    ...observabilityChecks(observability),
  );

  if (!userId) {
    return {
      provider: "supabase",
      checkedAt,
      checks,
      persistence: "skipped",
      persistenceMessage: "Sign in before persisting health checks.",
    };
  }

  const persistenceMessage = await persistHealthChecks(
    client,
    userId,
    checks,
    checkedAt,
  );

  return {
    provider: "supabase",
    checkedAt,
    checks,
    persistence: persistenceMessage ? "unavailable" : "persisted",
    persistenceMessage,
  };
}
