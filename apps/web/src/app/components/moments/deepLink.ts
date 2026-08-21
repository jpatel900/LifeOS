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
  } else if (isTruthyFlag(params.palette) && !target.sheet) {
    // Final UX Loop C2 round-7 judge ("one URL renders two different
    // screens depending on how you arrived at it"): sheet + palette is the
    // one composition that does NOT survive, unlike every other pair this
    // function composes. Reached directly (`/?palette=1&sheet=X`), the old
    // code adopted both, rendering the command palette stacked on top of
    // the sheet — two full-screen dialogs. Reaching the identical URL by
    // opening the palette and picking a sheet command renders only the
    // sheet, because the WRITE path already treats the palette as a
    // launcher that gets out of the way of whatever it opens:
    // `runPaletteAction`'s "open-<sheet>" cases call `openSheet(...)`, and
    // `CommandPalette` runs the action then calls `onClose` right after
    // (`useOverlayUrlState.closeOverlay`), so the palette never survives a
    // real hand-off to a sheet. `MomentSheet.tsx`'s header comment and
    // `closeTopOverlay` (`TodayMoments.tsx`) both name the same stacking
    // order for these three surfaces — "palette -> capture -> sheet" —
    // i.e. palette is the outermost/first-to-close layer and sheet is the
    // base a hand-off lands on, never the other way around. This read path
    // was the one place that order was never enforced: sheet wins here too,
    // matching what the palette always hands off to. (Capture is
    // deliberately EXEMPT — `?sheet=X&capture=1` keeps composing, see the
    // "capture takes precedence over palette" test below and the pinned
    // "genuinely renders both" case in `TodayMoments.urlTruth.test.tsx`.
    // Be precise about what that exemption buys, because this comment used
    // to overclaim it: both halves MOUNT, but they do not coexist usefully.
    // `CaptureOverlay` and `MomentSheet` are both `z-50` and the overlay
    // renders FIRST in `TodayMoments`' tree, so the sheet paints in front
    // of it. Probed against the dev server on `/?sheet=triage&capture=1`:
    // `elementFromPoint` at the capture dialog's centre returns
    // `moment-sheet-scrim`, both dialogs carry `aria-modal="true"`, focus
    // lands on `<body>`, and Escape closes neither. So this exemption keeps
    // a pair that renders one usable screen and one buried one — left
    // standing rather than widened into a behaviour change under what is a
    // comment-accuracy fix; `MomentSheet.tsx`'s header carries the same
    // measurement. Only palette-vs-sheet is scrubbed here.)
    target.overlay = "palette";
  }

  return Object.keys(target).length > 0 ? target : null;
}

/**
 * C2-S13 (#687 round-7 judge, "sheet renders with no sheet param" — a
 * Back/Forward walk crossing `/settings/areas`): the CLIENT-SIDE counterpart
 * to `deepLinkTargetFromParams` above, parsing the browser's own, live
 * `URLSearchParams` instead of Next's server-computed `searchParams` record.
 * `TodayMoments.tsx`'s one-shot deep-link mount effect uses THIS, not its
 * `deepLink` prop, for the same reason `useSheetUrlState`'s popstate handler
 * re-reads the URL rather than trusting a cached belief: `deepLink` is
 * computed SERVER-SIDE, once, from whatever `searchParams` Next's RSC
 * payload for the `/` route segment carried at render time. A Back/Forward
 * walk that crosses a genuinely different route (`/settings/areas`, reached
 * via a real `next/link` Link — the one navigation in this app that Next's
 * OWN router actually processes; every `moment`/`sheet`/`capture`/`palette`/
 * `area` write on `/` itself goes through this app's raw
 * `historyPushState`/`replaceState` shim instead, precisely so Next's router
 * never re-renders on every one of them — see `lib/rawHistory.ts`'s own
 * header) can have Next's client Router Cache serve a STALE cached render
 * for `/` on the way back: one computed from an EARLIER visit to this
 * pathname, before this app's own raw writes moved the address bar on in
 * ways Next's router never learned about. Caught red-first against the real
 * dev server: hard-load `/?sheet=review`, close the sheet (a raw
 * `history.back()`, popping to a sheet-less entry), navigate to
 * `/settings/areas` (a real Link), Back — landed on a URL with no `sheet=`
 * at all, Review sheet still rendered, because the fresh mount's deep-link
 * effect re-applied the ORIGINAL hard-load's stale `deepLink.sheet: "review"`
 * prop. `window.location.search` is never subject to that cache — it is the
 * actual, physical address bar — so parsing IT is "the URL is the only
 * source of navigation truth" applied to the one path in this file that used
 * to trust a prop instead.
 */
export function deepLinkTargetFromSearch(
  search: URLSearchParams,
): DeepLinkTarget {
  const record: Record<string, string | string[]> = {};
  for (const key of new Set(search.keys())) {
    const values = search.getAll(key);
    record[key] = values.length > 1 ? values : values[0];
  }
  return deepLinkTargetFromParams(record);
}

/**
 * C2-S13: MODULE-scope, not React state. `TodayMoments.tsx`'s deep-link
 * mount effect needs to tell "this is the very first mount `/` has had in
 * this browser tab" (trust the `deepLink` prop — it is exactly this
 * render's own truth) apart from "TodayMoments has mounted before in this
 * tab" (a Back/Forward walk crossing a real route change can land back here
 * with a STALE `deepLink`, served from Next's client Router Cache — see
 * `deepLinkTargetFromSearch`'s own doc comment above for the full mechanism
 * and red-first repro). Neither `window.location` nor `window.history.state`
 * reliably distinguishes the two: a sheet/overlay reached by direct URL
 * (adopted, never pushed) never gets `lib/rawHistory.ts`'s own
 * `__lifeOSEntryId` stamp, so a Back landing on it looks identical, by
 * either signal, to a fresh mount — caught red-first while building this
 * fix, not assumed. A plain module-level flag has no such ambiguity: it
 * survives the client-side route change and back for the exact same reason
 * `WorkflowProvider`'s own state does (mounted once at the root layout, the
 * MODULE is never re-evaluated by an in-app navigation — only TodayMoments'
 * own component instance unmounts/remounts), and is false-by-default
 * whenever the module is freshly evaluated (a hard load, or a test file's
 * first import).
 */
let hasMountedTodayMomentsOnceInThisTab = false;

/**
 * Test-only: this file's own module stays loaded for every `it()` in a test
 * file (Vitest does not reset the module registry between tests, only
 * between test FILES), so `hasMountedTodayMomentsOnceInThisTab` would
 * otherwise read `true` for every test after the first — TodayMoments.test.tsx
 * calls this in a file-level `afterEach`, the same way it resets
 * `window.location` for the same reason. A real browser tab never needs
 * this — the module is freshly evaluated exactly once per tab.
 */
export function resetTodayMomentsMountTrackingForTests(): void {
  hasMountedTodayMomentsOnceInThisTab = false;
}

/**
 * Reads, then marks, "has TodayMoments mounted before in this tab" — call
 * exactly once, from a `useState` lazy initializer, so it fires exactly once
 * per mount, in the same render pass as the mount's first commit (before any
 * effect, including sibling hooks' own mount effects, has run).
 */
export function consumeIsRemount(): boolean {
  const value = hasMountedTodayMomentsOnceInThisTab;
  hasMountedTodayMomentsOnceInThisTab = true;
  return value;
}

/**
 * C2-S12B (#687 round-6, finding 3): a hand-crafted case-variant like
 * `?MOMENT=flow` is invisible to `deepLinkTargetFromParams` above (it reads
 * the exact lowercase key), so the value renders nothing — but nobody ever
 * told the URL that. TodayMoments.tsx's own S8/S9 scrub effect
 * (`invalidParamsScrubbedRef`, dedupeParam, MOMENTS_URL_KEYS) already drops a
 * bad VALUE for a key the app reads; it does not yet drop a key the app never
 * reads at all. This is that companion pass, as a pure function so it is
 * unit-testable independent of TodayMoments' effect timing.
 *
 * Allowlist, not denylist: keep exactly the keys enumerated below, drop
 * everything else — INCLUDING a case-variant near-miss of a known key (e.g.
 * `MOMENT`, `Sheet`). A near-miss is not "close enough to fix up": silently
 * rewriting it to the canonical key would apply a value nobody's click
 * actually asked for, and leaving it alone (as the bug does today) has the
 * URL bar naming a key the app ignores right next to the one it honors. Drop
 * is the only option that keeps the bar telling the truth.
 */
export const KNOWN_APP_PARAM_KEYS = [
  "moment",
  "sheet",
  "capture",
  "palette",
  "area",
] as const;

/**
 * Non-app keys this app's own URLs legitimately carry from elsewhere. Each is
 * read case-sensitively by its own exact key, so (matching the reasoning
 * above) a case-variant of any of these is exactly as foreign as an unrelated
 * typo and is dropped the same way — nothing here gets normalized, only kept
 * or removed.
 *
 * - `next`: `/login`'s own return-target param (`app/login/page.tsx`'s
 *   `safeNextPath(searchParams.get("next"))`), and the same param
 *   `AreasSettingsPage` builds when it redirects a signed-out visitor to
 *   `/login?next=/settings/areas`.
 * - `code`, `state`, `error`, `error_description`: Google's OAuth redirect
 *   (`app/api/google-calendar/callback/route.ts`). That's a server route
 *   handler, not a page this scrub ever runs on directly, but the same
 *   allowlist is shared so a future client surface reached via that redirect
 *   chain doesn't have its own arrival URL stripped of them.
 * - `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`:
 *   the standard UTM attribution keys. This app never generates links that
 *   carry them, but a LifeOS link shared externally (email, social, a
 *   marketing redirect) might, and this app's own URL hygiene must not be
 *   the thing that erases someone else's attribution data.
 */
export const KEPT_FOREIGN_PARAM_KEYS = [
  "next",
  "code",
  "state",
  "error",
  "error_description",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const;

const ALLOWED_PARAM_KEYS = new Set<string>([
  ...KNOWN_APP_PARAM_KEYS,
  ...KEPT_FOREIGN_PARAM_KEYS,
]);

/**
 * Mutates `params` in place, deleting every key not on the allowlist above.
 * Returns whether anything changed — the same call-and-check shape
 * `dedupeParam` (TodayMoments.tsx) already uses, so wiring this in is a
 * one-line addition to that effect's existing `for (const key of
 * MOMENTS_URL_KEYS)` loop, e.g.:
 *
 *   if (dropUnknownParams(params)) changed = true;
 *
 * This lane's manifest does not include TodayMoments.tsx (owned by the
 * concurrent c2-s12a-keyboard-reach lane), so that one-line wiring is not
 * applied here — see this PR's AGENT-TODO.
 */
export function dropUnknownParams(params: URLSearchParams): boolean {
  let changed = false;
  for (const key of new Set(params.keys())) {
    if (ALLOWED_PARAM_KEYS.has(key)) continue;
    params.delete(key);
    changed = true;
  }
  return changed;
}
