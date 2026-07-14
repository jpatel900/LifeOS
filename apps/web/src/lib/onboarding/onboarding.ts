/**
 * #581 (epic #555 item 7) — onboarding ritual trigger + device-local records.
 *
 * The trigger is the deterministic zero-state predicate from the design note
 * (docs/implementation-planning/plan-onboarding-ritual.md): first session
 * with zero areas AND zero captures, read-only over WorkflowContext state.
 * Completing (or skipping through) the ritual persists areas, so the
 * predicate can never re-fire for a real account; the device-local completed
 * record below is the belt-and-braces guarantee for the "re-entry never
 * shows it again" clause even when persistence was skipped or failed.
 *
 * The "run setup again" Settings affordance writes a rerun request, which
 * force-shows the ritual exactly once regardless of state (an active account
 * has areas + captures, so the zero-state predicate alone could never
 * re-admit it).
 *
 * Storage idiom (try/catch-guarded localStorage) mirrors
 * useReEntryRitual.ts's suppression record and TodayMoments' preferences.
 *
 * Day-shape preferences (step 2): the repo has NO server-side home for a
 * work-window/session-length preference (no user_preferences table; the
 * focus-budget working window in lib/focus/dailyFocusBudget.ts is a
 * documented fixed constant). Per the design note's "no new tables" rule,
 * these persist device-locally on the same localStorage idiom the moments
 * home already uses for its own preferences. `readDayShapePreferences`
 * returns null when nothing was ever saved so consumers keep their existing
 * defaults untouched until the user actually chooses.
 */

export const ONBOARDING_COMPLETED_KEY = "lifeos.onboarding.completed";
export const ONBOARDING_RERUN_KEY = "lifeos.onboarding.rerun";
export const DAY_SHAPE_PREFERENCES_KEY = "lifeos.preferences.dayShape";

export const SESSION_LENGTH_OPTIONS = [25, 45, 60] as const;
export type SessionLengthMinutes = (typeof SESSION_LENGTH_OPTIONS)[number];

export interface DayShapePreferences {
  /** Local hour (0-23) the work window opens. Ritual prefill: 9. */
  workStartHour: number;
  /** Local hour (0-23) the work window closes. Ritual prefill: 17. */
  workEndHour: number;
  /** Preferred focus session length. Ritual prefill: 45. */
  sessionMinutes: SessionLengthMinutes;
}

export const DEFAULT_DAY_SHAPE: DayShapePreferences = {
  workStartHour: 9,
  workEndHour: 17,
  sessionMinutes: 45,
};

export interface OnboardingTriggerInput {
  /** `state.areas.length` from WorkflowContext (read-only). */
  areaCount: number;
  /** `state.captureItems.length` from WorkflowContext (read-only). */
  captureCount: number;
  /** Device-local completed record exists. */
  completed: boolean;
  /** Settings "run setup again" request is pending. */
  rerunRequested: boolean;
}

/**
 * Deterministic trigger predicate. Pure — all inputs injected so it is
 * independently unit-testable (the oracle's "zero-state only; second visit
 * never shows it").
 */
export function shouldShowOnboarding(input: OnboardingTriggerInput): boolean {
  if (input.rerunRequested) {
    return true;
  }
  if (input.completed) {
    return false;
  }
  return input.areaCount === 0 && input.captureCount === 0;
}

function safeLocalStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function hasCompletedOnboarding(): boolean {
  try {
    const raw = safeLocalStorage()?.getItem(ONBOARDING_COMPLETED_KEY);
    return raw !== null && raw !== undefined;
  } catch {
    return false;
  }
}

export function markOnboardingCompleted(now: Date = new Date()): void {
  try {
    safeLocalStorage()?.setItem(
      ONBOARDING_COMPLETED_KEY,
      JSON.stringify({ completedAt: now.toISOString() }),
    );
  } catch {
    // Blocked storage — the persisted areas/captures still keep the
    // predicate false for real accounts.
  }
}

export function isOnboardingRerunRequested(): boolean {
  try {
    return safeLocalStorage()?.getItem(ONBOARDING_RERUN_KEY) === "true";
  } catch {
    return false;
  }
}

export function requestOnboardingRerun(): void {
  try {
    safeLocalStorage()?.setItem(ONBOARDING_RERUN_KEY, "true");
  } catch {
    // Blocked storage — the affordance silently cannot force a rerun.
  }
}

export function clearOnboardingRerunRequest(): void {
  try {
    safeLocalStorage()?.removeItem(ONBOARDING_RERUN_KEY);
  } catch {
    // Blocked storage — nothing to clear.
  }
}

function isSessionLength(value: unknown): value is SessionLengthMinutes {
  return SESSION_LENGTH_OPTIONS.some((option) => option === value);
}

function isValidHour(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 23
  );
}

/**
 * Saved day-shape preferences, or null when the user never saved any (so
 * consumers keep their pre-existing defaults — e.g. the moments home's
 * 25-minute focus fallback stays exactly as it was before this slice).
 */
export function readDayShapePreferences(): DayShapePreferences | null {
  try {
    const raw = safeLocalStorage()?.getItem(DAY_SHAPE_PREFERENCES_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") return null;
    const record = parsed as Partial<DayShapePreferences>;
    if (
      !isValidHour(record.workStartHour) ||
      !isValidHour(record.workEndHour) ||
      !isSessionLength(record.sessionMinutes) ||
      record.workStartHour >= record.workEndHour
    ) {
      return null;
    }
    return {
      workStartHour: record.workStartHour,
      workEndHour: record.workEndHour,
      sessionMinutes: record.sessionMinutes,
    };
  } catch {
    return null;
  }
}

export function writeDayShapePreferences(prefs: DayShapePreferences): void {
  try {
    safeLocalStorage()?.setItem(
      DAY_SHAPE_PREFERENCES_KEY,
      JSON.stringify(prefs),
    );
  } catch {
    // Blocked storage — the ritual still completes; defaults stay in effect.
  }
}
