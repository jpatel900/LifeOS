"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { resolveDeviceSaveNotice } from "@/lib/deviceSaveNotice";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { WorkflowSyncStatus } from "@/lib/workflowContext/types";

/**
 * WHERE YOUR WORK IS, ON THE ONE SCREEN THAT NEVER SAID (#736, rebuilt in
 * #737 C1 S5 on the truth slices S2-S5 established).
 *
 * ## The gap
 *
 * `SyncNotice` has always rendered this state — on `LifeOSCockpit`, i.e. the
 * LEGACY routes. The moments home, which is the shipping shell and where a
 * person actually spends the day, rendered nothing at all. A signed-out user
 * captured, planned and closed their day with no indication anywhere that none
 * of it had reached an account.
 *
 * ## Why this is a stacked row and not another masthead pill
 *
 * #736 put the indicator INLINE, inside the header's control cluster
 * (MomentSwitcher / AreaSelector / clock / theme / auth / settings). That
 * cluster is a `flex-wrap` row with a fixed width budget that three separate
 * audits have already fought over — AreaSelector, CountdownClockToggle and
 * MomentSwitcher each gave up padding to fit. Adding a variable-length
 * SENTENCE to it overflowed at 390px, and that e2e failure is the recorded
 * reason the indicator was pulled.
 *
 * A full-width row below the header has no such budget: the sentence gets the
 * whole line at every viewport, it wraps instead of pushing controls out, and
 * it cannot regress the hit-target and overlap pins (#765) because it shares a
 * row with nothing.
 *
 * ## Silence is the resting state, and that is deliberate
 *
 * `resolveDeviceSaveNotice` returns `null` when everything has reached the
 * account (or LifeOS is still looking), and this renders nothing for it. A
 * permanent "all synced" badge would be furniture the eye learns to skip, and
 * it would make the one state that matters HARDER to notice, not easier. It
 * also makes the clearing behaviour observable: when the drain empties,
 * `refreshPendingLocalChanges` flips `pendingLocalChanges` and this row
 * disappears — which is the visible half of the fix #736 flagged and could not
 * make (nothing ever set that flag back to false).
 *
 * ## No new words
 *
 * Every sentence comes from `statusVocabulary` via `resolveDeviceSaveNotice` —
 * the same function, the same conditions and the same priority order that
 * `SyncNotice` uses. Two surfaces reporting one state must not drift, and
 * hand-typing a second copy of these conditions is exactly how the tone bug
 * that #734 fixed got in.
 *
 * Tone is not decoration either: `calm` fires during ordinary use (signed out,
 * offline, an account briefly unreachable) and must never wear failure
 * styling, because the work is safe — it is simply here rather than there.
 * `alarm` is reserved for a save that was attempted and failed, and for a
 * browser refusing to hold anything at all, where a reload really does lose
 * work.
 */
export function MastheadSaveState({ status }: { status: WorkflowSyncStatus }) {
  // DEMO MODE IS NOT THIS COMPONENT'S STATE TO REPORT, and the first draft of
  // this row got that wrong in a way an e2e caught.
  //
  // With no Supabase configured, `syncPersistedWorkflowRows` marks the account
  // local-only, so `resolveDeviceSaveNotice` produced
  // ACCOUNT_UNREACHABLE_NOW — "LifeOS can't reach your account RIGHT NOW". In
  // demo mode there is no account to reach and no "right now" about it: the
  // sentence invents a transient outage and an account the user does not have.
  // That is the same class of falsehood this slice exists to remove, arriving
  // in the fix for it.
  //
  // `DemoModeBanner` already states that configuration's whole truth, above
  // this row, permanently and loudly. Rendering both would also break
  // `statusVocabulary`'s standing rule that one state gets one sentence — a
  // reader seeing two would have to work out whether they mean different
  // things.
  //
  // The layout consequence is real but secondary: an extra row here shifted
  // the moments home enough to break `moments-home-parity.spec.ts`'s capture-
  // pill clearance assertions at 1366x768, since the e2e dev server runs with
  // no Supabase env at all.
  if (!isSupabaseConfigured()) return null;

  const notice = resolveDeviceSaveNotice(status);
  if (!notice) return null;

  const alarm = notice.tone === "alarm";

  return (
    <div
      // `status`, not `alert`: this is an ambient state a person can read when
      // they look, not an interruption. The alarm tone raises it to `alert`
      // because a device refusing to store anything, or a failed save, is a
      // thing a screen-reader user should be told without going looking.
      role={alarm ? "alert" : "status"}
      data-testid="masthead-save-state"
      data-tone={notice.tone}
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[var(--surface-radius-sm)] border px-3 py-2 text-xs",
        alarm
          ? "border-warning-border bg-warning/15 text-foreground"
          : "border-border bg-muted/40 text-muted-foreground",
      )}
    >
      <span data-testid="masthead-save-state-message">{notice.message}</span>
      {notice.signedOut ? (
        // #688's door, offered where the reason IS "nobody is signed in" —
        // never on the other calm states, where signing in would fix nothing.
        <Link
          href="/login"
          className="font-semibold text-foreground underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          data-testid="masthead-save-state-signin"
        >
          Sign in
        </Link>
      ) : null}
    </div>
  );
}
