import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { createInitialWorkflowState } from "@/lib/workflow";
import {
  ONBOARDING_COMPLETED_KEY,
  requestOnboardingRerun,
} from "@/lib/onboarding/onboarding";
import { useOnboardingRitual } from "./useOnboardingRitual";
import { workflowSeed } from "@/__tests__/helpers/workflowReachability";

function zeroState(): ReturnType<typeof workflowSeed> {
  return { ...createInitialWorkflowState(), areas: [], captureItems: [] };
}

describe("useOnboardingRitual (#581)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("activates on a zero-state session (zero areas, zero captures)", () => {
    const { result } = renderHook(() =>
      useOnboardingRitual({ state: zeroState() }),
    );
    expect(result.current.active).toBe(true);
  });

  it("stays idle when areas exist (the seeded demo state never triggers it)", () => {
    const { result } = renderHook(() =>
      useOnboardingRitual({ state: createInitialWorkflowState() }),
    );
    expect(result.current.active).toBe(false);
    expect(result.current.pending).toBe(false);
  });

  it("stays idle when a capture exists even with zero areas", () => {
    const state = zeroState();
    state.captureItems = [
      {
        id: "capture-1",
        user_id: "mock-user",
        area_id: null,
        raw_text: "already captured",
        capture_mode: "text",
        status: "new",
        inferred_area_confidence: null,
        created_at: new Date().toISOString(),
      },
    ] as ReturnType<typeof workflowSeed>["captureItems"];
    const { result } = renderHook(() => useOnboardingRitual({ state }));
    expect(result.current.active).toBe(false);
  });

  it("never re-shows after complete(): the marker persists across a fresh mount", () => {
    const first = renderHook(() => useOnboardingRitual({ state: zeroState() }));
    expect(first.result.current.active).toBe(true);

    act(() => {
      first.result.current.complete();
    });
    expect(first.result.current.active).toBe(false);
    expect(
      window.localStorage.getItem(ONBOARDING_COMPLETED_KEY),
    ).not.toBeNull();
    first.unmount();

    // Second visit: same zero state, fresh mount — the ritual must not show.
    const second = renderHook(() =>
      useOnboardingRitual({ state: zeroState() }),
    );
    expect(second.result.current.active).toBe(false);
    expect(second.result.current.pending).toBe(false);
  });

  it("a Settings rerun request re-admits the ritual despite existing areas", () => {
    requestOnboardingRerun();
    const { result } = renderHook(() =>
      useOnboardingRitual({ state: createInitialWorkflowState() }),
    );
    expect(result.current.active).toBe(true);

    act(() => {
      result.current.complete();
    });

    const after = renderHook(() =>
      useOnboardingRitual({ state: createInitialWorkflowState() }),
    );
    expect(after.result.current.active).toBe(false);
  });

  it("respects enabled=false", () => {
    const { result } = renderHook(() =>
      useOnboardingRitual({ state: zeroState(), enabled: false }),
    );
    expect(result.current.active).toBe(false);
    expect(result.current.pending).toBe(false);
  });

  // #687 (trigger-truth split verdict) defect 2 — RERUN NOT ONCE.
  // Pre-fix, `complete()` was the only place that cleared the rerun request,
  // so a rerun that never reaches completion (reload mid-ritual) left
  // ONBOARDING_RERUN_KEY="true" forever: every fresh mount thereafter would
  // re-admit the ritual, not just the one the Settings affordance promised.
  it("does not re-admit an ABANDONED rerun on a later mount (fixes the 'once' claim)", () => {
    requestOnboardingRerun();

    // First mount: the rerun request activates the ritual, exactly like the
    // e2e spec's click-through. Nothing here calls complete() — this is the
    // abandon: a reload before any step finishes.
    const first = renderHook(() =>
      useOnboardingRitual({ state: createInitialWorkflowState() }),
    );
    expect(first.result.current.active).toBe(true);
    first.unmount();

    // Second mount (the reload): the account still has its existing areas
    // (never zero-state), and the rerun was never completed. Only a
    // lingering rerun flag could re-admit it — the fix consumes that flag
    // the moment the ritual first activates, so this must now be idle.
    const second = renderHook(() =>
      useOnboardingRitual({ state: createInitialWorkflowState() }),
    );
    expect(second.result.current.active).toBe(false);
    expect(second.result.current.pending).toBe(false);
  });
});
