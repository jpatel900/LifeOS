# KNOWN_ISSUES.md

Status: Living registry of accepted-or-pending system issues
Read when: Starting a hardening pass, closing out a run (aging rule), or running the system review
Rule: Any run that updates `PROJECT_STATE.md` must also triage the **oldest undecided row** here: fix it, schedule it (link an issue), or mark it accepted with a reason. Issues do not age silently.

| # | Issue | Severity | First seen | Decision |
| - | ----- | -------- | ---------- | -------- |
| 1 | Google Calendar update/cancel of app-created events not built; missed-block recovery (FR-012) blocked on it | high | 2026-06-12 | accepted for now — explicit post-governance follow-on scope only; do not expand external-write surfaces until a dedicated reviewed issue/spec is opened |
| 2 | Google Calendar all-day event conflict handling unproven | medium | 2026-06-12 | accepted for now — keep bundled with the post-governance calendar follow-on instead of expanding the current docs/control-plane scope |
| 3 | Provider degradation not surfaced as Health incidents (INV-5 open) | medium | 2026-06-12 | pending |
| 4 | Route pages over the 800-line budget (grandfather list in `engineeringInvariants.test.ts`: execute 1667, calendar 1554, capture 1096, review 1029, areas 943, triage 922, home 877) | low | 2026-06-12 | accepted with paydown rule — shrink opportunistically when touching a page (INV-4); never raise ceilings |
| 5 | Meta-learning loop (suggestion_records / override_records → behavior) logged but unused | medium | 2026-06-12 | pending — the product differentiator; schedule after #1 |
| 6 | Issue #93 production acceptance smoke incomplete (authenticated Vercel session needed) | medium | 2026-06-11 | pending — needs human-run session |
| 7 | ~~`supabase/migrations/20260612231853_remote_schema.sql` (remote drift dump) broke local `supabase db reset` (storage trigger ordering)~~ | high | 2026-06-12 | **resolved 2026-06-13** — deleted (platform-only schema, no app tables); `supabase db reset` verified clean and RLS suite 17/17 |
| 8 | `lib/data/workflow.ts` (~1,650 lines) carries all data-provider logic in one module | low | 2026-06-12 | accepted with paydown rule — split by domain when next touched |
