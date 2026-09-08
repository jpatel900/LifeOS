"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WorkflowState } from "@/lib/workflow";
import {
  clearOnboardingRerunRequest,
  hasCompletedOnboarding,
  isOnboardingRerunRequested,
  markOnboardingCompleted,
  shouldShowOnboarding,
} from "@/lib/onboarding/onboarding";

/**
 * #581 — client-side state machine for the onboarding ritual, mirroring
 * useReEntryRitual.ts: the eligibility decision is computed from live
 * WorkflowContext state (read-only) until it first fires, then LATCHED for
 * the session — persisting areas in step 1 flips the zero-state predicate
 * false mid-ritual, and re-deriving from live state would yank the ritual
 * off screen between steps.
 *
 * The predicate is intentionally evaluated on every state change until it
 * latches (not once at mount): the provider hydrates from sessionStorage
 * and syncs persisted areas asynchronously AFTER first render, so a
 * genuinely-zero-state account only becomes visible as such one or two
 * commits in.
 *
 * #687 defect 2 — the Settings "run setup again" rerun request is consumed
 * the moment the ritual LATCHES active, not when it later completes. An
 * abandoned rerun (reload mid-ritual, before any step finishes) must not
 * re-admit the ritual forever: `shouldShowOnboarding` checks the rerun flag
 * first, so clearing it late (only in `complete()`) left it "true" across
 * every reload between the rerun click and an eventual completion.
 *
 * C3 (onboarding own-URL) — a verifier-found regression this hook must not
 * regrow: TWO components now call this hook against the SAME live
 * WorkflowContext state for two DIFFERENT reasons — `TodayMoments.tsx`'s
 * thin wrapper on `/` (which only ever needs to DETECT eligibility, to hand
 * off to `/welcome`) and `/welcome`'s own page (which actually RENDERS the
 * ritual). Both are separate hook instances with their own `latchedRef`; if
 * BOTH consumed the rerun flag independently, whichever one's `candidate`
 * turned true FIRST (previously always the `/` wrapper, since its effect
 * registers and fires before its own redirect effect does, in the same
 * commit) cleared the one-shot flag before the OTHER instance — the one
 * that actually shows the ritual — ever got a chance to read it, silently
 * swallowing a Settings-requested rerun. `consumeRerunOnActivate` (default
 * true) lets a detect-only caller opt OUT of consuming, so exactly one
 * instance — the one that renders — ever clears the flag.
 */

export type OnboardingRitualStatus = "idle" | "active" | "done";

export interface UseOnboardingRitualInput {
  state: WorkflowState;
  enabled?: boolean;
  /**
   * Whether THIS hook instance's activation clears the Settings rerun
   * request (see the file header above). Default true — the common case is
   * one hook instance per mount that both detects eligibility and renders
   * the ritual. Pass `false` for a detect-only instance (one that only
   * redirects elsewhere on eligibility, never renders the ritual itself) so
   * the instance that actually renders is guaranteed to still see the flag.
   */
  consumeRerunOnActivate?: boolean;
}

export interface UseOnboardingRitualResult {
  status: OnboardingRitualStatus;
  active: boolean;
  /**
   * True on the render where eligibility has been detected but the mount
   * effect has not yet flushed `status` past "idle" — consumers that must
   * not race the ritual for screen ownership (deep-link shims, the
   * re-entry ritual) treat this the same as active. Mirrors
   * useReEntryRitual's `pending`.
   */
  pending: boolean;
  complete(): void;
}

export function useOnboardingRitual(
  input: UseOnboardingRitualInput,
): UseOnboardingRitualResult {
  const { state, enabled = true, consumeRerunOnActivate = true } = input;

  const [status, setStatus] = useState<OnboardingRitualStatus>("idle");
  const latchedRef = useRef(false);

  const candidate = useMemo(() => {
    if (!enabled || latchedRef.current) return false;
    if (typeof window === "undefined") return false;
    return shouldShowOnboarding({
      areaCount: state.areas.length,
      captureCount: state.captureItems.length,
      completed: hasCompletedOnboarding(),
      rerunRequested: isOnboardingRerunRequested(),
    });
  }, [enabled, state.areas.length, state.captureItems.length]);

  useEffect(() => {
    if (latchedRef.current || !candidate) return;
    latchedRef.current = true;
    // #687 defect 2: consume the rerun request HERE, on activation — not in
    // complete() — so an abandoned rerun (reload before any step finishes)
    // cannot re-admit the ritual on every subsequent visit. A no-op when
    // this activation was the ordinary zero-state trigger (nothing to
    // clear). C3: gated on `consumeRerunOnActivate` — see the file header's
    // "TWO components" comment for why a detect-only caller must not do
    // this.
    if (consumeRerunOnActivate) {
      clearOnboardingRerunRequest();
    }
    setStatus("active");
  }, [candidate, consumeRerunOnActivate]);

  const complete = useCallback(() => {
    markOnboardingCompleted();
    setStatus("done");
  }, []);

  return {
    status,
    active: status === "active",
    pending: status === "idle" && candidate,
    complete,
  };
}
