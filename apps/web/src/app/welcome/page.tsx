"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWorkflow } from "@/lib/WorkflowContext";
import { writeOnboardingOutcomeToast } from "@/lib/onboarding/onboarding";
import { useOnboardingRitual } from "@/app/components/moments/useOnboardingRitual";
import {
  OnboardingRitual,
  type OnboardingOutcome,
} from "@/app/components/moments/OnboardingRitual";
import { MomentsThemeShell } from "@/app/components/moments/MomentsThemeShell";

/**
 * C3 (Part of #687, C3 card 10) — the setup ritual's own route.
 *
 * Previously the ritual (`OnboardingRitual.tsx`) rendered INLINE inside
 * `TodayMoments.tsx`, standing in for the moments home at `/` with no
 * address of its own — a fresh account and a returning one were
 * indistinguishable in the URL bar, reload landed wherever `/` happened to
 * resolve, and Back had no ritual-shaped step to walk. This route gives the
 * ritual real address-bar truth instead: `/welcome` while it is showing,
 * `/` (Today) once it is done.
 *
 * Eligibility is unchanged — the same deterministic zero-state predicate
 * (`useOnboardingRitual`, `lib/onboarding/onboarding.ts`'s
 * `shouldShowOnboarding`), read from the same `WorkflowContext` this page
 * shares with Today (`WorkflowProvider` mounts once at the root layout, see
 * `AppShell.tsx` — no route-scoped state to duplicate). `TodayMoments.tsx`
 * still runs this same hook on `/`: it is what DETECTS eligibility (the
 * predicate needs live state that only settles a render or two after
 * mount — see the hook's own doc comment) and hands off here via
 * `router.replace("/welcome")`, a client-side navigation with no reload.
 * This page independently re-derives the same predicate rather than trusting
 * a query param, so a hard reload or a direct visit to `/welcome` (bookmark,
 * typed URL) answers exactly the same way `/` would have.
 *
 * Ineligible visits (an established account, or the ritual already
 * completed) bounce straight back to Today — the mirror image of the
 * hand-off `/` performs, so `/welcome` never strands a signed-in account
 * that has nothing left to set up.
 *
 * Caught red-first (`page.test.tsx`): a genuinely zero-state account is NOT
 * eligible on the very first render either — `state.areas`/`state.captureItems`
 * start from `WorkflowContext`'s synchronous mock/demo defaults and only
 * settle to the account's real (empty) rows a render or two later, once the
 * areas readback resolves (same "one or two commits" caveat
 * `useOnboardingRitual`'s own doc comment already names). Gating this
 * redirect on `areasReadbackSettled` — false until that readback (Supabase
 * or the demo local-only fallback) finishes — stops it from firing on that
 * transient false negative and bouncing a real brand-new account straight
 * back to Today before the ritual ever gets a chance to latch active.
 */
export default function WelcomePage() {
  const router = useRouter();
  const {
    state,
    selectedAreaId,
    syncPersistedAreas,
    submitCaptureText,
    areasReadbackSettled,
  } = useWorkflow();
  const onboarding = useOnboardingRitual({ state });
  const showRitual = onboarding.active;
  const eligible = onboarding.active || onboarding.pending;

  // Mirrors `/`'s own hand-off effect in reverse: once eligibility resolves
  // to "no" (an established account landed here directly, or this same
  // account already finished — `onboarding.complete()` marks it durable
  // before this fires), there is nothing left to set up. `replace`, not
  // `push`: `/welcome` never belongs as a Back-able step once it has nothing
  // to show, the same reasoning `handleComplete` below already applies to
  // the ritual's own completion hand-off.
  useEffect(() => {
    if (!areasReadbackSettled) return;
    if (eligible) return;
    router.replace("/");
  }, [areasReadbackSettled, eligible, router]);

  function handleComplete(outcome: OnboardingOutcome) {
    // Stashed for Today's mount effect to pick up and clear (see
    // `writeOnboardingOutcomeToast`'s own doc comment) — a plain
    // `router.replace` carries no message of its own. The SAME record also
    // tells `TodayMoments.tsx`'s wrapper to force the Start moment (the
    // design note's payoff — see `hasStagedOnboardingOutcomeToast`'s own doc
    // comment for why that goes through this record rather than a
    // `?moment=start` URL param, which turned out NOT to be reliable here).
    writeOnboardingOutcomeToast(outcome);
    onboarding.complete();
    router.replace("/");
  }

  return (
    <MomentsThemeShell>
      <section
        id="stage-content"
        tabIndex={-1}
        className="grid gap-6 focus:outline-none"
        data-testid="welcome-screen"
      >
        {showRitual ? (
          <OnboardingRitual
            onSubmit={(text, hook) =>
              submitCaptureText(text, selectedAreaId, hook)
            }
            onAreasPersisted={syncPersistedAreas}
            onComplete={handleComplete}
          />
        ) : null}
      </section>
    </MomentsThemeShell>
  );
}
