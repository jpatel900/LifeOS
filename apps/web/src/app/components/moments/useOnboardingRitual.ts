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
 */

export type OnboardingRitualStatus = "idle" | "active" | "done";

export interface UseOnboardingRitualInput {
  state: WorkflowState;
  enabled?: boolean;
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
  const { state, enabled = true } = input;

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
    setStatus("active");
  }, [candidate]);

  const complete = useCallback(() => {
    markOnboardingCompleted();
    clearOnboardingRerunRequest();
    setStatus("done");
  }, []);

  return {
    status,
    active: status === "active",
    pending: status === "idle" && candidate,
    complete,
  };
}
