"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DiagnosticsDisclosure } from "../../components/DiagnosticsDisclosure";
import { WorkflowLoadingState } from "../../components/WorkflowLoadingState";
import { saveModeLabel } from "../../../lib/statusVocabulary";
import { createSupabaseBrowserClient } from "../../../lib/supabase/browser";
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

  // Part of #960 (defect 3): `useAreasLoadState.ts`'s `loadAreas` effect
  // runs exactly once on mount and NEVER re-checks — if that one call fails
  // signed-out-shaped, `state.status` latches "signed-out" forever, even if
  // the auth client itself resolves a session afterward.
  //
  // IMPORTANT, honest scope (independent review, see PR discussion): the
  // actual production trigger for defect 3 — a real reload where a session
  // restores AFTER this redirect would have fired — is still UNPROVEN.
  // `GoTrueClient`'s own `getUser()` and `onAuthStateChange` both await the
  // same internal `initializePromise`, and on an "Auth session missing" 401
  // the client clears its stored session BEFORE that promise resolves — so
  // within ONE document load there is no window where the first check fails
  // signed-out-shaped and a LATER `onAuthStateChange` callback from that same
  // initialization still reports a session. What this subscription actually
  // rescues is narrower than "any session that resolves later": two real
  // windows only —
  //   1. a session becoming valid in ANOTHER tab, forwarded to this one
  //      through the same client instance (storage/broadcast event), and
  //   2. a `TOKEN_REFRESHED` (or other) transition firing after
  //      initialization has already completed.
  // Runtime instrumentation is still needed to confirm which (if either) is
  // what real users hit. Until then, treat this as honest hardening against
  // those two windows — not a proven fix for the exact defect-3 repro.
  //
  // The fix does not touch `hasRedirectedRef`'s once-ever guard above; it
  // changes what feeds the CONDITION. Instead of redirecting the instant
  // `state.status` turns "signed-out", this subscribes to the auth client's
  // own `onAuthStateChange` transition — the same primitive
  // `AuthAffordance.tsx` already uses to track presence — and only
  // redirects once that transition reports there really is no session.
  //
  // No `sessionStorage` reload-count sentinel was added on top of
  // `sessionConfirmedRef` (considered on review). `sessionConfirmedRef`
  // already closes the one repeat-reload gap that existed WITHIN a single
  // document (a second session-bearing event before the scheduled reload
  // lands — see the check inside the callback below). A reload loop ACROSS
  // multiple fresh document loads would require the underlying auth state
  // itself to flap between signed-out and signed-in on every single mount,
  // which is a production auth/session bug in its own right, not something
  // a client-side sentinel here should paper over — and a counter cheap
  // enough to add without its own edge cases (when does it reset? what
  // resets it after a real, wanted reload?) would still not catch that.
  const sessionConfirmedRef = useRef<"unconfirmed" | "signed-in">(
    "unconfirmed",
  );
  useEffect(() => {
    if (state.status !== "signed-out" || hasRedirectedRef.current) {
      return;
    }

    const client = createSupabaseBrowserClient();
    if (!client?.auth) {
      // No auth client at all (Supabase not configured): nothing can ever
      // confirm a session, so there is nothing to wait for — same behavior
      // as before this fix.
      hasRedirectedRef.current = true;
      router.replace(
        `/login?next=${encodeURIComponent(pathname ?? "/settings/areas")}`,
      );
      return;
    }

    let active = true;
    const { data: subscription } = client.auth.onAuthStateChange(
      (_event, session) => {
        if (!active || hasRedirectedRef.current) return;
        if (session) {
          // A session showed up after all. `state.status` is STILL
          // "signed-out" though — `useAreasLoadState`'s mount effect already
          // burned its one shot and will never re-check on its own (that is
          // the entire reason this effect exists and is subscribed at all;
          // see the guard above). Just cancelling the redirect here would
          // strand the visitor on the permanent "Checking your sign-in…"
          // screen below with no areas and no retry. A full reload is the
          // smallest honest recovery: a fresh mount re-runs everything
          // (this effect, `useAreasLoadState`'s own load) against the now-
          // confirmed session.
          //
          // `sessionConfirmedRef` doubles as the once-per-document reload
          // sentinel: `window.location.reload()` only SCHEDULES a
          // navigation — it does not unmount this component or stop JS
          // synchronously, so a SECOND session-bearing event (another tab
          // signing in again, a second `TOKEN_REFRESHED`) could otherwise
          // re-enter this branch and call `reload()` a second time before
          // the first reload actually lands. Checking the ref before acting
          // makes that a no-op instead. The same ref, checked in the `else`
          // branch below, is also what stops a LATER `null`-session event
          // (e.g. a cross-tab sign-out) from redirecting after a session was
          // already confirmed here — not anything about the reload itself.
          if (sessionConfirmedRef.current === "signed-in") return;
          sessionConfirmedRef.current = "signed-in";
          if (typeof window !== "undefined") {
            window.location.reload();
          }
          return;
        }
        if (sessionConfirmedRef.current === "signed-in") return;
        hasRedirectedRef.current = true;
        router.replace(
          `/login?next=${encodeURIComponent(pathname ?? "/settings/areas")}`,
        );
      },
    );

    return () => {
      active = false;
      subscription?.subscription?.unsubscribe();
    };
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
    // #687 round-8 finding 3 (fresh-eyes judge): this page had ZERO `<main>`
    // landmarks and, combined with `AppShell.tsx`'s own nav `<header>`
    // sitting outside any main, TWO top-level (banner-mapped) headers —
    // neither this page's own "Areas" header below nor AdminShell's nav
    // header had any `<main>` ancestor. Making THIS the one `<main>` (not a
    // second wrapper in AppShell.tsx — see that file's own comment) demotes
    // this page's own header from `banner` to a plain nested header for
    // free (the ARIA host-language mapping: `<header>` only maps to
    // `banner` when it has no `main`/`article`/`aside`/`nav`/`section`
    // ancestor), leaving AdminShell's nav header as the one remaining
    // top-level header — matching home's own contract (one main, wrapping
    // everything below its own masthead). `id="stage-content"` is
    // `AppShell.tsx`'s skip-link target; `tabIndex={-1}` makes it a valid
    // programmatic focus target without adding it to the Tab order, same as
    // `MomentsThemeShell.tsx`'s `#stage-content` div.
    <main id="stage-content" tabIndex={-1} className="flex flex-col gap-6">
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

      {/* #742: `useAreasLoadState` classified the load signed-out-shaped, and
          the redirect effect above is deciding what to do about it. Two
          honest outcomes share this one frame, which is why the copy stays
          neutral instead of naming either ("Redirecting to sign in" was
          wrong for the second one — copy-truth doctrine, caught on review):
            - almost always: the effect confirms there is no session and
              sends the visitor to `/login` — this is the brief frame before
              that navigation lands; or
            - the narrow rescue window (see the redirect effect's own
              comment): a session gets confirmed after this status latched,
              and the effect reloads the page in place instead of
              navigating anywhere.
          Either way there is nothing left to decide here and nothing the
          visitor can do from this screen, so it keeps the same calm,
          dashed-card shape as the "loading" state just above rather than a
          full alert. */}
      {state.status === "signed-out" ? (
        <WorkflowLoadingState
          title="Checking your sign-in…"
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
    </main>
  );
}
