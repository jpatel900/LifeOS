/**
 * Moments pass P6 — packet: deep-link fallback shims.
 *
 * Pure mapping from a demoted stage-route path to the Today surface it
 * should deep-link into once the moments home flips at P7. This module does
 * not change any live route's rendering — it only defines the map + helpers
 * that TodayMoments' `deepLink` prop consumes.
 */

import { isSheetValue, type SheetValue } from "./sheetValues";

export type DeepLinkTarget = {
  moment?: "start" | "flow" | "close";
  overlay?: "capture" | "palette";
  sheet?: SheetValue;
} | null;

const DEEP_LINK_MAP: Record<string, DeepLinkTarget> = {
  "/capture": { overlay: "capture" },
  "/triage": { sheet: "triage" },
  "/calendar": { sheet: "plan" },
  "/execute": { moment: "flow" },
  "/review": { moment: "close" },
  "/health": null,
  "/areas": null,
};

export function deepLinkTargetForPath(path: string): DeepLinkTarget {
  if (Object.prototype.hasOwnProperty.call(DEEP_LINK_MAP, path)) {
    return DEEP_LINK_MAP[path];
  }
  return null;
}

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

export function deepLinkTargetFromParams(
  params: Record<string, RawParam> | undefined,
): DeepLinkTarget {
  if (!params) return null;

  const moment = first(params.moment);
  if (moment === "start" || moment === "flow" || moment === "close") {
    return { moment };
  }

  // C2-S3: one list of sheet names, shared with `useSheetUrlState`. The inbound
  // parser and the outbound writer drifting apart is precisely how `?sheet=`
  // ends up opening on a rail tap but not on a refresh — the Target Card 2
  // failure #804 fixed for the two sheets that existed then.
  const sheet = first(params.sheet);
  if (isSheetValue(sheet)) {
    return { sheet };
  }

  if (isTruthyFlag(params.capture)) {
    return { overlay: "capture" };
  }
  if (isTruthyFlag(params.palette)) {
    return { overlay: "palette" };
  }

  return null;
}
