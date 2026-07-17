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

function snapshotValidRuptureAssessment(
  assessment: RuptureAssessment,
): readonly RuptureReason[] | null {
  if (!assessment || typeof assessment !== "object") {
    return null;
  }

  try {
    const rupturedDescriptor = Object.getOwnPropertyDescriptor(
      assessment,
      "ruptured",
    );
    const suppressedByDescriptor = Object.getOwnPropertyDescriptor(
      assessment,
      "suppressedBy",
    );
    const reasonsDescriptor = Object.getOwnPropertyDescriptor(
      assessment,
      "reasons",
    );

    if (
      !rupturedDescriptor ||
      !("value" in rupturedDescriptor) ||
      rupturedDescriptor.value !== true ||
      !suppressedByDescriptor ||
      !("value" in suppressedByDescriptor) ||
      !reasonsDescriptor ||
      !("value" in reasonsDescriptor)
    ) {
      return null;
    }

    const suppressedBy = suppressedByDescriptor.value as unknown;
    const suppressedLength = Array.isArray(suppressedBy)
      ? Object.getOwnPropertyDescriptor(suppressedBy, "length")
      : undefined;
    if (
      !suppressedLength ||
      !("value" in suppressedLength) ||
      suppressedLength.value !== 0
    ) {
      return null;
    }

    const reasons = reasonsDescriptor.value as unknown;
    const reasonsLength = Array.isArray(reasons)
      ? Object.getOwnPropertyDescriptor(reasons, "length")
      : undefined;
    if (
      !reasonsLength ||
      !("value" in reasonsLength) ||
      typeof reasonsLength.value !== "number" ||
      !Number.isInteger(reasonsLength.value) ||
      reasonsLength.value <= 0
    ) {
      return null;
    }

    const expectedOrder: readonly RuptureReason[] = [
      "absence",
      "dismissal_spike",
    ];
    const snapshot: RuptureReason[] = [];
    let previousIndex = -1;

    for (let position = 0; position < reasonsLength.value; position += 1) {
      const reasonDescriptor = Object.getOwnPropertyDescriptor(
        reasons,
        String(position),
      );
      if (!reasonDescriptor || !("value" in reasonDescriptor)) {
        return null;
      }

      const reason = reasonDescriptor.value as unknown;
      if (reason !== "absence" && reason !== "dismissal_spike") {
        return null;
      }
      const index = expectedOrder.indexOf(reason);
      if (index <= previousIndex) {
        return null;
      }
      snapshot.push(reason);
      previousIndex = index;
    }

    return Object.freeze(snapshot);
  } catch {
    return null;
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
    const reasons = snapshotValidRuptureAssessment(event.assessment);
    if (!reasons) {
      return state;
    }

    return {
      mode: "minimal",
      reasons: [...reasons],
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
