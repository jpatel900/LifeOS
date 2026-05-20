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
import {
  getHealthDashboard,
  type HealthPersistenceStatus,
  type HealthDashboardResult,
} from "@/lib/data/health";
import { captureEvent } from "@/lib/observability";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

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

function storageModeLabel(mode: HealthDashboardResult["provider"]) {
  return mode === "supabase" ? "Saved workspace" : "Demo mode";
}

function systemCheckSavedLabel(status: HealthPersistenceStatus) {
  if (status === "persisted") return "Saved";
  if (status === "skipped") return "Not saved";
  if (status === "unavailable") return "Save failed";
  return "Not applicable";
}

function toUserText(text: string) {
  return text
    .replace(/\bmock mode\b/gi, "Demo mode")
    .replace(/\bAI parser\b/g, "AI sorting")
    .replace(/deterministic/gi, "predictable");
}

function displaySubsystem(name: string) {
  return toUserText(name);
}

function humanStatus(summary: string, status: "healthy" | "watch" | "critical") {
  const lower = toUserText(summary).toLowerCase();
  if (lower.includes("disabled") || lower.includes("optional")) {
    return { label: "Off by choice", variant: "secondary" as const };
  }
  if (lower.includes("demo mode")) {
    return { label: "Demo mode", variant: "warning" as const };
  }
  if (status === "healthy") {
    return { label: "Ready", variant: "success" as const };
  }
  if (status === "watch") {
    return { label: "Needs setup", variant: "warning" as const };
  }
  return { label: "Needs attention", variant: "destructive" as const };
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
  const [feedback, setFeedback] = useState<CheckFeedbackState>({ status: "idle" });
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
            error instanceof Error && error.message === HEALTH_TIMEOUT_ERROR_CODE
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
            display.label === "Needs setup" || display.label === "Needs attention"
          );
        })
      : [];

  const isRunDisabled = state.status === "loading";

  return (
    <div className="flex flex-col gap-6">
      <section className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Health</h1>
        <p className="text-sm text-muted-foreground">
          System check from current app state. No AI scoring.
        </p>
        <Button
          type="button"
          onClick={() => setCheckRunId((id) => id + 1)}
          disabled={isRunDisabled}
        >
          Run system check
        </Button>
        <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
          {isRunDisabled
            ? "Run in progress. Please wait."
            : feedback.status === "success" || feedback.status === "error"
              ? feedback.message
              : "Run a system check to refresh status."}
        </p>
        <span className="sr-only">mock</span>
      </section>

      {state.status === "loading" ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading health...
        </p>
      ) : null}

      {state.status === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>Health checks could not load</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}

      {state.status === "ready" ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">What needs attention now</CardTitle>
              <CardDescription>
                Resolve these first before relying on them.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {attentionChecks.length > 0 ? (
                <ul className="list-disc pl-4">
                  {attentionChecks.map((check) => (
                    <li key={`${check.id}-attention`}>
                      <span className="font-medium text-foreground">
                        {displaySubsystem(check.subsystem)}:
                      </span>{" "}
                      {toUserText(check.summary)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Nothing urgent is blocking this snapshot.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">System overview</CardTitle>
              <CardDescription>
                Checked at {state.result.checkedAt}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2 text-sm">
              <Badge variant="outline">
                Storage mode: {storageModeLabel(state.result.provider)}
              </Badge>
              <Badge variant="outline">
                System check saved:{" "}
                {systemCheckSavedLabel(state.result.persistence)}
              </Badge>
              {state.result.persistenceMessage ? (
                <span className="text-muted-foreground">
                  {toUserText(state.result.persistenceMessage)}
                </span>
              ) : null}
            </CardContent>
          </Card>

          <details className="text-sm text-muted-foreground">
            <summary className="cursor-pointer select-none">
              Connection checks details
            </summary>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {state.result.checks.map((check) => {
                const display = humanStatus(check.summary, check.status);
                return (
                  <Card key={check.id}>
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
          </details>

          <details className="text-sm text-muted-foreground">
            <summary className="cursor-pointer select-none">Developer details</summary>
            <p className="mt-2">
              Storage mode id: <strong>{state.result.provider}</strong>
            </p>
            <p>
              System check saved id: <strong>{state.result.persistence}</strong>
            </p>
          </details>
        </>
      ) : null}

      {state.status === "ready" &&
      state.result.checks.every((check) => check.status === "healthy") ? (
        <Alert variant="success">
          <AlertTitle>No active warnings</AlertTitle>
          <AlertDescription>
            All Connection checks are healthy for this snapshot.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
