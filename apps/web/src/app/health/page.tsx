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
  type HealthDashboardResult,
} from "@/lib/data/health";
import { captureEvent } from "@/lib/observability";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type HealthLoadState =
  | { status: "loading" }
  | { status: "ready"; result: HealthDashboardResult }
  | { status: "error"; message: string };

function humanStatus(summary: string, status: "healthy" | "watch" | "critical") {
  const lower = summary.toLowerCase();
  if (lower.includes("disabled") || lower.includes("optional")) {
    return { label: "Off by choice", variant: "secondary" as const };
  }
  if (lower.includes("mock")) {
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

export default function HealthPage() {
  const [state, setState] = useState<HealthLoadState>({ status: "loading" });
  const [checkRunId, setCheckRunId] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function runSystemCheck() {
      setState({ status: "loading" });
      try {
        const result = await getHealthDashboard(createSupabaseBrowserClient());

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
        }
      } catch (error) {
        if (!cancelled) {
          void error;
          setState({
            status: "error",
            message:
              "Unable to load health checks right now. Verify auth/session and provider status, then retry.",
          });
        }
      }
    }

    void runSystemCheck();

    return () => {
      cancelled = true;
    };
  }, [checkRunId]);

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
          disabled={state.status === "loading"}
        >
          Run system check
        </Button>
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
              <CardTitle className="text-xl">System overview</CardTitle>
              <CardDescription>
                Checked at {state.result.checkedAt}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2 text-sm">
              <Badge variant="outline">Data source: {state.result.provider}</Badge>
              <Badge variant="outline">System check: {state.result.persistence}</Badge>
              {state.result.persistenceMessage ? (
                <span className="text-muted-foreground">
                  {state.result.persistenceMessage}
                </span>
              ) : null}
            </CardContent>
          </Card>

          <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {state.result.checks.map((check) => {
              const display = humanStatus(check.summary, check.status);
              return (
                <Card key={check.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-lg capitalize">{check.subsystem}</CardTitle>
                      <Badge variant={display.variant}>
                        {display.label}
                      </Badge>
                    </div>
                    <CardDescription className="text-xs">
                      Score: {check.score}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {check.summary}
                  </CardContent>
                </Card>
              );
            })}
          </section>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Repair focus</CardTitle>
              <CardDescription>
                Setup or reconnect these items before relying on them.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <ul className="list-disc space-y-1 pl-4">
                {state.result.checks
                  .filter((check) => check.status !== "healthy")
                  .map((check) => (
                    <li key={`${check.id}-repair`}>
                      {check.subsystem}: {check.summary}
                    </li>
                  ))}
              </ul>
            </CardContent>
          </Card>
        </>
      ) : null}

      {state.status === "ready" &&
      state.result.checks.every((check) => check.status === "healthy") ? (
        <Alert variant="success">
          <AlertTitle>No active warnings</AlertTitle>
          <AlertDescription>
            All deterministic checks are healthy for this snapshot.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
