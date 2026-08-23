// Versions that exist in production's supabase_migrations.schema_migrations
// ledger with NO matching file under supabase/migrations/, and are KNOWN,
// expected drift rather than a gap this repo needs to catch up on.
//
// This Supabase project (<prod-project-ref> — see the Supabase dashboard;
// deliberately not hardcoded here, see AGENTS.md rule 9) is SHARED: the
// RiseUp Cockpit project (a separate repo/app) applies its own migrations
// directly to the same database. Its versions will never have a file here,
// and that is fine — they are not this repo's migrations to track.
//
// Every entry needs a one-line reason, self-contained, so an auditor never
// has to trust "trust me" — they can check the reason against reality. This
// list EXPLAINS known drift; it does not suppress unknown drift. A prod-only
// version that is NOT listed here still fails the Migration Drift check
// loudly (scripts/agent/check-migration-drift.mjs) — that is the entire
// point of the reverse check.
//
// Growth rule: add an entry only for a version you have personally confirmed
// is foreign or already closed elsewhere (cite it in the reason). Never
// replace the enumerated riseup_* entries below with a prefix/pattern rule
// (e.g. "anything starting with riseup_") — a pattern rule would silently
// wave through a FUTURE LifeOS migration that happens to share the prefix,
// re-introducing the exact blind spot this file exists to prevent. See
// docs/FAILURES.md, "A migration went unseen for a month: the drift
// detector only looked one way" (2026-08-21).

export const MIGRATION_DRIFT_ALLOWLIST = [
  {
    version: "20260612231853",
    name: "remote_schema",
    reason:
      "Deleted from this repo on 2026-06-13 after it broke local `supabase db reset` " +
      "(it was a platform-managed remote-schema dump, not an authored migration — see " +
      "docs/FAILURES.md, 'Remote schema dump committed as a migration broke local resets'). " +
      "It had already been applied to production before the file was deleted, so the ledger " +
      "keeps the row; the repo correctly has no file for it going forward.",
  },
  {
    version: "20260718155438",
    name: "riseup_cockpit_schema",
    reason:
      "RiseUp Cockpit project migration (separate repo/app) applied directly by RiseUp's " +
      "own pipeline to this shared Supabase project. Not a LifeOS migration.",
  },
  {
    version: "20260719014434",
    name: "riseup_phone_department_stage_clock",
    reason:
      "RiseUp Cockpit project migration (separate repo/app) applied directly by RiseUp's " +
      "own pipeline to this shared Supabase project. Not a LifeOS migration.",
  },
  {
    version: "20260719014708",
    name: "riseup_people_archived_flag",
    reason:
      "RiseUp Cockpit project migration (separate repo/app) applied directly by RiseUp's " +
      "own pipeline to this shared Supabase project. Not a LifeOS migration.",
  },
  {
    version: "20260719074807",
    name: "riseup_mentor_cascade",
    reason:
      "RiseUp Cockpit project migration (separate repo/app) applied directly by RiseUp's " +
      "own pipeline to this shared Supabase project. Not a LifeOS migration.",
  },
  {
    version: "20260719075555",
    name: "riseup_intake_checklist",
    reason:
      "RiseUp Cockpit project migration (separate repo/app) applied directly by RiseUp's " +
      "own pipeline to this shared Supabase project. Not a LifeOS migration.",
  },
  {
    version: "20260719075752",
    name: "riseup_settings_coast_mode",
    reason:
      "RiseUp Cockpit project migration (separate repo/app) applied directly by RiseUp's " +
      "own pipeline to this shared Supabase project. Not a LifeOS migration.",
  },
  {
    version: "20260722162438",
    name: "riseup_advisors",
    reason:
      "RiseUp Cockpit project migration (separate repo/app) applied directly by RiseUp's " +
      "own pipeline to this shared Supabase project. Not a LifeOS migration.",
  },
  {
    version: "20260725074246",
    name: "riseup_journey_events",
    reason:
      "RiseUp Cockpit project migration (separate repo/app) applied directly by RiseUp's " +
      "own pipeline to this shared Supabase project. Not a LifeOS migration.",
  },
  {
    version: "20260818052408",
    name: "riseup_feedback_tracker",
    reason:
      "RiseUp Cockpit project migration (separate repo/app) applied directly by RiseUp's " +
      "own pipeline to this shared Supabase project. Not a LifeOS migration.",
  },
  {
    version: "20260820193317",
    name: "riseup_feedback_statuses_and_public_submit",
    reason:
      "RiseUp Cockpit project migration (separate repo/app) applied directly by RiseUp's " +
      "own pipeline to this shared Supabase project. Not a LifeOS migration.",
  },
  {
    version: "20260823035026",
    name: "riseup_feedback_anon_spam_guard",
    reason:
      "RiseUp Cockpit project migration (separate repo jpatel900/riseup-cockpit) applied " +
      "directly by RiseUp's own pipeline to this shared Supabase project on 2026-08-23. " +
      'Confirmed against that repo: it backs commit b5bb27b "Spam guards on public idea ' +
      'submissions" (2026-08-22 23:53 local = 03:53Z, minutes after this ledger row). ' +
      "Not a LifeOS migration.",
  },
  {
    version: "20260823035733",
    name: "riseup_feedback_pending_approval_gate",
    reason:
      "RiseUp Cockpit project migration (separate repo jpatel900/riseup-cockpit) applied " +
      "directly by RiseUp's own pipeline to this shared Supabase project on 2026-08-23. " +
      'Confirmed against that repo: it backs commit 551ac12 "Approval gate: public ' +
      'submissions land as Pending, approved to the board" (2026-08-23 00:02 local = ' +
      "04:02Z, minutes after this ledger row). Not a LifeOS migration.",
  },
];
