"use client";

import { TodayMoments } from "../components/moments/TodayMoments";

/**
 * Moments pass P3 — dev-only preview route (packet: assembled moments).
 *
 * Renders the assembled Start/Flow/Close container wired to the live
 * WorkflowContext (already mounted globally via AppShell). Live time in the
 * browser preview — `now` is left undefined so TodayMoments defaults to
 * `new Date()` at the component boundary. Not linked from anywhere in the
 * app.
 */

export default function MomentsPreviewPage() {
  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <header className="mb-6 grid gap-1">
        <h1 className="text-xl font-semibold">
          Moments preview (dev-only, packet P3 — assembled moments wired to
          WorkflowContext)
        </h1>
        <p className="text-sm text-muted-foreground">
          Live time, live WorkflowContext state. Not linked from anywhere in the
          app.
        </p>
      </header>

      <TodayMoments now={undefined} />
    </div>
  );
}
