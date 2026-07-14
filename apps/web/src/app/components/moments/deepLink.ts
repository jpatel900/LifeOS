/**
 * Moments pass P6 — packet: deep-link fallback shims.
 *
 * Pure mapping from a demoted stage-route path to the Today surface it
 * should deep-link into once the moments home flips at P7. This module does
 * not change any live route's rendering — it only defines the map + helpers
 * that TodayMoments' `deepLink` prop consumes.
 */

export type DeepLinkTarget = {
  moment?: "start" | "flow" | "close";
  overlay?: "capture" | "palette";
  sheet?: "triage" | "plan";
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
