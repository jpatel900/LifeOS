"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DiagnosticsDisclosure } from "../../components/DiagnosticsDisclosure";
import { WorkflowLoadingState } from "../../components/WorkflowLoadingState";
import { saveModeLabel } from "../../../lib/statusVocabulary";
import { useWorkflow } from "@/lib/WorkflowContext";
import { AreaCharterPanel } from "./AreaCharterPanel";
import { DataExportPanel } from "./DataExportPanel";
import { GoogleCalendarConnectionPanel } from "./GoogleCalendarConnectionPanel";
import { OnboardingRerunPanel } from "./OnboardingRerunPanel";
import { OperatorProfilePanel } from "./OperatorProfilePanel";
import { CreateAreaForm } from "./CreateAreaForm";
import { AreaRegistryCards } from "./AreaRegistryCards";
import { LocalResetPanel } from "./LocalResetPanel";
import { useAreasLoadState } from "./useAreasLoadState";

export default function AreasSettingsPage() {
  const { selectedAreaId, state: workflowState } = useWorkflow();
  const { state, replaceReadyAreas } = useAreasLoadState();

  // #691: resolve the badge from the SAME context area list every other
  // screen reads (not this page's separately-loaded rows), and give null the
  // same meaning the pickers give it: All areas. "None selected" remains
  // only as the honest fallback for an id the shared list cannot resolve.
  const currentAreaLabel =
    selectedAreaId === null
      ? "All areas"
      : (workflowState.areas.find((area) => area.id === selectedAreaId)?.name ??
        "None selected");

  return (
    <div className="flex flex-col gap-6">
      {/* #660 audit line S1: was `WorkflowPageHeader` — an uppercase eyebrow
          ("Ownership boundaries"), a fluid-clamp `.workflow-page-title`
          (1.9-2.9rem), and an animated gradient panel. That grammar is a
          marketing-page pattern (matches the login/L2 and moments/#647
          finding: product UI reads at a FIXED scale, not fluid). Recomposed
          as a single-row masthead — title + description on the left, the
          status badges in the same row on wider viewports — at the fixed
          h1 tier (2.25rem/700, `.settings-page-title` below; same numbers
          `.moments-greeting`/`.login-title` use, kept as its own class per
          those classes' own "scoped to this feature" comments). No eyebrow:
          the title already says what the page is (same reasoning as
          L1/S3/S5 dropping their eyebrows-per-card). */}
      <header className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <h1 className="settings-page-title">Areas</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Use areas as clear ownership boundaries. Keep them specific enough
            to trust and quiet enough not to distract from daily work.
          </p>
        </div>
        {state.status === "ready" ? (
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">
              Save mode: {saveModeLabel(state.provider)}
            </Badge>
            <Badge variant="outline">Active areas: {state.areas.length}</Badge>
            <Badge
              variant="secondary"
              className="area-accent-chip rounded-full"
            >
              Current area: {currentAreaLabel}
            </Badge>
          </div>
        ) : null}
      </header>

      <CreateAreaForm
        currentAreas={state.status === "ready" ? state.areas : null}
        replaceReadyAreas={replaceReadyAreas}
      />

      <DiagnosticsDisclosure title="Registry details">
        {state.status === "ready" ? (
          <>
            <p>
              Save mode: <strong>{saveModeLabel(state.provider)}</strong>
            </p>
            <p>
              Technical save mode id: <strong>{state.provider}</strong>
            </p>
          </>
        ) : null}
      </DiagnosticsDisclosure>

      {state.status === "loading" ? (
        <WorkflowLoadingState
          title="Checking saved areas"
          description="You can prepare the next area while saved rows load."
        />
      ) : null}

      {state.status === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>Areas could not load</AlertTitle>
          <AlertDescription>
            <p>{state.message}</p>
            <p>
              If Supabase is configured, sign in and make sure the local stack
              is running. Without Supabase env vars, this page uses local-only
              areas.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      {state.status === "ready" ? (
        <AreaRegistryCards
          provider={state.provider}
          areas={state.areas}
          tasks={state.tasks}
          blocks={state.blocks}
          reviewEntries={state.reviewEntries}
          replaceReadyAreas={replaceReadyAreas}
        />
      ) : null}

      {/* #660 audit line S8: was six standalone `DiagnosticsDisclosure`s,
          each carrying its own `.system-details-disclosure` border/
          background/padding — six bare boxes stacked with no shared rhythm.
          Grouped into ONE moments-card-grammar container (`.settings-
          disclosure-group`, fixed var(--surface-radius)/var(--surface-
          shadow-sm) — the same numbers `.moments-card` uses, kept as its
          own class per the login-title/empty-state-title precedent of not
          reaching into a feature-scoped class name); each disclosure drops
          to `variant="flat"` (no per-item card surface) and a hairline
          divider marks the seam between items instead. */}
      <div className="settings-disclosure-group divide-y divide-border">
        <DiagnosticsDisclosure
          title="Area charters"
          variant="flat"
          contentClassName="mt-4"
        >
          <AreaCharterPanel />
        </DiagnosticsDisclosure>

        <DiagnosticsDisclosure
          title="Operator profile"
          variant="flat"
          contentClassName="mt-4"
        >
          <OperatorProfilePanel />
        </DiagnosticsDisclosure>

        <DiagnosticsDisclosure
          title="Google Calendar admin"
          variant="flat"
          contentClassName="mt-4"
        >
          <GoogleCalendarConnectionPanel />
        </DiagnosticsDisclosure>

        <DiagnosticsDisclosure
          title="Data export"
          variant="flat"
          contentClassName="mt-4"
        >
          <DataExportPanel />
        </DiagnosticsDisclosure>

        <DiagnosticsDisclosure
          title="Run setup again"
          variant="flat"
          contentClassName="mt-4"
        >
          <OnboardingRerunPanel />
        </DiagnosticsDisclosure>

        <DiagnosticsDisclosure
          title="Local reset"
          variant="flat"
          contentClassName="mt-4"
        >
          <LocalResetPanel />
        </DiagnosticsDisclosure>
      </div>
    </div>
  );
}
