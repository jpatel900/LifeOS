"use client";

import { isSupabaseConfigured } from "@/lib/supabase/config";

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
 */
export function DemoModeBanner() {
  if (isSupabaseConfigured()) {
    return null;
  }

  return (
    <div
      role="alert"
      data-testid="demo-mode-banner"
      className="sticky top-0 z-50 border-b-4 border-warning-border bg-warning px-4 py-2 text-center text-sm font-bold text-warning-foreground"
    >
      Demo mode — there is no account to save to here. Nothing you do leaves
      this browser, and clearing its data ends it.
    </div>
  );
}
