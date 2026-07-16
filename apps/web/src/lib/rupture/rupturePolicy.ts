export const DEFAULT_RUPTURE_ABSENCE_DAYS = 7;

export type RuptureReason = "absence" | "dismissal_spike";

export type RuptureSuppression = "operator_declared_away" | "sanctuary";

export interface RuptureSignals {
  readonly daysSinceMeaningfulActivity: number;
  readonly dismissalSpike: boolean;
  readonly operatorDeclaredAway: boolean;
  readonly sanctuaryExcluded: boolean;
}

export interface RuptureAssessment {
  readonly ruptured: boolean;
  readonly reasons: readonly RuptureReason[];
  readonly suppressedBy: readonly RuptureSuppression[];
}

export type AdaptiveSurfaceMode = "full" | "minimal" | "progressive";

export interface AdaptiveSurfaceState {
  readonly mode: AdaptiveSurfaceMode;
  readonly reasons: readonly RuptureReason[];
  readonly restoredSurfaceIds: readonly string[];
}

export type AdaptiveSurfaceEvent =
  | {
      readonly type: "rupture_detected";
      readonly assessment: RuptureAssessment;
    }
  | { readonly type: "feature_reused"; readonly surfaceId: string }
  | { readonly type: "show_all" };

const INVALID_SIGNAL = Symbol("invalid-signal");

function readOwnSignal(
  signals: unknown,
  key: keyof RuptureSignals,
): unknown | typeof INVALID_SIGNAL {
  if (
    (typeof signals !== "object" && typeof signals !== "function") ||
    !signals
  ) {
    return INVALID_SIGNAL;
  }

  try {
    const descriptor = Object.getOwnPropertyDescriptor(signals, key);
    return descriptor && "value" in descriptor
      ? descriptor.value
      : INVALID_SIGNAL;
  } catch {
    return INVALID_SIGNAL;
  }
}

export function assessRupture(signals: RuptureSignals): RuptureAssessment {
  const daysSinceMeaningfulActivity = readOwnSignal(
    signals,
    "daysSinceMeaningfulActivity",
  );
  const dismissalSpike = readOwnSignal(signals, "dismissalSpike");
  const operatorDeclaredAway = readOwnSignal(signals, "operatorDeclaredAway");
  const sanctuaryExcluded = readOwnSignal(signals, "sanctuaryExcluded");

  const reasons: RuptureReason[] = [];
  if (
    typeof daysSinceMeaningfulActivity === "number" &&
    Number.isFinite(daysSinceMeaningfulActivity) &&
    Number.isInteger(daysSinceMeaningfulActivity) &&
    daysSinceMeaningfulActivity >= DEFAULT_RUPTURE_ABSENCE_DAYS
  ) {
    reasons.push("absence");
  }
  if (dismissalSpike === true) {
    reasons.push("dismissal_spike");
  }

  const suppressedBy: RuptureSuppression[] = [];
  if (operatorDeclaredAway !== false) {
    suppressedBy.push("operator_declared_away");
  }
  if (sanctuaryExcluded !== false) {
    suppressedBy.push("sanctuary");
  }

  return {
    ruptured: reasons.length > 0 && suppressedBy.length === 0,
    reasons,
    suppressedBy,
  };
}

export function createFullAdaptiveSurfaceState(): AdaptiveSurfaceState {
  return { mode: "full", reasons: [], restoredSurfaceIds: [] };
}

function isValidRuptureAssessment(assessment: RuptureAssessment): boolean {
  if (!assessment || typeof assessment !== "object") {
    return false;
  }

  try {
    if (
      assessment.ruptured !== true ||
      !Array.isArray(assessment.suppressedBy) ||
      assessment.suppressedBy.length !== 0 ||
      !Array.isArray(assessment.reasons) ||
      assessment.reasons.length === 0
    ) {
      return false;
    }

    const expectedOrder: readonly RuptureReason[] = [
      "absence",
      "dismissal_spike",
    ];
    let previousIndex = -1;

    for (const reason of assessment.reasons) {
      const index = expectedOrder.indexOf(reason);
      if (index <= previousIndex) {
        return false;
      }
      previousIndex = index;
    }

    return true;
  } catch {
    return false;
  }
}

export function transitionAdaptiveSurface(
  state: AdaptiveSurfaceState,
  event: AdaptiveSurfaceEvent,
): AdaptiveSurfaceState {
  if (event.type === "show_all") {
    return createFullAdaptiveSurfaceState();
  }

  if (event.type === "rupture_detected") {
    if (!isValidRuptureAssessment(event.assessment)) {
      return state;
    }

    return {
      mode: "minimal",
      reasons: [...event.assessment.reasons],
      restoredSurfaceIds: [],
    };
  }

  if (
    state.mode === "full" ||
    typeof event.surfaceId !== "string" ||
    event.surfaceId.trim().length === 0 ||
    state.restoredSurfaceIds.includes(event.surfaceId)
  ) {
    return state;
  }

  return {
    mode: "progressive",
    reasons: [...state.reasons],
    restoredSurfaceIds: [...state.restoredSurfaceIds, event.surfaceId].sort(),
  };
}
