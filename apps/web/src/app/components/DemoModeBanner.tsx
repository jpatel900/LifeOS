"use client";

import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * FR-029 loud non-persistence (F-G3b).
 *
 * When the app runs on the browser-only demo fallback (Supabase not
 * configured — the same condition that makes every data call return
 * `provider: "mock"`), every surface must refuse to look like the persisted
 * app (UX-INV-6): a user can otherwise capture for days into memory that
 * evaporates on reload. This banner is sticky, high-contrast, and permanent
 * for the whole demo session — it is the production safeguard for a deploy
 * with missing NEXT_PUBLIC_SUPABASE_* env (VERCEL_PRODUCTION_CHECKLIST §1
 * degrades truthfully instead of failing the build).
 *
 * Deliberately NOT driven by transient sync state: signed-out or
 * sync-degraded states on a configured deploy keep their existing designed
 * notices (SyncNotice). This banner fires only for the configuration-level
 * demo fallback, where nothing can ever persist.
 */
export function DemoModeBanner() {
  if (isSupabaseConfigured()) {
    return null;
  }

  return (
    <div
      role="alert"
      data-testid="demo-mode-banner"
      className="sticky top-0 z-50 border-b-4 border-black/30 bg-amber-400 px-4 py-2 text-center text-sm font-bold text-black"
    >
      Demo mode — nothing here is saved. Captures, plans, and reviews live
      only in this tab and vanish on reload.
    </div>
  );
}
