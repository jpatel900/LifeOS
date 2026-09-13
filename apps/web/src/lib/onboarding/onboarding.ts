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
// C3 (onboarding own-URL): the ritual now completes on `/welcome`, which
// hands off to Today (`/`) via a plain `router.replace` — a navigation
// carries no message of its own. This one-shot sessionStorage record is how
// `/welcome`'s page.tsx tells Today which payoff toast to show. sessionStorage
// (not localStorage): it must survive exactly the one hand-off navigation,
// never a later session — same reasoning as TodayMoments.tsx's own
// CAPTURE_DRAFT_KEY.
export const ONBOARDING_OUTCOME_TOAST_KEY = "lifeos.onboarding.outcomeToast";

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

function safeSessionStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * C3 (onboarding own-URL): called by `/welcome`'s page.tsx immediately
 * before it hands off to Today (`router.replace("/")`) on ritual completion.
 * `outcome` mirrors `OnboardingRitual`'s own `OnboardingOutcome` union
 * (`"captured" | "skipped"`) by value, not by importing that component's
 * type — this module is imported by `OnboardingRitual.tsx` itself, and this
 * keeps the dependency one-directional.
 */
export function writeOnboardingOutcomeToast(
  outcome: "captured" | "skipped",
): void {
  try {
    safeSessionStorage()?.setItem(ONBOARDING_OUTCOME_TOAST_KEY, outcome);
  } catch {
    // Blocked storage — the hand-off still happens; Today just shows no toast.
  }
}

/**
 * Read-once-and-clear: Today's mount effect calls this exactly once so a
 * later reload of `/` never repeats a toast for a hand-off that already
 * happened. Returns null when nothing was staged (the ordinary case — most
 * visits to Today do not follow an onboarding completion).
 */
export function readAndClearOnboardingOutcomeToast():
  | "captured"
  | "skipped"
  | null {
  try {
    const storage = safeSessionStorage();
    const raw = storage?.getItem(ONBOARDING_OUTCOME_TOAST_KEY) ?? null;
    if (raw !== "captured" && raw !== "skipped") return null;
    storage?.removeItem(ONBOARDING_OUTCOME_TOAST_KEY);
    return raw;
  } catch {
    return null;
  }
}

/**
 * C3 (onboarding own-URL) — a non-consuming peek at the same one-shot
 * record `writeOnboardingOutcomeToast`/`readAndClearOnboardingOutcomeToast`
 * share, used by `TodayMoments.tsx`'s wrapper to force the Start moment
 * exactly this once, WITHOUT clearing the record — clearing stays the sole
 * job of `readAndClearOnboardingOutcomeToast`'s own consumer (Today's toast
 * effect), so the two reads can never race each other into double-clearing
 * or a lost toast. Its presence at all is itself the signal ("did the
 * ritual just hand off here"); the outcome value carried is irrelevant to
 * this caller.
 *
 * This exists because the pre-C3 inline ritual forced `setMoment("start")`
 * directly on `TodayMoments`' own local state on completion — state
 * `/welcome` (a different route) has no access to. A `?moment=start` URL
 * param was tried first, red-handed on the real dev server (not jsdom):
 * `tests/e2e/onboarding-ritual.spec.ts`'s completion assertion landed on
 * Close, not Start, even though the address bar carried `?moment=start` at
 * the hand-off. Correction (this comment previously overstated the cause):
 * `resolvedInitialMoment`'s `isRemount` staleness check
 * (`TodayMoments.tsx`) only gates the SERVER-passed `deepLink` PROP tier —
 * the live `window.location.search` read a few lines below it is NOT
 * isRemount-gated, so that theory does not by itself explain the failure.
 * The exact mechanism was not pinned down further (candidates include
 * ordering between the client router's history write and this component's
 * own `useState` initializer running); rather than keep guessing, this
 * reads the `initialMoment` PROP instead, which is checked FIRST and
 * unconditionally in `resolvedInitialMoment` — it bypasses every URL/
 * deepLink/cookie resolution tier entirely, so it is correct regardless of
 * which of them the real cause turns out to be.
 */
export function hasStagedOnboardingOutcomeToast(): boolean {
  try {
    return safeSessionStorage()?.getItem(ONBOARDING_OUTCOME_TOAST_KEY) != null;
  } catch {
    return false;
  }
}
