"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { cn } from "@/lib/utils";
import { HIT_TARGET_MIN } from "@/app/components/moments/hitTarget";

/**
 * FR-029 loud non-persistence (F-G3b), RECONCILED WITH REALITY by #737 C1 S5.
 *
 * When the app runs on the browser-only demo fallback (Supabase not
 * configured — the same condition that makes every data call return
 * `provider: "mock"`), every surface must refuse to look like the persisted
 * app (UX-INV-6). This banner is sticky, high-contrast, and permanent for the
 * whole demo session — it is the production safeguard for a deploy with
 * missing NEXT_PUBLIC_SUPABASE_* env (VERCEL_PRODUCTION_CHECKLIST §1 degrades
 * truthfully instead of failing the build).
 *
 * ## WHAT IT USED TO SAY, AND WHY EVERY CLAUSE OF IT WENT FALSE
 *
 *   "Demo mode — nothing here is saved. Captures, plans, and reviews live
 *    only in this tab and vanish on reload."
 *
 * Three claims, and #737-A falsified all three without anyone editing this
 * file, which is exactly how a safety banner rots:
 *
 *  1. "nothing here is saved" — wins, reviews, rollups, focus-session
 *     outcomes, placed blocks and accepted triage drafts are journalled to
 *     IndexedDB. Critically, `enqueuePendingWrite` runs BEFORE any
 *     `createSupabaseBrowserClient()` check, so demo mode journals exactly
 *     like a signed-out session does.
 *  2. "live only in this tab" — IndexedDB is origin-scoped, not tab-scoped.
 *     A second tab reads those writes back. (`durable-plans-drafts.spec.ts`
 *     asserts precisely that, in a real browser.)
 *  3. "vanish on reload" — `WorkflowContext` has mirrored the whole reducer
 *     state to `sessionStorage` since long before this program; PR #750
 *     probe-verified that a same-tab reload survives. This clause was already
 *     wrong when it shipped.
 *
 * An alarm that cries wolf is worse than no alarm: a user who reloads, finds
 * their work intact, and concludes the banner is decorative will not believe
 * it about the thing it IS right about.
 *
 * ## WHAT IT SAYS NOW, AND WHY THAT IS THE TRUE VERSION
 *
 * The real risk in demo mode is not that writes evaporate — it is that they
 * have NOWHERE TO GO. There is no account, so `replayDurableWrites` never
 * delivers anything: the work is durable on this one browser and will never
 * follow the user anywhere, and clearing site data ends it. That is a
 * genuinely serious state, and stating it plainly is louder than the
 * falsehood was, because it survives being checked.
 *
 * It also stays deliberately silent about which writes are device-durable and
 * which are still tab-only (a capture made here is staged in the reducer, not
 * journalled — see the AGENT-TODO on this slice's PR). "Nothing leaves this
 * browser" is true of every one of them, so the sentence needs no such split
 * and cannot be falsified by closing that gap later.
 *
 * Deliberately NOT driven by transient sync state: signed-out or
 * sync-degraded states on a configured deploy keep their existing designed
 * notices (`SyncNotice` via `resolveDeviceSaveNotice`), which say the
 * opposite thing — that the work IS on its way. This banner fires only for
 * the configuration-level demo fallback, where that promise can never be kept.
 *
 * #660 audit line X1: colors are the `--warning`/`--warning-foreground`/
 * `--warning-border` tokens (globals.css), not hardcoded Tailwind palette
 * classes.
 *
 * ## LAYOUT — Option C (#934 OWNER-GATE, decided 2026-08-30)
 *
 * Two PRIOR attempts to give this banner a reachable "Sign in" door were
 * reverted (see #934's PR body for the measured failures):
 *  1. Adding the door to `AuthAffordance.tsx`'s masthead cluster broke
 *     `moments-home-parity.spec.ts` at 1366x768 — the masthead is already at
 *     flex-wrap capacity.
 *  2. An inline "Sign in" text link inside this banner's own sentence wrapped
 *     to a third line at 390px, growing this banner's height on every one of
 *     the ~15 surfaces it renders on (root `AppShell`) and pushing
 *     `settings/areas`'s pre-existing content below the fold — masking a
 *     hit-target-overlap-pin count, not satisfying one.
 *
 * DIRECT MEASUREMENT (this slice) found the failure mode is not "wrapping"
 * specifically — it is ANY added banner height at all. `settings/areas` sits
 * at essentially zero pixel headroom against the viewport fold at both pinned
 * sizes: adding as little as 2-4px of extra flow height to this globally
 * rendered banner drops its hit-target-overlap-pin desktop count from 23 to
 * 11 and its mobile count from 10 to 7 (verified with `hit-target-overlap-pin
 * .spec.ts`, isolated Playwright context, not eyeballed). A literal
 * two-ROW layout (sentence, then a second row for the link) was tried first
 * and failed this exact way even using the invisible-hit-area technique.
 *
 * The layout that actually holds the pin is a FIXED-WIDTH TRAILING COLUMN,
 * not a second row: `pr-16` on the sentence reserves real, permanent
 * horizontal space on the right so the link never renders on top of the
 * warning text (the sentence's own available width shrinks by the same
 * amount at every viewport, so its wrap point is deterministic and never
 * depends on this link's own text length), and the link itself is
 * `absolute` inside that reserved column — contributing ZERO extra height to
 * the document flow, so `settings/areas` (and every other of the ~15
 * surfaces this banner renders on) measures identically to before this
 * change. `HIT_TARGET_MIN` (not `HIT_TARGET_INVISIBLE`) on purpose: the
 * negative margin `HIT_TARGET_INVISIBLE` uses to avoid pushing flow siblings
 * fights an `absolute right-*` offset (margin still applies to an
 * absolutely-positioned box's offset), which was measured to push the link's
 * own box outside the viewport and introduce real horizontal overflow
 * (`moments-home-parity.spec.ts`'s no-horizontal-overflow assertion, caught
 * by running it, not by reasoning about it). `HIT_TARGET_MIN`'s literal
 * 44x44 box has no such margin, so it stays fully inside the reserved column.
 * No `relative` on this div: `position: sticky` already establishes a
 * containing block for an absolutely-positioned descendant (same as
 * `relative`/`absolute`/`fixed` do), so a separate `relative` class was dead.
 *
 * #974 polish: "Sign in" measures 39.3px wide inside a 44px-min-width box,
 * against the `pr-16` (64px) reservation — real slack today, but slack a
 * future copy change could quietly eat into (nothing stopped the link from
 * wrapping onto a second line inside its own box before this). `whitespace-
 * nowrap` below turns "the copy got too long" into "the link visibly grows
 * past the reserved column" (caught by the width assertion in
 * `demoModeBanner.test.tsx` and `hit-target-overlap-pin.spec.ts`'s existing
 * overlap check) instead of a silent second line that could creep under the
 * sentence text unnoticed.
 *
 * #974 polish: `?next=<path>` matches the configured door's own contract
 * (`AuthAffordance.tsx`'s signed-out pill) — a person who signs in from
 * here returns to the page they were reading, not always to `/`.
 *
 * VERIFIER FINDING, not a defect of this component: in demo mode, the same
 * `isSupabaseConfigured()` check that shows this banner is also why
 * `createSupabaseBrowserClient()` returns a null client (`/login`'s own
 * `AuthAffordance.tsx`-adjacent logic) — so this door is honest about
 * REACHABILITY (a person can always find `/login` and read why accounts
 * aren't set up here), not about a working sign-in, which only exists once
 * the deploy's `NEXT_PUBLIC_SUPABASE_*` env is configured.
 *
 * ## #687 demo-seed round 2 — labelling the sample without growing the banner
 *
 * Round 1 tried adding a SECOND sentence when the seed is present ("...The
 * captures and tasks you see are sample data..."). Refuted: that grows this
 * banner's flow height exactly the way #974's two prior attempts above did,
 * for the same reason — `settings/areas` has ~0px headroom against the
 * hit-target-overlap-pin fold cutoff, so ANY added height (not just
 * wrapping) drops its count from 23/10 to 11/7.
 *
 * Fixed by SWAPPING the one sentence instead of appending to it —
 * `hasSeedData` selects between two single-line variants of equal or
 * shorter length than the original, so neither can wrap to an extra line at
 * any of the three measured widths (320/390/1366 — `demoModeBanner.test.tsx`
 * pins this with real DOM height, not just string length):
 *
 *   default:  "Demo mode — there is no account to save to here. Nothing you
 *              do leaves this browser, and clearing its data ends it."
 *   seeded:   "Demo mode — this is sample data. Nothing you do leaves this
 *              browser, and clearing its data ends it."
 *
 * The seeded variant is 8 characters SHORTER than the default (drops "there
 * is no account to save to here", adds "this is sample data") and keeps
 * every other clause verbatim — including "clearing its data ends it",
 * which #737-A already established is the one claim in this banner that
 * must never be dropped. `hasSeedData` defaults to `false` and this
 * component stays context-free (`demoModeBanner.test.tsx` renders it
 * standalone, outside any `WorkflowProvider`); `AppShell.tsx`'s
 * `DemoModeBannerConnected` supplies the real value from `useWorkflow()`.
 */
export function DemoModeBanner({
  hasSeedData = false,
}: {
  hasSeedData?: boolean;
} = {}) {
  const pathname = usePathname();

  if (isSupabaseConfigured()) {
    return null;
  }

  const nextParam = pathname && pathname !== "/login" ? pathname : "/";

  return (
    <div
      role="alert"
      data-testid="demo-mode-banner"
      className="sticky top-0 z-50 border-b-4 border-warning-border bg-warning py-2 pl-4 pr-16 text-center text-sm font-bold text-warning-foreground"
    >
      {hasSeedData ? (
        <>
          Demo mode — this is sample data. Nothing you do leaves this browser,
          and clearing its data ends it.
        </>
      ) : (
        <>
          Demo mode — there is no account to save to here. Nothing you do leaves
          this browser, and clearing its data ends it.
        </>
      )}
      <Link
        href={`/login?next=${encodeURIComponent(nextParam)}`}
        data-testid="demo-banner-signin-link"
        className={cn(
          HIT_TARGET_MIN,
          "absolute right-2 top-1 whitespace-nowrap text-xs font-semibold underline underline-offset-2 hover:no-underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-warning",
        )}
      >
        Sign in
      </Link>
    </div>
  );
}
