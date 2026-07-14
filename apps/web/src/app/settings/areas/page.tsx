"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DiagnosticsDisclosure } from "../../components/DiagnosticsDisclosure";
import { WorkflowPageHeader } from "../../components/WorkflowPageHeader";
import { WorkflowLoadingState } from "../../components/WorkflowLoadingState";
import { saveModeLabel } from "../../../lib/statusVocabulary";
import { workflowAreaIdForPersistedArea } from "@/lib/workflowAreaMapping";
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
  const { selectedAreaId } = useWorkflow();
  const { state, replaceReadyAreas } = useAreasLoadState();

  const currentArea =
    state.status === "ready"
      ? (state.areas.find(
          (area) => workflowAreaIdForPersistedArea(area) === selectedAreaId,
        ) ?? null)
      : null;

  return (
    <div className="flex flex-col gap-6">
      <WorkflowPageHeader
        className="workflow-page-header--areas"
        eyebrow="Ownership boundaries"
        title="Areas"
        description="Use areas as clear ownership boundaries. Keep them specific enough to trust and quiet enough not to distract from daily work."
      >
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
              Current area: {currentArea?.name ?? "None selected"}
            </Badge>
          </div>
        ) : null}
      </WorkflowPageHeader>

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

      <DiagnosticsDisclosure title="Area charters" contentClassName="mt-4">
        <AreaCharterPanel />
      </DiagnosticsDisclosure>

      <DiagnosticsDisclosure title="Operator profile" contentClassName="mt-4">
        <OperatorProfilePanel />
      </DiagnosticsDisclosure>

      <DiagnosticsDisclosure
        title="Google Calendar admin"
        contentClassName="mt-4"
      >
        <GoogleCalendarConnectionPanel />
      </DiagnosticsDisclosure>

      <DiagnosticsDisclosure title="Data export" contentClassName="mt-4">
        <DataExportPanel />
      </DiagnosticsDisclosure>

      <DiagnosticsDisclosure title="Run setup again" contentClassName="mt-4">
        <OnboardingRerunPanel />
      </DiagnosticsDisclosure>

      <DiagnosticsDisclosure title="Local reset" contentClassName="mt-4">
        <LocalResetPanel />
      </DiagnosticsDisclosure>
    </div>
  );
}
