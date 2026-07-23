import { AreaSchema, type HealthCheck } from "@lifeos/schemas";
import {
  getObservabilityHealthSnapshot,
  type ObservabilityHealthSnapshot,
  type ObservabilityProviderStatus,
} from "@/lib/observability";
import type { DataProvider } from "./workflow";
import { normalizeSupabaseRows } from "./supabaseRowNormalization";

type HealthStatus = HealthCheck["status"];

const PROVIDER_INCIDENT_WINDOW_MS = 30 * 60 * 1000;
const PROVIDER_INCIDENT_FAILURE_THRESHOLD = 3;
const PROVIDER_TRACE_LOOKBACK_MS = 24 * 60 * 60 * 1000;

const providerFailureStatuses = new Set([
  "failed",
  "schema_failed",
  "error",
  "timeout",
]);

export interface ProviderIncidentTrace {
  feature: string;
  status: string;
  created_at: string;
  latency_ms?: number | null;
}

export interface ProviderIncident {
  feature: string;
  failedCount: number;
  windowStartedAt: string;
  windowEndedAt: string;
  latestFailedAt: string;
  latestLatencyMs: number | null;
}

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
  rpc?: (
    functionName: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
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

const transitionRpcProbes = [
  {
    name: "accept_time_block_proposal",
    args: (id: string) => ({ p_proposal_id: id }),
  },
  {
    name: "start_execution_session",
    args: (id: string) => ({ p_task_id: id, p_calendar_block_id: null }),
  },
  {
    name: "unplan_calendar_block",
    args: (id: string) => ({ p_block_id: id }),
  },
  {
    name: "apply_task_review_transition",
    args: (id: string) => ({ p_task_id: id, p_target_status: "active" }),
  },
] as const;

const coreReadTables = [
  "areas",
  "capture_items",
  "tasks",
  "projects",
  "time_block_proposals",
  "calendar_blocks",
  "execution_sessions",
  "review_entries",
] as const;

function isProviderFailure(status: string) {
  return providerFailureStatuses.has(status.trim().toLowerCase());
}

function compareTraceTimes(
  left: Pick<ProviderIncidentTrace, "created_at">,
  right: Pick<ProviderIncidentTrace, "created_at">,
) {
  return (
    new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
  );
}

export function deriveProviderIncidents(
  traces: ProviderIncidentTrace[],
  now: Date,
): ProviderIncident[] {
  const nowMs = now.getTime();
  const byFeature = new Map<string, ProviderIncidentTrace[]>();

  for (const trace of traces) {
    const feature = trace.feature.trim();
    const traceMs = new Date(trace.created_at).getTime();

    if (!feature || Number.isNaN(traceMs) || traceMs > nowMs) {
      continue;
    }

    byFeature.set(feature, [...(byFeature.get(feature) ?? []), trace]);
  }

  const incidents: ProviderIncident[] = [];

  for (const [feature, featureTraces] of byFeature) {
    const ordered = [...featureTraces].sort(compareTraceTimes);
    const latest = ordered.at(-1);

    if (!latest || !isProviderFailure(latest.status)) {
      continue;
    }

    const failures = ordered.filter((trace) => isProviderFailure(trace.status));

    for (let startIndex = 0; startIndex < failures.length; startIndex += 1) {
      const windowStart = new Date(failures[startIndex].created_at).getTime();
      const windowFailures = failures.filter((trace) => {
        const traceMs = new Date(trace.created_at).getTime();
        return (
          traceMs >= windowStart &&
          traceMs <= windowStart + PROVIDER_INCIDENT_WINDOW_MS
        );
      });

      if (windowFailures.length >= PROVIDER_INCIDENT_FAILURE_THRESHOLD) {
        const latestFailure = windowFailures.at(-1)!;
        incidents.push({
          feature,
          failedCount: windowFailures.length,
          windowStartedAt: windowFailures[0].created_at,
          windowEndedAt: latestFailure.created_at,
          latestFailedAt: latestFailure.created_at,
          latestLatencyMs: latestFailure.latency_ms ?? null,
        });
        break;
      }
    }
  }

  return incidents.sort((left, right) =>
    left.feature.localeCompare(right.feature),
  );
}

function getErrorCode(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }

  return null;
}

function getErrorStatus(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    (typeof error.status === "number" || typeof error.status === "string")
  ) {
    return String(error.status);
  }

  return null;
}

function isMissingRpcError(error: unknown) {
  const code = getErrorCode(error);
  const status = getErrorStatus(error);
  const message = getErrorMessage(error).toLowerCase();

  return (
    code === "PGRST202" ||
    code === "42883" ||
    status === "404" ||
    message.includes("could not find the function") ||
    (message.includes("function") && message.includes("does not exist"))
  );
}

function isExpectedNoMutationRpcError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("not found") ||
    message.includes("not exist") ||
    message.includes("proposal") ||
    message.includes("task") ||
    message.includes("block")
  );
}

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

function informationalCheck(
  id: string,
  subsystem: string,
  summary: string,
  details: HealthDashboardCheck["details"] = {},
) {
  return makeCheck(id, subsystem, "healthy", 100, summary, {
    informational: true,
    repair_steps: [],
    ...details,
  });
}

/**
 * #688: supabase-js reports "nobody is signed in" as an ERROR from
 * `auth.getUser()` (AuthSessionMissingError, "Auth session missing!"), not as
 * a null user. That error message contains "auth", so it used to fall through
 * `normalizeSupabaseFailureSummary` into "Supabase authentication failed while
 * checking this subsystem" at CRITICAL — the exact scary line the owner
 * reported on a merely signed-out session. Signed-out is a calm state, so it
 * is classified before any failure wording is chosen. A real auth failure with
 * a live session (expired/invalid JWT, bad token) does NOT match.
 */
export function isSignedOutAuthError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("auth session missing") ||
    message.includes("session missing") ||
    message.includes("session_not_found") ||
    message.includes("no session")
  );
}

/**
 * #692 / NFR-006: every branch here is read by the person, so it says what
 * happened and what to do in plain words. The vendor name, the transport
 * detail, and the raw provider message stay out of the returned string; the
 * developer layer of the health screen renders `subsystem` and `details`
 * instead. Classification is unchanged — only the wording is.
 */
function normalizeSupabaseFailureSummary(
  message: string,
  fallback: string,
): string {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("jwt") ||
    normalized.includes("token") ||
    normalized.includes("auth")
  ) {
    return "Your sign-in could not be confirmed. Sign in again to continue.";
  }

  if (normalized.includes("permission") || normalized.includes("rls")) {
    return "This account is not allowed to see that. Sign in again, or use the account this work belongs to.";
  }

  if (normalized.includes("network") || normalized.includes("fetch")) {
    return "Your account could not be reached. Check your internet connection and try again.";
  }

  return fallback;
}

function configuredCheck(supabaseConfigured: boolean) {
  return supabaseConfigured
    ? makeCheck(
        "health-supabase-config",
        "supabase config",
        "healthy",
        100,
        "This device knows where your account lives, so signing in will work.",
        { repair_steps: [] },
      )
    : informationalCheck(
        "health-supabase-config",
        "supabase config",
        "No account is connected here. Everything you do stays on this device.",
        {
          configured: false,
          mode: "mock_only",
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
    : informationalCheck(id, subsystem, summary, {
        configured: false,
        mode: "optional_disabled",
      });
}

function googleCalendarCheck(options: HealthDashboardOptions) {
  const configured = options.googleCalendarConfigured ?? false;
  const connectionPresent = options.googleCalendarConnectionPresent ?? false;

  if (!configured) {
    return informationalCheck(
      "health-google-calendar",
      "Google Calendar",
      "Google Calendar is not set up. Your plans stay inside LifeOS.",
      {
        configured: false,
        connection_present: false,
        mode: "optional_disabled",
      },
    );
  }

  if (!connectionPresent) {
    return informationalCheck(
      "health-google-calendar",
      "Google Calendar",
      "Google Calendar is set up but not connected yet. Connect it to plan into your calendar.",
      {
        configured: true,
        connection_present: false,
        mode: "disconnected_or_signed_out",
      },
    );
  }

  return makeCheck(
    "health-google-calendar",
    "Google Calendar",
    "healthy",
    100,
    "Google Calendar is connected.",
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

/**
 * #692 / NFR-006: these rows used to name the vendor and its wiring on the
 * user surface ("Sentry DSN is absent", "PostHog public config", "langfuse is
 * disabled"). The person only needs to know what, if anything, leaves the app
 * — so the copy answers that. The vendor identity is still fully visible in
 * `subsystem` and `details.provider`, which the health screen renders in its
 * developer layer. Nothing about what is measured changed.
 */
function getObservabilityProviderSummary(
  provider: ObservabilityProviderStatus,
) {
  switch (provider.state) {
    case "disabled":
      return provider.provider === "sentry"
        ? "Crash reports are turned off. Nothing is sent when something goes wrong."
        : provider.provider === "posthog"
          ? "Usage counting is turned off. Nothing about how you use LifeOS is sent."
          : "AI activity logging is turned off. Nothing about your AI requests is sent.";
    case "configured":
      return provider.provider === "sentry"
        ? "Crash reports are on. Only the technical error is sent — never your screen, your typing, or your personal details."
        : provider.provider === "posthog"
          ? "Usage counting is on. Only a few chosen actions are counted — never your screen, your typing, or your clicks."
          : "AI activity logging is on. Only timings and outcomes are sent — never what you wrote or what the AI wrote back.";
    case "missing_config":
      return "This reporting tool is only half set up, so it stays off. Someone technical needs to finish it.";
    case "invalid_config":
      return "This reporting tool's setup is not valid, so it stays off. Someone technical needs to fix it.";
  }
}

function observabilityChecks(snapshot: ObservabilityHealthSnapshot) {
  const activeProviders = snapshot.providers.filter(
    (provider) => provider.transportMode !== "noop",
  );
  const checks = [
    makeCheck(
      "health-observability-privacy",
      "Observability privacy",
      "healthy",
      100,
      snapshot.guardrails.networkTelemetryEnabled
        ? "Some technical reports may leave this app, but your screen is never recorded, your clicks are never captured, and nothing you write to the AI is ever sent."
        : "Nothing leaves this app. Your screen is not recorded, your clicks are not captured, and nothing you write to the AI is sent anywhere.",
      {
        ai_content_tracing_enabled: snapshot.guardrails.aiContentTracingEnabled,
        active_provider_count: activeProviders.length,
        active_providers: activeProviders.map((provider) => provider.provider),
        active_transport_modes: activeProviders.map(
          (provider) => provider.transportMode,
        ),
        autocapture_enabled: snapshot.guardrails.autocaptureEnabled,
        environment: snapshot.environmentName,
        network_telemetry_enabled: snapshot.guardrails.networkTelemetryEnabled,
        session_replay_enabled: snapshot.guardrails.sessionReplayEnabled,
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

async function readProviderIncidentTraces(
  client: MinimalHealthSupabaseClient,
  now: Date,
): Promise<ProviderIncidentTrace[]> {
  const since = new Date(
    now.getTime() - PROVIDER_TRACE_LOOKBACK_MS,
  ).toISOString();
  const query = client.from("ai_call_traces") as {
    select: (columns: string) => {
      gte: (
        column: string,
        value: string,
      ) => {
        order: (
          column: string,
          options: { ascending: boolean },
        ) => {
          limit: (count: number) => Promise<{ data: unknown; error: unknown }>;
        };
      };
    };
  };

  const { data, error } = await query
    .select("surface,validation_outcome,created_at,latency_ms")
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  const rows = normalizeSupabaseRows(data) as unknown[];

  return rows.flatMap((row: unknown) => {
    if (!row || typeof row !== "object") {
      return [];
    }

    const candidate = row as Record<string, unknown>;

    if (
      typeof candidate.surface !== "string" ||
      typeof candidate.validation_outcome !== "string" ||
      typeof candidate.created_at !== "string"
    ) {
      return [];
    }

    return [
      {
        feature: candidate.surface,
        status: candidate.validation_outcome,
        created_at: candidate.created_at,
        latency_ms:
          typeof candidate.latency_ms === "number"
            ? candidate.latency_ms
            : null,
      },
    ];
  });
}

function providerIncidentCheck(incidents: ProviderIncident[]) {
  if (incidents.length === 0) {
    return makeCheck(
      "health-ai-provider-incidents",
      "AI provider incidents",
      "healthy",
      100,
      "The AI helper has been working normally over the last day.",
      {
        incident_count: 0,
        window_minutes: 30,
        threshold: PROVIDER_INCIDENT_FAILURE_THRESHOLD,
        repair_steps: [],
      },
    );
  }

  return makeCheck(
    "health-ai-provider-incidents",
    "AI provider incidents",
    "watch",
    55,
    `The AI helper failed several times in a row on ${incidents.length} thing${incidents.length === 1 ? "" : "s"} it was asked to do. Nothing you captured was lost — double-check anything the AI filled in.`,
    {
      incident_count: incidents.length,
      affected_features: incidents.map((incident) => incident.feature),
      latest_failed_at: incidents.reduce(
        (latest, incident) =>
          incident.latestFailedAt > latest ? incident.latestFailedAt : latest,
        incidents[0].latestFailedAt,
      ),
      window_minutes: 30,
      threshold: PROVIDER_INCIDENT_FAILURE_THRESHOLD,
      repair_steps: [
        "Review recent AI provider errors and retry after the provider recovers.",
      ],
    },
  );
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

  return AreaSchema.array().parse(normalizeSupabaseRows(data));
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

async function readCoreTable(
  client: MinimalHealthSupabaseClient,
  table: string,
) {
  const query = client.from(table) as {
    select: (columns: string) => {
      limit: (count: number) => Promise<{ data: unknown; error: unknown }>;
    };
  };

  const { error } = await query.select("id").limit(1);

  if (error) {
    throw new Error(getErrorMessage(error));
  }
}

async function probeTransitionRpcs(client: MinimalHealthSupabaseClient) {
  if (!client.rpc) {
    return makeCheck(
      "health-transition-rpcs",
      "transition RPCs",
      "critical",
      0,
      "LifeOS cannot move work between steps right now. Reload the page, then run the check again.",
      { repair_steps: ["Recreate the Supabase browser client."] },
    );
  }

  const probeId = crypto.randomUUID();
  const missing: string[] = [];
  const callable: string[] = [];
  const invocationErrors: string[] = [];

  for (const probe of transitionRpcProbes) {
    const { error } = await client.rpc(probe.name, probe.args(probeId));
    if (!error) {
      callable.push(probe.name);
    } else if (isMissingRpcError(error)) {
      missing.push(probe.name);
    } else if (isExpectedNoMutationRpcError(error)) {
      callable.push(probe.name);
    } else {
      invocationErrors.push(probe.name);
    }
  }

  if (missing.length > 0) {
    return makeCheck(
      "health-transition-rpcs",
      "transition RPCs",
      "critical",
      0,
      // #692: the RPC names stay in `details.missing` (the developer layer
      // renders them); the sentence the person reads says what is broken and
      // who can fix it. Classification and score are unchanged.
      `${missing.length} action${missing.length === 1 ? "" : "s"} for moving work between steps ${missing.length === 1 ? "is" : "are"} missing, so those steps will fail. Someone technical needs to finish setting this up.`,
      {
        callable,
        missing,
        invocation_errors: invocationErrors,
        repair_steps: ["Apply pending Supabase migrations."],
      },
    );
  }

  if (invocationErrors.length > 0) {
    return makeCheck(
      "health-transition-rpcs",
      "transition RPCs",
      "watch",
      60,
      `Moving work between steps mostly works, but ${invocationErrors.length} action${invocationErrors.length === 1 ? "" : "s"} answered unexpectedly. Try again; if it keeps happening, someone technical should look.`,
      {
        callable,
        missing,
        invocation_errors: invocationErrors,
        repair_steps: [
          "Check Supabase function grants and RLS for transition RPCs.",
        ],
      },
    );
  }

  return makeCheck(
    "health-transition-rpcs",
    "transition RPCs",
    "healthy",
    100,
    "Moving work between steps is working.",
    {
      callable,
      missing,
      invocation_errors: invocationErrors,
      repair_steps: [],
    },
  );
}

async function probeCoreReads(client: MinimalHealthSupabaseClient) {
  const readable: string[] = [];
  const failed: string[] = [];

  for (const table of coreReadTables) {
    try {
      await readCoreTable(client, table);
      readable.push(table);
    } catch {
      failed.push(table);
    }
  }

  if (failed.length > 0) {
    return makeCheck(
      "health-core-reads",
      "core table reads",
      "critical",
      0,
      // #692: the table names stay in `details.failed` for the developer
      // layer. The person is told which of their things could not be loaded
      // in the words they use for them.
      `${failed.length} part${failed.length === 1 ? "" : "s"} of your saved work could not be loaded. Sign in again and retry; if it keeps happening, someone technical should look.`,
      {
        readable,
        failed,
        repair_steps: [
          "Check Supabase migrations, grants, RLS, and auth state.",
        ],
      },
    );
  }

  return makeCheck(
    "health-core-reads",
    "core table reads",
    "healthy",
    100,
    "All of your saved work is loading correctly.",
    { readable, failed, repair_steps: [] },
  );
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
    return normalizeSupabaseFailureSummary(
      getErrorMessage(error),
      "This check ran, but a record of it could not be saved to your account.",
    );
  }

  return null;
}

export async function getHealthDashboard(
  client: MinimalHealthSupabaseClient | null,
  options: HealthDashboardOptions = {},
): Promise<HealthDashboardResult> {
  const now = (options.now ?? (() => new Date()))();
  const checkedAt = now.toISOString();
  const observability =
    options.observability ?? getObservabilityHealthSnapshot();
  const supabaseConfigured = options.supabaseConfigured ?? client !== null;
  const checks: HealthDashboardCheck[] = [
    makeCheck(
      "health-mock-mode",
      "mock mode",
      "healthy",
      100,
      "This device can keep your work on its own, so nothing is lost if your account cannot be reached.",
      { available: true, repair_steps: [] },
    ),
    configuredCheck(supabaseConfigured),
  ];

  if (!client) {
    checks.push(
      informationalCheck(
        "health-auth-session",
        "auth session",
        "There is no account to sign in to here, so everything stays on this device.",
        {
          authenticated: false,
          mode: "mock_only",
        },
      ),
      makeCheck(
        "health-areas",
        "areas",
        "healthy",
        100,
        "The starter areas are ready to use.",
        { source: "mock", repair_steps: [] },
      ),
      makeCheck(
        "health-capture-persistence",
        "capture persistence",
        "healthy",
        90,
        "Anything you capture is being kept on this device.",
        { source: "mock", repair_steps: [] },
      ),
      integrationCheck(
        "health-ai-parser",
        "AI parser",
        options.aiParserConfigured ?? false,
        "The AI helper is turned off. Anything you capture is sorted with built-in rules instead.",
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
        "Signing in is not working right now. Reload the page, then run the check again.",
        { repair_steps: ["Recreate the Supabase browser client."] },
      ),
    );
  } else {
    const { data, error } = await client.auth.getUser();
    if (error && isSignedOutAuthError(error)) {
      // #688: signed out — the calm state, not a failure. Same shape as the
      // no-user branch below so both routes present identically.
      checks.push(
        informationalCheck(
          "health-auth-session",
          "auth session",
          "You're not signed in. Work is saving on this device only.",
          {
            authenticated: false,
            mode: "signed_out",
            repair_steps: ["Sign in to sync work to your account."],
          },
        ),
      );
    } else if (error) {
      checks.push(
        makeCheck(
          "health-auth-session",
          "auth session",
          "critical",
          0,
          normalizeSupabaseFailureSummary(
            getErrorMessage(error),
            "Your sign-in could not be checked. Sign in again to continue.",
          ),
          { authenticated: false, repair_steps: ["Sign in again."] },
        ),
      );
    } else if (!data.user) {
      checks.push(
        informationalCheck(
          "health-auth-session",
          "auth session",
          // #688/#692: signed out is a calm state, said plainly — not
          // failure language, no vendor vocabulary.
          "You're not signed in. Work is saving on this device only.",
          {
            authenticated: false,
            mode: "signed_out",
            repair_steps: ["Sign in to sync work to your account."],
          },
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
          "You're signed in. Your work is saving to your account.",
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
              `Your ${areas.length} area${areas.length === 1 ? "" : "s"} loaded correctly.`,
              {
                source: "supabase",
                active_area_count: areas.length,
                repair_steps: [],
              },
            )
          : makeCheck(
              "health-areas",
              "areas",
              "healthy",
              100,
              "Your areas load correctly. You haven't set any up yet.",
              {
                source: "supabase",
                active_area_count: 0,
                informational: true,
                repair_steps: [],
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
          normalizeSupabaseFailureSummary(
            error instanceof Error ? error.message : "",
            "Your areas could not be loaded. Sign in again and retry.",
          ),
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
          "The thoughts you've captured are loading correctly.",
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
          normalizeSupabaseFailureSummary(
            error instanceof Error ? error.message : "",
            "The thoughts you've captured could not be loaded. Sign in again and retry.",
          ),
          {
            source: "supabase",
            repair_steps: ["Check capture_items grants, RLS, and auth state."],
          },
        ),
      );
    }

    checks.push(await probeTransitionRpcs(client));
    checks.push(await probeCoreReads(client));

    try {
      const traces = await readProviderIncidentTraces(client, now);
      checks.push(providerIncidentCheck(deriveProviderIncidents(traces, now)));
    } catch (error) {
      checks.push(
        makeCheck(
          "health-ai-provider-incidents",
          "AI provider incidents",
          "watch",
          60,
          normalizeSupabaseFailureSummary(
            error instanceof Error ? error.message : "",
            "The AI helper's recent activity could not be checked. Sign in again and retry.",
          ),
          {
            repair_steps: ["Check ai_call_traces grants, RLS, and auth state."],
          },
        ),
      );
    }
  } else {
    checks.push(
      informationalCheck(
        "health-areas",
        "areas",
        // #688/#692: plain and calm — the signed-out condition, not an error.
        "Sign in to check the areas saved to your account.",
        {
          source: "supabase",
          mode: "signed_out",
          repair_steps: ["Sign in to check saved account data."],
        },
      ),
      informationalCheck(
        "health-capture-persistence",
        "capture persistence",
        "Sign in to check the captures saved to your account.",
        {
          source: "supabase",
          mode: "signed_out",
          repair_steps: ["Sign in to check saved account data."],
        },
      ),
    );
  }

  checks.push(
    integrationCheck(
      "health-ai-parser",
      "AI parser",
      options.aiParserConfigured ?? false,
      "The AI helper is turned off. Anything you capture is sorted with built-in rules instead.",
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
      persistenceMessage: "Sign in to keep a record of these checks.",
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
