"use client";

import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DiagnosticsDisclosure } from "../components/DiagnosticsDisclosure";
import {
  getHealthDashboard,
  type HealthDashboardResult,
  type HealthDashboardCheck,
} from "@/lib/data/health";
import { WorkflowPageHeader } from "../components/WorkflowPageHeader";
import { captureEvent } from "@/lib/observability";
import {
  calendarConnectionLabel,
  saveModeLabel,
  systemCheckSaveLabel,
} from "@/lib/statusVocabulary";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { WorkflowLoadingState } from "../components/WorkflowLoadingState";

type HealthLoadState =
  | { status: "loading" }
  | { status: "ready"; result: HealthDashboardResult }
  | { status: "error"; message: string };

type CheckFeedbackState =
  | { status: "idle" }
  | { status: "running"; message: string }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

const HEALTH_LOAD_TIMEOUT_MS = 20_000;
const HEALTH_TIMEOUT_ERROR_CODE = "health_timeout";

function toUserText(text: string) {
  return text
    .replace(/\bmock mode\b/gi, "Local-only mode")
    .replace(/\bAI parser\b/g, "AI sorting")
    .replace(/deterministic/gi, "predictable");
}

function displaySubsystem(name: string) {
  return toUserText(name);
}

function humanStatus(
  summary: string,
  status: "healthy" | "watch" | "critical",
) {
  const lower = toUserText(summary).toLowerCase();
  if (lower.includes("disabled") || lower.includes("optional")) {
    return { label: "Optional", variant: "secondary" as const };
  }
  if (lower.includes("local-only mode") || lower.includes("on this device")) {
    return { label: "Local-only", variant: "secondary" as const };
  }
  if (status === "healthy") {
    return { label: "Ready", variant: "success" as const };
  }
  if (status === "watch") {
    return { label: "Needs setup", variant: "warning" as const };
  }
  return { label: "Needs attention", variant: "destructive" as const };
}

function findCheck(checks: HealthDashboardResult["checks"], subsystem: string) {
  return checks.find((check) => check.subsystem === subsystem) ?? null;
}

function readBooleanDetail(
  check: HealthDashboardCheck | null,
  key: string,
): boolean | null {
  const value = check?.details[key];
  return typeof value === "boolean" ? value : null;
}

type TrustRow = {
  title: string;
  status: string;
  summary: string;
  nextStep: string;
  variant: "success" | "secondary" | "warning" | "destructive";
};

function canonicalSeverityForVariant(
  variant: "default" | "success" | "secondary" | "warning" | "destructive",
) {
  switch (variant) {
    case "success":
      return "success";
    case "warning":
      return "warning";
    case "destructive":
      return "danger";
    case "secondary":
    case "default":
      return "info";
  }
}

function healthRunFeedback(
  state: HealthLoadState,
  feedback: CheckFeedbackState,
  checkedAt: string | null,
) {
  if (state.status === "error") {
    return {
      variant: "destructive" as const,
      title: "Health checks could not load",
      description: state.message,
      chips: ["Fix issue", "Run again"],
      nextStep: "Fix the connection or session issue, then run the check again.",
    };
  }

  if (feedback.status === "running") {
    return {
      variant: "default" as const,
      title: "Running system check",
      description:
        "LifeOS is refreshing saved subsystem status before it updates the trust answer below.",
      chips: ["Health in progress", "Refresh status"],
      nextStep: "Keep this page open until the latest trust answer is ready.",
    };
  }

  if (feedback.status === "success") {
    return {
      variant: "success" as const,
      title: "System check complete.",
      description: checkedAt
        ? `The trust answer below now reflects the latest saved status from ${checkedAt}.`
        : "The trust answer below now reflects the latest saved status.",
      chips: ["Latest health snapshot", "Trust answer updated"],
      nextStep: "Start with the plain answer first, then open diagnostics only if needed.",
    };
  }

  if (feedback.status === "error") {
    return {
      variant: "destructive" as const,
      title: "Last run failed",
      description: feedback.message,
      chips: ["Fix issue", "Run again"],
      nextStep: "Fix the issue, then run the system check again.",
    };
  }

  return null;
}

function buildSavingRow(result: HealthDashboardResult): TrustRow {
  const authCheck = findCheck(result.checks, "auth session");
  const captureCheck = findCheck(result.checks, "capture persistence");

  if (result.provider === "mock") {
    return {
      title: "Saving",
      status: "Saved on this device only",
      summary:
        "Core workflow stays usable without account sync, but new work stays on this device.",
      nextStep:
        "Sign in and configure account sync when you want saved account data.",
      variant: "secondary",
    };
  }

  if (
    result.persistence === "persisted" &&
    authCheck?.status === "healthy" &&
    captureCheck?.status === "healthy"
  ) {
    return {
      title: "Saving",
      status: "Saved to account",
      summary: "Account sync is active for this session.",
      nextStep: "No repair step is needed right now.",
      variant: "success",
    };
  }

  if (result.persistence === "unavailable") {
    return {
      title: "Saving",
      status: "Save failed",
      summary: toUserText(
        result.persistenceMessage ??
          "The latest health snapshot could not be saved.",
      ),
      nextStep: "Verify account access, then run the check again.",
      variant: "destructive",
    };
  }

  if (authCheck?.status === "critical" || captureCheck?.status === "critical") {
    return {
      title: "Saving",
      status: "Needs attention",
      summary: toUserText(
        authCheck?.status === "critical"
          ? authCheck.summary
          : (captureCheck?.summary ?? "Saved account data is unavailable."),
      ),
      nextStep: "Fix account access before relying on saved account data.",
      variant: "destructive",
    };
  }

  return {
    title: "Saving",
    status: "Not saved",
    summary: toUserText(
      result.persistenceMessage ??
        "Account sync is not active for this session.",
    ),
    nextStep: "Sign in if you want new checks and saved rows in your account.",
    variant: "warning",
  };
}

function buildAiRow(result: HealthDashboardResult): TrustRow {
  const aiCheck = findCheck(result.checks, "AI parser");
  const configured = readBooleanDetail(aiCheck, "configured");

  if (aiCheck?.status === "healthy" && configured) {
    return {
      title: "AI sorting",
      status: "On",
      summary: "AI-assisted sorting is ready in Capture.",
      nextStep: "Use Save and organize when you want AI help.",
      variant: "success",
    };
  }

  return {
    title: "AI sorting",
    status: "Unavailable",
    summary: "Capture still works and falls back to on-device sorting.",
    nextStep: "Optional: add AI config if you want AI-assisted sorting.",
    variant: "secondary",
  };
}

function buildCalendarRow(result: HealthDashboardResult): TrustRow {
  const calendarCheck = findCheck(result.checks, "Google Calendar");
  const configured = readBooleanDetail(calendarCheck, "configured");
  const connected = readBooleanDetail(calendarCheck, "connection_present");
  const status =
    configured === false
      ? "unavailable"
      : connected
        ? "connected"
        : "disconnected";

  if (status === "connected") {
    return {
      title: "Calendar",
      status: calendarConnectionLabel(status),
      summary: "Google Calendar is connected for approval-gated writes.",
      nextStep:
        "Conflict checks and event creation still require explicit action.",
      variant: "success",
    };
  }

  if (status === "disconnected") {
    return {
      title: "Calendar",
      status: calendarConnectionLabel(status),
      summary:
        "Planning still works locally, but Google writes are unavailable until you connect.",
      nextStep: "Connect Google Calendar in Areas when you need it.",
      variant: "warning",
    };
  }

  return {
    title: "Calendar",
    status: calendarConnectionLabel(status),
    summary: "Planning stays local until Google Calendar is configured.",
    nextStep:
      "Optional: configure Google Calendar in Areas if you want external writes.",
    variant: "secondary",
  };
}

function buildReliabilitySummary(result: HealthDashboardResult) {
  const savingRow = buildSavingRow(result);
  const blockingCoreCheck = result.checks.find(
    (check) =>
      ["auth session", "areas", "capture persistence"].includes(
        check.subsystem,
      ) && check.status === "critical",
  );

  if (blockingCoreCheck) {
    return {
      label: "Not fully",
      variant: "destructive" as const,
      summary:
        "Fix the blocking item below before relying on saved account data.",
    };
  }

  if (savingRow.variant === "secondary" || savingRow.variant === "warning") {
    return {
      label: "Yes, with limits",
      variant: "warning" as const,
      summary:
        "Core workflow is usable, but saving is still local-only or not active for this session.",
    };
  }

  return {
    label: "Yes",
    variant: "success" as const,
    summary: "Core workflow and account saving look available right now.",
  };
}

function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(HEALTH_TIMEOUT_ERROR_CODE));
    }, timeoutMs);

    work.then(
      (result) => {
        clearTimeout(timeoutId);
        resolve(result);
      },
      (error: unknown) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

export default function HealthPage() {
  const [state, setState] = useState<HealthLoadState>({ status: "loading" });
  const [feedback, setFeedback] = useState<CheckFeedbackState>({
    status: "idle",
  });
  const [checkRunId, setCheckRunId] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function runSystemCheck() {
      setState({ status: "loading" });
      setFeedback({
        status: "running",
        message: "Run in progress. Please wait.",
      });
      try {
        const result = await withTimeout(
          getHealthDashboard(createSupabaseBrowserClient()),
          HEALTH_LOAD_TIMEOUT_MS,
        );

        if (!cancelled) {
          void captureEvent({
            event: "health_viewed",
            properties: {
              feature: "health",
              provider: result.provider,
              status: result.persistence,
              used_mock: result.provider === "mock",
            },
          });
          setState({ status: "ready", result });
          setFeedback({
            status: "success",
            message: "System check complete.",
          });
        }
      } catch (error) {
        if (!cancelled) {
          const errorMessage =
            error instanceof Error &&
            error.message === HEALTH_TIMEOUT_ERROR_CODE
              ? "Health checks are taking too long. Verify your connection or session, then run the check again."
              : "Unable to load health checks right now. Verify auth/session and storage mode, then retry.";
          setState({
            status: "error",
            message: errorMessage,
          });
          setFeedback({
            status: "error",
            message: "Last run failed. Fix the issue and run the check again.",
          });
        }
      }
    }

    void runSystemCheck();

    return () => {
      cancelled = true;
    };
  }, [checkRunId]);

  const attentionChecks =
    state.status === "ready"
      ? state.result.checks.filter((check) => {
          const display = humanStatus(check.summary, check.status);
          return (
            display.label === "Needs setup" ||
            display.label === "Needs attention"
          );
        })
      : [];
  const reliabilitySummary =
    state.status === "ready" ? buildReliabilitySummary(state.result) : null;
  const trustRows =
    state.status === "ready"
      ? [
          buildSavingRow(state.result),
          buildAiRow(state.result),
          buildCalendarRow(state.result),
        ]
      : [];
  const repairQueueCount = attentionChecks.length;
  const runFeedback = healthRunFeedback(
    state,
    feedback,
    state.status === "ready" ? state.result.checkedAt : null,
  );

  const isRunDisabled = state.status === "loading";

  return (
    <div className="flex flex-col gap-6">
      <WorkflowPageHeader
        className="workflow-page-header--health"
        eyebrow="Trust and repair"
        title="Health"
        description="Use this like a trust-and-repair desk. Start with the answer, then fix only what blocks today&apos;s work."
        actions={
          <div className="workflow-action-tray flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={() => setCheckRunId((id) => id + 1)}
              disabled={isRunDisabled}
            >
              Run system check
            </Button>
          </div>
        }
      />

      {runFeedback ? (
        <Alert
          variant={runFeedback.variant}
          data-severity={canonicalSeverityForVariant(runFeedback.variant)}
          role={runFeedback.variant === "destructive" ? "alert" : "status"}
          aria-live="polite"
          className={
            runFeedback.variant === "success"
              ? "workflow-celebration-alert text-foreground"
              : undefined
          }
        >
          <AlertTitle
            className={
              runFeedback.variant === "success" ? "text-primary" : undefined
            }
          >
            {runFeedback.title}
          </AlertTitle>
          <AlertDescription>{runFeedback.description}</AlertDescription>
          <div className="workflow-celebration-meta">
            {runFeedback.chips.map((chip) => (
              <span key={chip} className="workflow-celebration-chip">
                {chip}
              </span>
            ))}
          </div>
          <p className="text-sm font-medium">{runFeedback.nextStep}</p>
        </Alert>
      ) : null}

      {state.status === "loading" ? (
        <WorkflowLoadingState
          title="Loading health..."
          description="Checking saved subsystem status and local trust signals."
        />
      ) : null}

      {state.status === "ready" ? (
        <>
          <Card
            data-testid="health-reliability-card"
            className="workflow-primary-card workflow-flagship-card health-flagship-card"
          >
            <CardHeader>
              <p className="workflow-surface-kicker">Trust answer first</p>
              <CardTitle className="workflow-surface-title text-3xl font-semibold leading-tight">
                Can I rely on LifeOS today?
              </CardTitle>
              <CardDescription className="workflow-surface-body max-w-2xl text-sm">
                Start with the plain answer, then open diagnostics only if you
                need the raw subsystem view.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <div className="flex flex-wrap items-center gap-3">
                <Badge
                  variant={reliabilitySummary?.variant ?? "secondary"}
                  data-severity={canonicalSeverityForVariant(
                    reliabilitySummary?.variant ?? "secondary",
                  )}
                >
                  {reliabilitySummary?.label}
                </Badge>
                <span>{reliabilitySummary?.summary}</span>
              </div>
            </CardContent>
          </Card>

          <Card
            data-testid="health-trust-summary-card"
            className="workflow-secondary-card workflow-support-card health-trust-map-card"
          >
            <CardHeader>
              <CardTitle className="text-lg">Trust map</CardTitle>
              <CardDescription>
                Checked at {state.result.checkedAt}. Read what is saved, what
                is local-only, and what still needs setup.
              </CardDescription>
            </CardHeader>
            <CardContent className="workflow-metric-grid">
              {trustRows.map((row) => (
                <div key={row.title} className="workflow-metric-card">
                  <div className="flex items-center justify-between gap-2">
                    <span className="workflow-metric-label">{row.title}</span>
                    <Badge
                      variant={row.variant}
                      data-severity={canonicalSeverityForVariant(row.variant)}
                    >
                      {row.status}
                    </Badge>
                  </div>
                  <p className="workflow-metric-context">{row.summary}</p>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Next step: {row.nextStep}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card
            data-testid="health-attention-card"
            className="workflow-secondary-card workflow-support-card health-repair-card"
          >
            <CardHeader>
              <CardTitle className="text-xl">
                {attentionChecks.length > 0 ? "Repair queue" : "Repair queue is clear"}
              </CardTitle>
              <CardDescription>
                {attentionChecks.length > 0
                  ? `Fix these ${repairQueueCount} blocking or setup item${repairQueueCount === 1 ? "" : "s"} before relying on the affected part of the app.`
                  : "Nothing is blocking the core workflow right now. Open diagnostics only if you need subsystem detail."}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {attentionChecks.length > 0 ? (
                <ul className="grid gap-3">
                  {attentionChecks.map((check) => (
                    <li
                      key={`${check.id}-attention`}
                      className="area-accent-panel health-repair-item rounded-xl border p-3"
                    >
                      <span className="font-medium text-foreground">
                        {displaySubsystem(check.subsystem)}:
                      </span>{" "}
                      {toUserText(check.summary)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Nothing is blocking today&apos;s core workflow.</p>
              )}
            </CardContent>
          </Card>

          <DiagnosticsDisclosure title="Health details">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {state.result.checks.map((check) => {
                const display = humanStatus(check.summary, check.status);
                return (
                  <Card key={check.id} className="workflow-admin-card">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-lg capitalize">
                          {displaySubsystem(check.subsystem)}
                        </CardTitle>
                        <Badge variant={display.variant}>{display.label}</Badge>
                      </div>
                      <CardDescription className="text-xs">
                        Score: {check.score}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                      {toUserText(check.summary)}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            <p>
              Save mode: <strong>{saveModeLabel(state.result.provider)}</strong>
            </p>
            <p>
              System check save result:{" "}
              <strong>{systemCheckSaveLabel(state.result.persistence)}</strong>
            </p>
            {state.result.persistenceMessage ? (
              <p>{toUserText(state.result.persistenceMessage)}</p>
            ) : null}
            <DiagnosticsDisclosure detailLevel="developer">
              <p>
                Technical save mode id: <strong>{state.result.provider}</strong>
              </p>
              <p>
                Technical save result id:{" "}
                <strong>{state.result.persistence}</strong>
              </p>
            </DiagnosticsDisclosure>
          </DiagnosticsDisclosure>
        </>
      ) : null}
    </div>
  );
}
