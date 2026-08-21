/**
 * Moments pass P6 — packet: deep-link fallback shims.
 *
 * Parses the moments home's own query params (`?moment=`, `?sheet=`,
 * `?capture=`/`?palette=`) into the target shape TodayMoments' `deepLink`
 * prop consumes. Every demoted route (`/capture`, `/triage`, `/calendar`,
 * `/execute`, `/review`, `/health`, `/areas`) now server-redirects straight
 * into `/` carrying these params, so this is the single inbound parser for
 * all of them — there is no path-keyed map to keep in sync with the redirect
 * targets (C2-S6, #687): the redirect target IS the param, checked at file
 * tier for each `page.tsx`.
 */

import { isSheetValue, type SheetValue } from "./sheetValues";

export type DeepLinkTarget = {
  moment?: "start" | "flow" | "close";
  overlay?: "capture" | "palette";
  sheet?: SheetValue;
} | null;

/**
 * P7 (issue #687) wiring: the demoted stage routes now server-redirect into
 * the moments home carrying the target as query params (e.g. `/triage` ->
 * `/?sheet=triage`). This parses those params back into the same
 * DeepLinkTarget shape TodayMoments already consumes, so `/` is the single
 * live surface and the old paths are pure redirect shims (old bookmarks keep
 * working). Unknown/absent params yield null (a plain home visit).
 */
type RawParam = string | string[] | undefined;

function first(value: RawParam): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isTruthyFlag(value: RawParam): boolean {
  const v = first(value);
  return v === "1" || v === "true" || v === "";
}

/**
 * C2-S6 (#687): COMPOSES rather than picks first-match. `/?moment=flow&sheet=
 * plan` must open Flow WITH the plan sheet — a refresh, a direct URL, or a
 * bookmark that carries more than one target field all need to land on the
 * same screen the params describe, not silently drop everything after the
 * first field that matched. TodayMoments' own consumer (the `deepLink` effect)
 * already applies `moment`, `overlay` and `sheet` independently — this parser
 * was the only piece still throwing the rest away.
 */
export function deepLinkTargetFromParams(
  params: Record<string, RawParam> | undefined,
): DeepLinkTarget {
  if (!params) return null;

  const target: NonNullable<DeepLinkTarget> = {};

  const moment = first(params.moment);
  if (moment === "start" || moment === "flow" || moment === "close") {
    target.moment = moment;
  }

  // C2-S3: one list of sheet names, shared with `useSheetUrlState`. The inbound
  // parser and the outbound writer drifting apart is precisely how `?sheet=`
  // ends up opening on a rail tap but not on a refresh — the Target Card 2
  // failure #804 fixed for the two sheets that existed then.
  const sheet = first(params.sheet);
  if (isSheetValue(sheet)) {
    target.sheet = sheet;
  }

  if (isTruthyFlag(params.capture)) {
    target.overlay = "capture";
  } else if (isTruthyFlag(params.palette)) {
    target.overlay = "palette";
  }

  return Object.keys(target).length > 0 ? target : null;
}
