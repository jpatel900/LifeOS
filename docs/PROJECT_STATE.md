# PROJECT_STATE.md

Status: Authority handoff for current shipped truth and near-term next work
Purpose: Summarize current product state, recent completions, open issues, next tasks, and durable implementation notes
Read when: You need current shipped status or a concise fresh-run handoff
Do not use for: The active implementation queue or a historical phase diary
Superseded by: n/a

## Current status

- LifeOS MVP supports areas, capture, optional AI or mock parse capture, triage, local-first planning, explicit approval-gated Google Calendar event creation, execution tracking, review logging, and deterministic health checks.
- The current shipped workflow posture is stable: Home is read-only and action-forward, Capture is raw-input-first, Triage focuses one current decision, Planning keeps local proposals primary and Google actions secondary, Execute is mission-focused, Review is carry-forward-first, Health is the diagnostic home, and Areas reads as a quieter admin registry.
- Persistence remains truthful and mixed by design: local or mock fallback still exists, while authenticated Supabase-backed areas, captures, accepted tasks and projects, time-block proposals, calendar blocks, execution sessions, review entries, and health snapshots are available when configured.
- Safety boundaries remain unchanged: no silent external writes, no autonomous rescheduling, no Google Calendar update or delete path, no AI-triggered calendar writes, no parser contract weakening, and no raw-capture loss on parse failure.
- UI/UX Pass 7 is active. `docs/UI_UX_WORLD_CLASS_ROADMAP.md` is the sole active UI/UX roadmap, `docs/agent/UI_PASS_7_EXECUTION_MAP.md` is the shared control-plane supplement, and `docs/implementation-notes/*.md` remain historical proof.

## Recently completed

- Established the Pass 7 control-plane docs under `docs/agent/UI_PASS_7_EXECUTION_MAP.md`, `docs/agent/UI_PASS_7_LABEL_PLAN.md`, and `docs/agent/UI_PASS_7_FINAL_AUDIT_RUBRIC.md`, with matching implementation notes for the hardening gate.
- Completed the UI/UX doc inventory and roadmap consolidation so `docs/UI_UX_WORLD_CLASS_ROADMAP.md` now names Pass 7 as the active implementation pass and older UX plans are treated as historical inputs, not the live queue.
- Reopened the active roadmap explicitly as a clarity-and-diagnostic-staging program instead of a maintenance-only UX posture, while keeping prior passes recorded as shipped history.
- Added mobile first-viewport proof for Home and Capture, and simplified `/capture` so raw input plus `Save thought` land before support or diagnostic surfaces at `390px`.
- Defined the shared UI severity vocabulary so Pass 7 can distinguish calm degraded-but-usable states from blocked or failed states before expanding degraded-state tests and copy.
- Added severity regression proof for recoverable versus blocked states, and corrected Home so partial account-data degradation warns calmly instead of reading like a hard failure.
- Landed the prior UX trust and hierarchy passes that produced the current shipped route posture across Home, Capture, Triage, Planning, Execute, Review, Health, and Areas.
- Added durable browser-level regression proof for critical UX paths in `apps/web/tests/e2e/p0-ux-regression.spec.ts`.
- Hardened Google Calendar safety with connect and disconnect flows, manual free or busy checks, and explicit approval-gated event creation only.
- Hardened parser and observability boundaries: parse capture stays server-only with raw-save-first safety, and observability stays metadata-only with no raw capture, prompt, or calendar payload export.

## Known issues

- Production acceptance proof for issue `#93` is still incomplete because authenticated Vercel smoke has not yet been rerun from an allowed session.
- Pass 7 recovery work is not complete. Do not treat the UI/UX roadmap as closed until issue `#198` passes the final audit and issue `#199` records shipped truth.
- Google Calendar all-day conflict handling and app-created event update or cancel remain future work and are not yet proven.
- Some persisted multi-step workflow transitions still happen as separate client-driven operations rather than one transactional server boundary.

## Next recommended tasks

1. Finish Pass 7 sequentially from docs hygiene through audit using `docs/UI_UX_WORLD_CLASS_ROADMAP.md` and `docs/agent/UI_PASS_7_EXECUTION_MAP.md`; do not start route implementation before the docs, review, and test gates are complete.
2. Restore GitHub write auth or manually backfill the prepared Pass 7 issue comments and labels from `docs/agent/UI_PASS_7_GITHUB_UPDATES.md` and `docs/agent/UI_PASS_7_LABEL_PLAN.md`.
3. Re-run authenticated production smoke for issue `#93` without weakening Vercel deployment protection.
4. Keep `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts` in the validation path for UX-affecting changes.
5. Treat any future Google Calendar expansion as explicit follow-on scope only: all-day conflict handling first, then app-created event update or cancel after human approval.

## Important implementation notes

- Read `AGENTS.md`, `docs/agent/CONTEXT_INDEX.md`, and the smallest relevant context before broad repo search.
- `docs/UI_UX_WORLD_CLASS_ROADMAP.md` is the sole active UI/UX plan. `docs/agent/UI_PASS_7_EXECUTION_MAP.md` is a control-plane supplement, not shipped product truth. `docs/implementation-notes/*.md` are proof and history.
- UI work is not done on lint, docs, or code review alone. When route hierarchy, shell, or degraded states change, require behavior checks, focused tests, and mobile plus desktop proof before claiming completion.
- Primary workflow routes should foreground user action truth, keep safety truth near the relevant action, route diagnostic truth into details or Health unless the route is blocked, and keep developer truth out of primary workflow copy.
- Home must remain read-only and action-forward. It routes users to workflow screens but does not mutate workflow state directly.
- Capture must preserve raw-save-first behavior. Raw captures are persisted before parsing, and AI or mock fallback behavior must stay intact.
- Triage stays one-current-item-first. Tests or UI flows that need another draft must move it into focus deliberately.
- Planning stays local-first. Google Calendar remains secondary, explicitly approval-gated, and server-only.
- `/execute` should emphasize one active mission and must not fake persisted timing truth.
- `/health` is the diagnostic home. Primary workflow routes may stage deeper system detail behind disclosures, but Health owns the repair-first diagnostic surface.
- `AppShell` intentionally suppresses the extra shell-context band on `/capture`, `/calendar`, `/execute`, and `/review`.
- Frontend split: shared shadcn-compatible primitives live in `apps/web/src/components/ui`, while shell identity and route composition stay custom.
- `WorkflowProvider` must keep SSR and first client render structurally identical; persisted session state restores after mount.
- Browser code must not import parser helpers, Google token or OAuth helpers, or service-role helpers. Use route handlers and server-only modules.
- Observability stays metadata-only and vendor-safe. Do not export raw capture, prompt, completion, or calendar payloads.
- Use `pnpm --filter @lifeos/web test:e2e` rather than bare `playwright test` for safer Windows-local runs in this workspace.
- Local Supabase RLS verification remains opt-in via `RUN_SUPABASE_RLS_TESTS=1` plus local env values from `supabase status -o env`.
- There is no single production toggle. Missing env should degrade honestly to local or demo-safe behavior.
