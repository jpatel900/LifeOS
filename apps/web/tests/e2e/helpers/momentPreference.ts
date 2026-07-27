import type { Page } from "@playwright/test";

/**
 * Pin the Today surface's moment so a spec never depends on the wall clock.
 *
 * WHY THIS EXISTS
 * ---------------
 * `TodayMoments.tsx`'s `heuristicMoment(now, hasCurrentBlock)` picks the
 * moment from the BROWSER's local hour when nothing else has:
 *
 *     hour < 11            -> "start"
 *     hour >= 17           -> "close"
 *     otherwise            -> hasCurrentBlock ? "flow" : "start"
 *
 * That is correct product behaviour and stays exactly as it is. It is also a
 * hidden input to every spec that visits `/` without a `?moment=` deep link:
 * the same test renders three different surfaces depending on when — and in
 * which timezone — it runs. GitHub's runners are UTC, so a suite authored and
 * validated in the Americas (local hour < 11) silently swaps surface the
 * moment CI happens to run after 17:00Z. That is exactly how
 * `session-truth.spec.ts` and four of `a11y-axe-pin.spec.ts`'s surfaces went
 * red on merged main while both were green on their own branches and green
 * locally (PR #770's run, 2026-07-26T17:24-17:36Z).
 *
 * The lane contract's validation floor already names the remedy — "pin
 * calendar/clock-dependent moments in specs". This is that pin, in the one
 * place the app itself reads first: the stored moment preference, which
 * `TodayMoments`' `useState` initialiser consults BEFORE the heuristic
 * (`initialMoment` -> stored preference -> heuristic).
 *
 * WHY A GUARDED SEED, NOT AN UNCONDITIONAL ONE
 * -------------------------------------------
 * `addInitScript` re-runs on every navigation, including `page.reload()` and
 * every fresh page in the context. Writing unconditionally would clobber the
 * preference the app itself persists when the user switches moment, and specs
 * legitimately assert that memory (`session-truth.spec.ts`'s "a running
 * session survives a reload" expects the reload to land back on Flow). So the
 * seed only ever fills an EMPTY slot — it sets the starting moment and then
 * gets out of the way.
 */

/** `TodayMoments.tsx`'s `PREFERENCES_KEY`. */
export const MOMENT_PREFERENCES_KEY = "lifeos.moments.preferences";

export type PinnedMoment = "start" | "flow" | "close";

export async function pinMomentPreference(
  page: Page,
  moment: PinnedMoment,
): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      try {
        if (!window.localStorage.getItem(key)) {
          window.localStorage.setItem(key, value);
        }
      } catch {
        // Blocked storage — the spec then runs on the heuristic, exactly as
        // it did before this helper existed. Nothing to recover here.
      }
    },
    [MOMENT_PREFERENCES_KEY, JSON.stringify({ moment })] as const,
  );
}
