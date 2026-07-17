import { isSanctuaryExcluded } from "../privacy/sanctuary";

/**
 * FR-033 Purpose Gauge — deterministic offer/response sampling policy
 * (issue #633). Pure policy machinery only: no UI, persistence, observation
 * write, offer-history derivation, or learning consumer is claimed here.
 *
 * Sampling dates ratified on #633: four fixed local-calendar days give at
 * most 4 offers/month (FR-033's "sampled, at most ~4×/month, never daily")
 * deterministically, with no clock read inside the policy — the caller
 * supplies the local day of month, so day authority stays client-side.
 * Days 29–31 are never sample days, so every month (February included)
 * yields exactly four eligible days.
 *
 * Hostile-container boundary (CONTRACT CORRECTION v1, same platform limit
 * ratified on #638): accessor fields are rejected WITHOUT executing getters
 * and inspection is wrapped so throwing/revoked/malformed proxies fail
 * closed — but a fully transparent Proxy over a plain record is
 * observationally indistinguishable from its target in portable browser JS
 * (no side-effect-free isProxy exists), so it may behave exactly like that
 * target. Documented platform limitation, not a trust claim.
 */

export const PURPOSE_GAUGE_SAMPLE_DAYS: readonly number[] = Object.freeze([
  4, 12, 20, 28,
]);

export const PURPOSE_GAUGE_RESPONSES = Object.freeze([
  "lighter",
  "even",
  "heavier",
] as const);

export type PurposeGaugeResponse = (typeof PURPOSE_GAUGE_RESPONSES)[number];

export interface PurposeGaugeOfferInput {
  readonly localDayOfMonth: number;
  readonly alreadyOfferedToday: boolean;
  readonly sanctuaryContext: unknown;
}

const OFFER_FIELDS = [
  "localDayOfMonth",
  "alreadyOfferedToday",
  "sanctuaryContext",
] as const;

const INVALID_INPUT = Symbol("invalid-input");

type OfferSnapshot = Readonly<{
  localDayOfMonth: unknown;
  alreadyOfferedToday: unknown;
  sanctuaryContext: unknown;
}>;

function snapshotOfferInput(
  input: unknown,
): OfferSnapshot | typeof INVALID_INPUT {
  if (typeof input !== "object" || input === null) {
    return INVALID_INPUT;
  }

  try {
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) {
      return INVALID_INPUT;
    }

    const values: unknown[] = [];
    for (const field of OFFER_FIELDS) {
      const descriptor = Object.getOwnPropertyDescriptor(input, field);
      // Accessor properties are rejected here without ever invoking the
      // getter: "value" is only present on data properties.
      if (descriptor === undefined || !("value" in descriptor)) {
        return INVALID_INPUT;
      }
      values.push(descriptor.value);
    }

    return {
      localDayOfMonth: values[0],
      alreadyOfferedToday: values[1],
      sanctuaryContext: values[2],
    };
  } catch {
    return INVALID_INPUT;
  }
}

/**
 * True ONLY when every gate passes on a one-time snapshot of the input:
 * exact-integer sample day, alreadyOfferedToday exactly false, and the
 * Sanctuary predicate (#627, imported — never duplicated) reports not
 * excluded. Anything malformed, hostile, or uncertain fails closed to "no
 * offer" and never throws.
 */
export function shouldOfferPurposeGauge(input: unknown): boolean {
  const snapshot = snapshotOfferInput(input);
  if (snapshot === INVALID_INPUT) {
    return false;
  }

  const { localDayOfMonth, alreadyOfferedToday, sanctuaryContext } = snapshot;

  if (
    typeof localDayOfMonth !== "number" ||
    !Number.isFinite(localDayOfMonth) ||
    !Number.isInteger(localDayOfMonth) ||
    !PURPOSE_GAUGE_SAMPLE_DAYS.includes(localDayOfMonth)
  ) {
    return false;
  }

  if (alreadyOfferedToday !== false) {
    return false;
  }

  try {
    if (isSanctuaryExcluded(sanctuaryContext)) {
      return false;
    }
  } catch {
    return false;
  }

  return true;
}

/**
 * Accepts only the three exact case-sensitive response values; everything
 * else (skip, blank, casing drift, objects, numbers) returns null. A null
 * creates no observation and can never become a signal (FR-033: a skipped
 * or absent check is never counted, shown, or treated as signal).
 */
export function parsePurposeGaugeResponse(
  value: unknown,
): PurposeGaugeResponse | null {
  if (typeof value !== "string") {
    return null;
  }

  return (PURPOSE_GAUGE_RESPONSES as readonly string[]).includes(value)
    ? (value as PurposeGaugeResponse)
    : null;
}
