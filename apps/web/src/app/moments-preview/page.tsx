"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { TodayMoments } from "../components/moments/TodayMoments";
import { deepLinkTargetForPath } from "../components/moments/deepLink";

/**
 * Moments pass P3 — dev-only preview route (packet: assembled moments).
 * Moments pass P6 — packet: deep-link fallback shims. Supports an optional
 * `?link=<path>` query param (e.g. `/moments-preview?link=/triage`) that maps
 * through `deepLinkTargetForPath` into TodayMoments' `deepLink` prop. This is
 * how the P6 shims are exercised pre-P7 without touching the live routes'
 * behavior — the actual route -> Today redirect is P7's job.
 *
 * Renders the assembled Start/Flow/Close container wired to the live
 * WorkflowContext (already mounted globally via AppShell). Live time in the
 * browser preview — `now` is left undefined so TodayMoments defaults to
 * `new Date()` at the component boundary. Not linked from anywhere in the
 * app.
 */

function MomentsPreviewContent() {
  const searchParams = useSearchParams();
  const link = searchParams.get("link");
  const deepLink = link ? deepLinkTargetForPath(link) : null;

  return <TodayMoments now={undefined} deepLink={deepLink} />;
}

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
          app. Append <code>?link=/triage</code> (or /capture, /calendar,
          /execute, /review) to exercise the P6 deep-link shims.
        </p>
      </header>

      <Suspense fallback={null}>
        <MomentsPreviewContent />
      </Suspense>
    </div>
  );
}
