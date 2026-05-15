"use client";

import { useEffect, useState } from "react";
import type { Area } from "@lifeos/schemas";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "../../components/EmptyState";
import { listAreas, type DataProvider } from "../../../lib/data/workflow";
import { createSupabaseBrowserClient } from "../../../lib/supabase/browser";
import { useWorkflow } from "@/lib/WorkflowContext";
import { GoogleCalendarConnectionPanel } from "./GoogleCalendarConnectionPanel";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; provider: DataProvider; areas: Area[] };

export default function AreasSettingsPage() {
  const { resetWorkflow } = useWorkflow();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function loadAreas() {
      try {
        const result = await listAreas(createSupabaseBrowserClient());

        if (!cancelled) {
          setState({
            status: "ready",
            provider: result.provider,
            areas: result.areas,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Unable to load areas right now.",
          });
        }
      }
    }

    void loadAreas();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <section className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Areas</h1>
        <p className="text-sm text-muted-foreground">
          Areas are first-class workspace scopes for capture, planning, and review.
        </p>
      </section>

      <details className="text-sm text-muted-foreground">
        <summary className="cursor-pointer select-none">System details</summary>
        {state.status === "ready" ? (
          <p className="mt-2">
            Persisted area provider: <strong>{state.provider}</strong>
          </p>
        ) : null}
      </details>

      {state.status === "loading" ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading areas...
        </p>
      ) : null}

      {state.status === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>Areas could not load</AlertTitle>
          <AlertDescription>
            <p>{state.message}</p>
            <p>
              If Supabase is configured, make sure you are signed in and the local
              stack is running. Without Supabase env vars, this page uses demo areas.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      {state.status === "ready" ? (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {state.areas.length === 0 ? (
            <EmptyState
              title="No active areas yet."
              description="Create or load an area before capture and planning so work has a clear scope."
            />
          ) : (
            state.areas.map((area) => (
              <Card key={area.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xl">{area.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="text-muted-foreground">
                    {area.description ?? "No description yet."}
                  </p>
                  <Badge variant="outline">Slug: {area.slug}</Badge>
                </CardContent>
              </Card>
            ))
          )}
        </section>
      ) : null}

      <GoogleCalendarConnectionPanel />

      <Card className="border-dashed border-destructive/40">
        <CardHeader>
          <CardTitle className="text-lg">Local reset</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Reset clears local browser session workflow state (captures, drafts,
            ambiguity assessments, and proposal drafts). It does not delete
            persisted Supabase/mock-provider rows.
          </p>
          <Button type="button" variant="destructive" onClick={resetWorkflow}>
            Reset this browser only
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

