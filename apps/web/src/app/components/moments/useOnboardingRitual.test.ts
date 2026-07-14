import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { createInitialWorkflowState, type WorkflowState } from "@/lib/workflow";
import {
  ONBOARDING_COMPLETED_KEY,
  requestOnboardingRerun,
} from "@/lib/onboarding/onboarding";
import { useOnboardingRitual } from "./useOnboardingRitual";

function zeroState(): WorkflowState {
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
    ] as WorkflowState["captureItems"];
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
});
