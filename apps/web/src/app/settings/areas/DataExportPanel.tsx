"use client";

import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createSupabaseBrowserClient } from "../../../lib/supabase/browser";

type ExportState =
  | { status: "idle" }
  | { status: "exporting" }
  | { status: "done"; fileName: string }
  | { status: "error"; message: string };

export function DataExportPanel() {
  const [exportState, setExportState] = useState<ExportState>({
    status: "idle",
  });

  async function handleExport() {
    setExportState({ status: "exporting" });

    try {
      const client = createSupabaseBrowserClient();
      if (!client) {
        throw new Error(
          "Data export needs a signed-in account. Local-only data stays on this device and is not included.",
        );
      }

      const { data, error } = await client.auth.getSession();
      if (error) {
        throw new Error(error.message);
      }

      const accessToken = data.session?.access_token?.trim();
      if (!accessToken) {
        throw new Error("Sign in before exporting your data.");
      }

      const response = await fetch("/api/export", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : "Data export failed. Nothing was exported; try again.",
        );
      }

      const fileName = `lifeos-export-${String(
        payload?.exported_at ?? "",
      ).slice(0, 10)}.json`;
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(url);

      setExportState({ status: "done", fileName });
    } catch (error) {
      setExportState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Data export failed. Nothing was exported; try again.",
      });
    }
  }

  return (
    <Card data-testid="data-export-card" className="workflow-admin-card">
      <CardContent className="space-y-3 pt-6 text-sm text-muted-foreground">
        <p>
          Download a JSON copy of your account data: areas, captures, tasks,
          projects, planning proposals, calendar blocks, execution sessions,
          reviews, health history, and the external-write audit log. Google
          connection tokens are never included.
        </p>
        {exportState.status === "done" ? (
          <Alert variant="success" role="status" aria-live="polite">
            <AlertTitle>Export saved.</AlertTitle>
            <AlertDescription>
              {exportState.fileName} downloaded to this device. Store it
              somewhere you trust; it contains your full account data.
            </AlertDescription>
          </Alert>
        ) : null}
        {exportState.status === "error" ? (
          <Alert variant="warning" role="status" aria-live="polite">
            <AlertTitle>Export did not finish.</AlertTitle>
            <AlertDescription>
              {exportState.message} Your data is unchanged and you can retry.
            </AlertDescription>
          </Alert>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          onClick={() => void handleExport()}
          disabled={exportState.status === "exporting"}
        >
          {exportState.status === "exporting"
            ? "Preparing export..."
            : "Download my data"}
        </Button>
      </CardContent>
    </Card>
  );
}
