"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
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
  const pathname = usePathname();
  const router = useRouter();

  // #742 OWNER-GATE resolved (2026-07-26 Target Cards ratification, re-
  // confirmed on the issue): signed-out visitors to this page are sent to
  // the sign-in door instead of staying on a local-only view. This does NOT
  // touch `useAreasLoadState.ts`'s classification boundary (#753) — that
  // hook still turns the raw `AuthSessionMissingError` into the calm
  // `status: "signed-out"` value; this effect just reacts to that value with
  // navigation instead of an in-place alert. `router.replace` (not `push`)
  // so Back does not return to a screen that immediately redirects again.
  //
  // `hasRedirectedRef` makes the navigation fire exactly once. Root cause
  // this guards against (found via CI: `router.replace` called 2 times, not
  // 1 — reproduced locally 6/6 runs once isolated): `useWorkflow()` owns
  // its own independent Supabase load (persisted rows, unrelated to
  // `useAreasLoadState`'s areas fetch), and that load settling after mount
  // updates WorkflowContext's value and re-renders this component while
  // `state.status` is STILL "signed-out" — same status, but a second render,
  // and `next/navigation`'s `useRouter()` is not guaranteed to return the
  // same object identity across renders (this repo's own test double
  // intentionally does not, and did not before this fix either — it just
  // never surfaced the bug because nothing depended on identity). Without
  // the ref, that second render re-runs the effect and calls
  // `router.replace` again. A ref (not a dependency-array tweak) is the fix
  // because the actual invariant is "navigate once, ever" — not "only when
  // these particular values happen to be referentially stable."
  const hasRedirectedRef = useRef(false);
  useEffect(() => {
    if (state.status === "signed-out" && !hasRedirectedRef.current) {
      hasRedirectedRef.current = true;
      router.replace(
        `/login?next=${encodeURIComponent(pathname ?? "/settings/areas")}`,
      );
    }
  }, [state.status, pathname, router]);

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

      {/* #742: nobody is signed in. The redirect effect above is already on
          its way to `/login`; this is only the brief frame before that
          navigation lands, so it reuses the same calm, dashed-card shape as
          the "loading" state just above rather than a full alert with its
          own sign-in button — there is nothing left to decide here, the
          door itself renders next. */}
      {state.status === "signed-out" ? (
        <WorkflowLoadingState
          title="Redirecting to sign in"
          description="Areas are stored on your account, not on this device."
        />
      ) : null}

      {/* A GENUINE failure: Supabase reachable, someone is signed in, and the
          load still failed. `state.message` is always plain language — see
          `useAreasLoadState.ts`'s catch block — never the raw caught error,
          so no provider or library text can reach this alert. */}
      {state.status === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>Areas could not load</AlertTitle>
          <AlertDescription>
            <p>{state.message}</p>
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
