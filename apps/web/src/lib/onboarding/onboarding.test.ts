import { beforeEach, describe, expect, it } from "vitest";
import {
  DAY_SHAPE_PREFERENCES_KEY,
  DEFAULT_DAY_SHAPE,
  ONBOARDING_COMPLETED_KEY,
  ONBOARDING_RERUN_KEY,
  clearOnboardingRerunRequest,
  hasCompletedOnboarding,
  isOnboardingRerunRequested,
  markOnboardingCompleted,
  readDayShapePreferences,
  requestOnboardingRerun,
  shouldShowOnboarding,
  writeDayShapePreferences,
} from "./onboarding";

describe("shouldShowOnboarding (zero-state trigger, #581)", () => {
  it("fires on the zero state: zero areas AND zero captures, nothing recorded", () => {
    expect(
      shouldShowOnboarding({
        areaCount: 0,
        captureCount: 0,
        completed: false,
        rerunRequested: false,
      }),
    ).toBe(true);
  });

  it("never fires once any area exists", () => {
    expect(
      shouldShowOnboarding({
        areaCount: 1,
        captureCount: 0,
        completed: false,
        rerunRequested: false,
      }),
    ).toBe(false);
  });

  it("never fires once any capture exists", () => {
    expect(
      shouldShowOnboarding({
        areaCount: 0,
        captureCount: 1,
        completed: false,
        rerunRequested: false,
      }),
    ).toBe(false);
  });

  it("never fires again after completion, even on a zero state (second visit)", () => {
    expect(
      shouldShowOnboarding({
        areaCount: 0,
        captureCount: 0,
        completed: true,
        rerunRequested: false,
      }),
    ).toBe(false);
  });

  it("a Settings rerun request re-admits the ritual regardless of state", () => {
    expect(
      shouldShowOnboarding({
        areaCount: 5,
        captureCount: 12,
        completed: true,
        rerunRequested: true,
      }),
    ).toBe(true);
  });
});

describe("device-local onboarding records", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("completion marker round-trips", () => {
    expect(hasCompletedOnboarding()).toBe(false);
    markOnboardingCompleted(new Date("2026-07-14T12:00:00.000Z"));
    expect(hasCompletedOnboarding()).toBe(true);
    expect(window.localStorage.getItem(ONBOARDING_COMPLETED_KEY)).toContain(
      "2026-07-14T12:00:00.000Z",
    );
  });

  it("rerun request round-trips and clears", () => {
    expect(isOnboardingRerunRequested()).toBe(false);
    requestOnboardingRerun();
    expect(isOnboardingRerunRequested()).toBe(true);
    expect(window.localStorage.getItem(ONBOARDING_RERUN_KEY)).toBe("true");
    clearOnboardingRerunRequest();
    expect(isOnboardingRerunRequested()).toBe(false);
  });
});

describe("day-shape preferences (step 2 persistence)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns null when nothing was ever saved (existing defaults stay in effect)", () => {
    expect(readDayShapePreferences()).toBeNull();
  });

  it("round-trips a saved preference", () => {
    writeDayShapePreferences({
      workStartHour: 8,
      workEndHour: 16,
      sessionMinutes: 60,
    });
    expect(readDayShapePreferences()).toEqual({
      workStartHour: 8,
      workEndHour: 16,
      sessionMinutes: 60,
    });
  });

  it("rejects malformed or invalid records instead of propagating them", () => {
    window.localStorage.setItem(DAY_SHAPE_PREFERENCES_KEY, "not json {");
    expect(readDayShapePreferences()).toBeNull();

    window.localStorage.setItem(
      DAY_SHAPE_PREFERENCES_KEY,
      JSON.stringify({ workStartHour: 18, workEndHour: 9, sessionMinutes: 45 }),
    );
    expect(readDayShapePreferences()).toBeNull();

    window.localStorage.setItem(
      DAY_SHAPE_PREFERENCES_KEY,
      JSON.stringify({ workStartHour: 9, workEndHour: 17, sessionMinutes: 30 }),
    );
    expect(readDayShapePreferences()).toBeNull();
  });

  it("documents the ritual prefill defaults (9-17, 45 minutes)", () => {
    expect(DEFAULT_DAY_SHAPE).toEqual({
      workStartHour: 9,
      workEndHour: 17,
      sessionMinutes: 45,
    });
  });
});
