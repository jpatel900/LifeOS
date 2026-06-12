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
- UI/UX Pass 7 is closed and back in maintenance posture. `docs/UI_UX_WORLD_CLASS_ROADMAP.md` remains the sole UI/UX roadmap, `docs/agent/UI_PASS_7_EXECUTION_MAP.md` remains historical control-plane proof, and `docs/implementation-notes/*.md` remain dated evidence.

## Recently completed

- Landed a robustness hardening batch (see `docs/implementation-notes/2026-06-12-robustness-hardening-batch.md`): atomic RPC-backed transitions for proposal acceptance and execution-session outcomes (migration pending live-database verification and human review), an AI provider boundary in `apps/web/src/lib/ai/provider/` (OpenAI remains the configured provider), user data export per new FR-016 (`GET /api/export` plus a `/settings/areas` admin disclosure, Google tokens excluded), and extraction of pure planning presentation helpers into `apps/web/src/lib/planning/presentation.ts`.
- Established the Pass 7 control-plane docs under `docs/agent/UI_PASS_7_EXECUTION_MAP.md`, `docs/agent/UI_PASS_7_LABEL_PLAN.md`, and `docs/agent/UI_PASS_7_FINAL_AUDIT_RUBRIC.md`, with matching implementation notes for the hardening gate.
- Completed the UI/UX doc inventory and roadmap consolidation so `docs/UI_UX_WORLD_CLASS_ROADMAP.md` now names Pass 7 as the active implementation pass and older UX plans are treated as historical inputs, not the live queue.
- Reopened the active roadmap explicitly as a clarity-and-diagnostic-staging program instead of a maintenance-only UX posture, while keeping prior passes recorded as shipped history.
- Added mobile first-viewport proof for Home and Capture, and simplified `/capture` so raw input plus `Save thought` land before support or diagnostic surfaces at `390px`.
- Defined the shared UI severity vocabulary so Pass 7 can distinguish calm degraded-but-usable states from blocked or failed states before expanding degraded-state tests and copy.
- Added severity regression proof for recoverable versus blocked states, and corrected Home so partial account-data degradation warns calmly instead of reading like a hard failure.
- Added the shared degraded-state copy contract so warning and blocked copy now has one explicit rule: say what happened, what still works, and the next move.
- Standardized the system-versus-developer detail boundary around `DiagnosticsDisclosure`, and moved Health technical identifiers under an explicit developer disclosure.
- Added diagnostics-before-action regression proof for Home and Capture, and quieted the shell context band on `/` so Home’s route-local launchpad stays ahead of shell support content.
- Documented the shared `390px` mobile surface budget and wired it into UI review plus issue-proof requirements so shell and route work now has an explicit clutter ceiling.
- Added shell-clutter regression coverage so quiet routes keep the extra shell context band off, Home and Capture keep quick-note controls off, and mobile shell nav still exposes one clear active state without overflow.
- Split `Areas` out of the primary shell workflow nav and into a supporting admin affordance, with focused tests plus mobile and desktop shell screenshots proving the new role.
- Calmed the mobile shell nav by forcing the primary workflow links into a single horizontal lane instead of a wrapped chip cloud, with Playwright proof that route access remains intact.
- Made shell controls secondary to route-local work on non-quiet routes by collapsing the shell quick-note composer behind an explicit `Quick note` toggle, with mobile and desktop triage screenshots proving the quieter resting state.
- Reduced repeated first-viewport area display by removing the extra shell area spotlight and keeping area context anchored in the persistent shell area selector instead.
- Completed the Capture hierarchy recovery batch so raw input, primary save actions, and optional area selection stay ahead of metrics and deeper details at rest, with refreshed mobile and desktop screenshot proof.
- Revalidated Capture raw-save safety after the hierarchy cleanup: `Save thought` still persists raw text first, parse failure still reports that the raw capture is safely stored, and local or mock fallback behavior remains intact.
- Simplified Home further into a read-only launchpad by removing the separate `Daily loop` support card, keeping the read-only guidance inside the flagship `Today / Next` surface, and calming degraded account-data copy.
- Tightened Triage so the current item now lands before queue summary or diagnostics, and moved the old summary out of the header into a quieter lower `Queue snapshot` support card.
- Tightened Planning so the local-first flow now lands before queue summary or diagnostics, and clarified the Google surface as an explicit `Google write approval` gate rather than generic calendar options.
- Completed the remaining workflow-route recovery batch: Execute now stages one mission above a quieter visible-state card and next-move lane, Review demotes the carry-forward board plus saved history behind one lower disclosure, Health keeps first-load trust answers ahead of celebratory run feedback, and Areas drops the extra header summary so the create-area registry action stays first.
- Completed the Pass 7 visual-system restraint batch: shared workflow cards, headers, panels, and shell surfaces now use flatter depth and calmer shadows, dark-mode readability is tighter, and mobile shell controls now clear a touch-friendly `40px` target floor without changing workflow contracts.
- Completed the Pass 7 accessibility, motion, performance, and evidence batch: non-destructive workflow feedback now announces through polite live regions, reduced-motion and warmed-route stability have explicit browser proof, and the screenshot workflow now defines the final packet format plus the current Pass 7 packet index.
- Passed the Pass 7 final audit on `2026-06-11`: the final screenshot packet now exists under `apps/web/test-results/pass-7/final-audit/`, every audited route cleared the rubric thresholds in `docs/agent/UI_PASS_7_FINAL_AUDIT_RUBRIC.md`, and the closeout audit is recorded in `docs/implementation-notes/2026-06-11-pass-7-final-audit.md`.
- Closed Pass 7 truthfully: the roadmap now returns to maintenance posture instead of claiming a new active recovery pass, and the remaining work is outside Pass 7 scope.
- Landed the prior UX trust and hierarchy passes that produced the current shipped route posture across Home, Capture, Triage, Planning, Execute, Review, Health, and Areas.
- Added durable browser-level regression proof for critical UX paths in `apps/web/tests/e2e/p0-ux-regression.spec.ts`.
- Hardened Google Calendar safety with connect and disconnect flows, manual free or busy checks, and explicit approval-gated event creation only.
- Hardened parser and observability boundaries: parse capture stays server-only with raw-save-first safety, and observability stays metadata-only with no raw capture, prompt, or calendar payload export.

## Known issues

- `tests/e2e/areas-color-edit.spec.ts` has 2 failing tests that reproduce on a clean `main` checkout (area-card color preset buttons time out); pre-existing and needs separate triage.
- The `20260612120000_add_workflow_transition_functions.sql` migration has not yet been run against a live database (Docker was unavailable); run `supabase db reset` plus the opt-in RLS suite and exercise accept-proposal and mark-session flows before merging or deploying.
- Production acceptance proof for issue `#93` is still incomplete because authenticated Vercel smoke has not yet been rerun from an allowed session.
- Google Calendar all-day conflict handling and app-created event update or cancel remain future work and are not yet proven.
- Some persisted multi-step workflow transitions still happen as separate client-driven operations rather than one transactional server boundary.

## Next recommended tasks

1. Restore GitHub CLI auth or finish the remaining Pass 7 metadata backfill manually; issue comments are largely applied, but label and milestone work is still incomplete.
2. Re-run authenticated production smoke for issue `#93` without weakening Vercel deployment protection.
3. Keep `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts`, `tests/e2e/workflow-hierarchy.spec.ts`, `tests/e2e/workflow-card-accent.spec.ts`, `tests/e2e/accessibility-baseline.spec.ts`, `tests/e2e/motion-performance.spec.ts`, and `tests/e2e/final-audit-packet.spec.ts` in the validation path for UX-affecting changes.
4. Treat any future Google Calendar expansion as explicit follow-on scope only: all-day conflict handling first, then app-created event update or cancel after human approval.
5. Treat future cross-route UI changes as maintenance unless a new reviewed roadmap pass is explicitly opened.

## Important implementation notes

- Read `AGENTS.md`, `docs/agent/CONTEXT_INDEX.md`, and the smallest relevant context before broad repo search.
- `docs/UI_UX_WORLD_CLASS_ROADMAP.md` is the sole active UI/UX plan. `docs/agent/UI_PASS_7_EXECUTION_MAP.md` is a control-plane supplement, not shipped product truth. `docs/implementation-notes/*.md` are proof and history.
- UI work is not done on lint, docs, or code review alone. When route hierarchy, shell, or degraded states change, require behavior checks, focused tests, and mobile plus desktop proof before claiming completion.
- Primary workflow routes should foreground user action truth, keep safety truth near the relevant action, route diagnostic truth into details or Health unless the route is blocked, and keep developer truth out of primary workflow copy.
- Use `docs/agent/UI_SEVERITY_VOCABULARY.md` when deciding whether a route state is `info`, `warning`, or `danger`; recoverable degraded states should not read like hard failures.
- Use `docs/agent/UI_DEGRADED_STATE_COPY.md` when degraded or blocked copy changes. Default to: what happened, what still works, and what the user should do next.
- Use `docs/agent/UI_DETAILS_BOUNDARY.md` when exposing route detail. `System details` may support recovery on workflow routes; `Developer details` belong in explicit lower-level disclosures or Health.
- Home account-data degradation is intentionally `warning`, not `danger`, because local workflow remains usable. Reserve destructive severity for blocked trust or real failures.
- `AppShell` intentionally suppresses the extra shell-context band on `/`, `/capture`, `/calendar`, `/execute`, and `/review`; Home should not have shell-level support content above its own flagship next-action surface.
- On non-quiet routes, keep shell quick-note capture closed by default so route-local work wins the first viewport unless the user explicitly opens shell capture.
- Keep area visibility anchored in the persistent shell area control. Do not reintroduce a second shell-level area spotlight above the route just because route cards also show area context.
- `Areas` should not read as part of the primary workflow loop in shell navigation. Keep it reachable, but visibly secondary and admin-oriented.
- On mobile, the primary workflow nav should stay a single horizontal lane. Preserve route access with scroll before letting the nav wrap into stacked chip rows.
- Use `docs/agent/UI_MOBILE_SURFACE_BUDGET.md` when reviewing shell or first-viewport changes. If a route needs multiple support surfaces above the fold at `390px`, the structure is probably wrong.
- Keep `apps/web/tests/e2e/shell-clutter.spec.ts` in the validation path for AppShell, nav, or route-shell hierarchy changes.
- Home must remain read-only and action-forward. It routes users to workflow screens but does not mutate workflow state directly.
- Capture must preserve raw-save-first behavior. Raw captures are persisted before parsing, and AI or mock fallback behavior must stay intact.
- Capture hierarchy now assumes this order at rest: main raw-input card first, support summary second, `Capture details` after that, and device-only draft history behind disclosure. Keep future styling or copy work inside that contract.
- Home now assumes one flagship launchpad surface at rest. Do not reintroduce a separate empty-state support card just to restate the daily loop; keep read-only guidance quieter and inside the flagship surface unless the route becomes blocked.
- Triage now assumes this order at rest: current item first, waiting queue second when needed, queue snapshot after that, then `Triage details`. Do not reintroduce a separate preamble card above the current decision.
- Planning now assumes this order at rest: `Planning flow` first, support cards and summary after it, then `Planning details`. Keep Google write messaging framed as explicit approval, not ambient capability.
- Triage stays one-current-item-first. Tests or UI flows that need another draft must move it into focus deliberately.
- Planning stays local-first. Google Calendar remains secondary, explicitly approval-gated, and server-only.
- `/execute` now assumes this order at rest: current mission first, quieter visible-state support second, next-move support third, and deeper mission truth or record only behind disclosures. Do not reintroduce a top-of-route diagnostic disclosure above the mission card.
- `/review` now assumes closure-first at rest: flagship decision card first, carry-forward actions second, save details quieter, and the carry-forward board plus saved history behind the lower `Review details and history` disclosure.
- `/health` is the diagnostic home. Primary workflow routes may stage deeper system detail behind disclosures, but Health owns the repair-first diagnostic surface.
- `/health` should keep first-load trust answers ahead of celebratory feedback. Manual reruns may announce success or failure loudly; initial load should stay calm.
- `/settings/areas` now assumes create-area work first, registry details after it, and no header-level summary card above the flagship admin action. Keep area registry actions quieter than the creation surface.
- Shared workflow surfaces now assume calmer depth by default: keep flagship cards distinct, but do not reintroduce stacked inset borders, heavy shadows, or loud gradients on support and admin surfaces unless the route truly needs them.
- Mobile shell controls should keep a touch-friendly floor of roughly `40px`; do not shrink nav pills, area selection, or the quick-note entry path below that just to fit more chrome.
- Non-destructive workflow feedback should use polite status semantics. Reserve interruptive `alert` behavior for destructive or blocked states.
- Reduced-motion proof now lives in `apps/web/tests/e2e/motion-performance.spec.ts`; if a new motion treatment matters, prove it there instead of assuming the media query still covers it.
- The screenshot packet format now lives in `docs/agent/UI_SCREENSHOT_EVIDENCE_WORKFLOW.md`. Use that packet order for the final audit instead of inventing a new evidence layout in chat or PR text.
- Frontend split: shared shadcn-compatible primitives live in `apps/web/src/components/ui`, while shell identity and route composition stay custom.
- `WorkflowProvider` must keep SSR and first client render structurally identical; persisted session state restores after mount.
- Browser code must not import parser helpers, Google token or OAuth helpers, or service-role helpers. Use route handlers and server-only modules.
- Observability stays metadata-only and vendor-safe. Do not export raw capture, prompt, completion, or calendar payloads.
- Use `pnpm --filter @lifeos/web test:e2e` rather than bare `playwright test` for safer Windows-local runs in this workspace.
- Local Supabase RLS verification remains opt-in via `RUN_SUPABASE_RLS_TESTS=1` plus local env values from `supabase status -o env`.
- There is no single production toggle. Missing env should degrade honestly to local or demo-safe behavior.
