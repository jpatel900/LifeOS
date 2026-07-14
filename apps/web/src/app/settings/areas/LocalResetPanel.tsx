"use client";

import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useWorkflow } from "@/lib/WorkflowContext";

/**
 * #590 slice 5: the device-local reset card — clears on-device workflow
 * state only, never cloud data. Extracted from AreasSettingsPage; owns its
 * own confirm/success UI state, mirroring the already-extracted sibling
 * panels.
 */
export function LocalResetPanel() {
  const { resetWorkflow } = useWorkflow();
  const [resetState, setResetState] = useState<
    "idle" | "confirming" | "success"
  >("idle");

  return (
    <Card
      data-testid="areas-local-reset-card"
      className="workflow-admin-card border-destructive/60 bg-destructive/5"
    >
      <CardContent className="space-y-3 pt-6 text-sm text-muted-foreground">
        <p>
          This only clears on-device data on this device. It does not delete
          cloud data.
        </p>
        {resetState === "success" ? (
          <Alert variant="success" role="status" aria-live="polite">
            <AlertTitle>Local browser data reset.</AlertTitle>
            <AlertDescription>
              This browser now starts from empty local state. Cloud data stays
              untouched.
            </AlertDescription>
          </Alert>
        ) : null}
        {resetState === "confirming" ? (
          <Alert variant="destructive" role="alert">
            <AlertTitle>Reset local data on this browser?</AlertTitle>
            <AlertDescription>
              This clears on-device data for this device only, including
              captures, drafts, ambiguity checks, and planned time blocks. It
              does not delete cloud data.
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {resetState === "confirming" ? (
            <>
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  resetWorkflow();
                  setResetState("success");
                }}
              >
                Yes, reset this browser
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setResetState("idle")}
              >
                Cancel
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="destructive"
              onClick={() => setResetState("confirming")}
            >
              Reset this browser
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
