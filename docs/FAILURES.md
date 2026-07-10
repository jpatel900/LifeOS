# FAILURES.md — the failure chronicle

Status: Living chronicle of closed battles — investigations, dead ends, and reverted approaches, so no session re-fights them.
Read when: BEFORE investigating any recurring symptom, and before proposing an approach that feels obvious (check it wasn't already tried).
Rule: every revert, abandoned branch, and multi-hour dead-end investigation adds an entry. Retirement with a documented "why" is a success outcome; silent abandonment is the failure.
Distinction: live, tolerated flaws belong in `docs/KNOWN_ISSUES.md`. This file records _settled_ matters: what was tried, why it lost, and what replaced it. Method reference: the `agentic-failure-archaeology` skill in `.agents/skills/`.

Apparatus-sunset convention (vision harvest, 2026-07-05): when an entry's Status is a standing _fence_ — a workaround, protocol, or ceremony that compensates for a tool/environment/model limitation (e.g. patch-paste delivery, mention-kick tokens, degraded-tier runbooks) — add a **Retirement condition** line stating the observable event that should trigger a deliberate retest, and delete the fence if the retest passes. Process volume is not trust; gates and guard tests are. The quarterly distillation (#289) sweeps these: a fence whose failure has not recurred in ~90 days gets retested, not kept by default.

Entry schema: **Symptom → Root cause → Evidence → Status → Date** (+ **Retirement condition** when the Status is a standing fence).

---

## Env-blind validation: implementer's green ≠ CI's green (B7, PR #291)

- **Symptom:** B7 PR (capture wired through parse route) opened with a truthful "all tests pass" report, then failed two required CI lanes — including the guard test for its OWN issue's binding constraint (raw capture stays visible when parsing fails).
- **Root cause:** The Codex cloud environment deliberately has no Supabase stack, no provider env, and no browsers (no-secrets policy). Tests that exercise env-dependent paths pass vacuously there via mock fallbacks; the Migrations+RLS lane and Playwright E2E are unrunnable. The implementer's evidence was truthful but incomplete, and nothing required disclosing which lanes were unverifiable.
- **Evidence:** PR #291 body reports `WorkflowContext.test.tsx` passing locally; the same file failed in the Migrations + RLS Verification lane. Playwright plan-flow spec timed out. Secondary noise: B2's meta-learning writes logged `query.insert is not a function` against the shared test mock, which was never extended with the new tables.
- **Status:** Mitigated — kick template requires an "unverified lanes" disclosure and running the guard tests named in the issue; `lifeos-testing` skill documents the env-dependent lanes and the shared-mock rule; remaining pipeline issues name their guard tests. Required CI checks remain the real gate (they caught this). Do not give the agent environment secrets to "fix" this — the no-secrets boundary is deliberate.
- **Date:** 2026-07-03

## Codex ignored the pipeline's @codex kicks

- **Symptom:** Pipeline-advance workflow posted `@codex` mentions on the next issue; Codex cloud never picked them up. Pipeline stalled silently after each merge.
- **Root cause:** Codex ignores mentions authored by bot accounts; the workflow's default `GITHUB_TOKEN` posts as a bot.
- **Evidence:** Issue timelines show bot-authored mentions with no Codex response; mentions posted manually by the owner worked.
- **Status:** Fixed — `.github/workflows/pipeline-advance.yml` posts via the `CODEX_KICK_TOKEN` fine-grained PAT (Issues+PRs RW) so kicks are human-authored. Do not "simplify" back to `GITHUB_TOKEN`; the pipeline dies quietly.
- **Date:** 2026-07 (epic #243 bring-up)

## Required-review branch protection was unsatisfiable

- **Symptom:** Green pipeline PRs could not be merged at all.
- **Root cause:** Solo repo: GitHub required-review rules cannot be satisfied when every PR is self-authored (authors cannot approve their own PRs).
- **Evidence:** Merge blocked on "review required" with no eligible reviewer existing.
- **Status:** Fixed — required-reviews removed; strict up-to-date requirement kept. Do not re-enable required reviews without a second reviewer identity. Merge authority policy lives in the agent docs, not in an unsatisfiable rule.
- **Date:** 2026-06/07

## Remote schema dump committed as a migration broke local resets

- **Symptom:** `supabase db reset` failed locally (storage trigger ordering) after adding `supabase/migrations/20260612231853_remote_schema.sql`.
- **Root cause:** The file was a remote drift _dump_ (platform-managed objects, no app tables), not an authored migration; platform-only objects don't replay locally.
- **Evidence:** KNOWN_ISSUES row 7 (resolved); reset verified clean after deletion, RLS suite 17/17.
- **Status:** Fixed 2026-06-13 — dump deleted. Rule: never commit remote drift dumps as migrations; author migrations, then verify `supabase db reset` locally.
- **Date:** 2026-06-12 → 2026-06-13

## Per-PR auto-review produced noise, not safety (check diet)

- **Symptom:** Every PR — including docs-only — accumulated automatic review comments; signal drowned, merges slowed, nobody read the reviews.
- **Root cause:** Reviews attached by default rather than by risk class; a gate that fires on everything is a ritual, not a gate.
- **Evidence:** PR #248 (check diet): auto Claude review removed; Codex baseline review now skips docs-only PRs.
- **Status:** Fixed — review effort is risk-routed (`scripts/agent/classify-pr-risk.mjs`, `check-safe-automerge.mjs`). Don't re-add blanket auto-reviews; extend the risk classifier instead.
- **Date:** 2026-06/07

## Codex Actions lanes retired in favor of the mention lane

- **Symptom:** Two ways to invoke Codex existed (Actions `codex-*` workflows and the @codex mention lane); the Actions lanes sat unused and looked like dead config.
- **Root cause:** Economic, not technical: Actions lanes bill the OpenAI API key per run; the mention lane bills the flat subscription.
- **Evidence:** Pipeline design (epic #243) routes exclusively through human-authored mention kicks.
- **Status:** Settled decision, not debt. Do not "clean up" by re-enabling Actions lanes without redoing the cost math.
- **Date:** 2026-07

## Doc sprawl → the doc-registry guard

- **Symptom:** Agent sessions accumulated per-session note files and duplicate docs; entry files bloated; truth forked across files.
- **Root cause:** No mechanical gate on new markdown; every session's "helpful notes" compounded.
- **Evidence:** Issue #228 / PR #244 — `apps/web/src/__tests__/docRegistry.test.ts` (allowlist + shrink-only grandfather registry + entry-file line budget).
- **Status:** Fixed structurally. New canonical docs require a deliberate allowlist edit with review — this file itself entered that way. Budget ratchets down (A4 → 250 lines); never raise it.
- **Date:** 2026-06/07

## Parallel agent fan-out burned the entire usage window (ops, maintainer-side)

- **Symptom:** Two 19-agent authoring workflows died mid-flight with "session limit" errors; ~1.4M tokens spent for partial output; all work blocked until window reset.
- **Root cause:** Concurrent subagent fan-out multiplies cold-start context cost; a rolling usage window can be exhausted in minutes while sequential inline work would have fit.
- **Evidence:** 2026-07-02 skills-library authoring session (recorded in maintainer memory and the library's own `agentic-context-engineering-reference` §2).
- **Status:** Fenced — default to sequential/inline work for bulk tasks; reserve fan-out for adversarial review and schedule it right after window resets.
- **Date:** 2026-07-02

## Merge race turned main red: a guard and its offenders merged 77 seconds apart

- **Symptom:** Main CI failed on merge commit 8d6724d. PR #331's workflow-truth guard bans `WorkflowState` annotations in tests; two B6-era test files still carried them. Each PR was green in isolation; combined, main was red. Main Red Guard skipped instead of firing, and Codex CI Autofix ran and failed without producing a fix.
- **Root cause:** A guard PR's CI proves the guard against the merge ref at _review_ time, not against what main looks like when it lands; #337 merged 77 seconds earlier. The refactor of the two offender files that would have made #331 safe was reported complete by Codex but never actually pushed (see the stranded-delivery entry below).
- **Evidence:** CI run 28707997136 (failure on 8d6724d); fix PR #340 (offenders rebuilt on `workflowSeed()` + transition helpers, no allowlist additions).
- **Status:** Fixed by #340. Open follow-ups: why Main Red Guard's trigger condition skipped on a genuinely red main, and the standing rule that a guard PR must land only after (or together with) the refactor of every known offender, re-verified against current main immediately before merge.
- **Date:** 2026-07-04

## Codex mention-lane deliveries stranded: make_pr claimed success, nothing reached GitHub

- **Symptom:** Six deliveries in one day (#240 twice, #313, #323, plus the #333 fix round and the #331 offender refactor) ended with Codex reporting green checks and "created the PR via make_pr" — but no branch existed on origin, no PR existed, and the task page offered no Create PR action. Sequential pipelines stall silently; work evaporates.
- **Root cause:** The platform-side PR-creation step of the Codex mention lane failed silently while the sandbox work succeeded. Fresh re-kicked environments can neither recover a previous task's commits nor push (no origin remote, agent-phase network off), so naive re-kicks re-implement and re-strand.
- **Evidence:** Issue threads on #240/#313/#323 (completion summaries with no corresponding branches); recovery PRs #347/#348/#349.
- **Status:** Fenced by the patch-paste protocol, proven three-for-three on 2026-07-04: the kick instructs Codex to post `git format-patch origin/main --stdout` as issue comments; a maintainer applies the patch in a worktree (`git am`, author preserved), runs the lanes the sandbox cannot (local Supabase/RLS), and opens the PR. Both candidate follow-ups were built in PR #357 (kick-template fallback + watchdog claimed-PR-exists check). Partially superseded 2026-07-05: the "ask the still-live task by mention" recovery no longer works — see the next entry.
- **Date:** 2026-07-04

## Stranded-delivery recovery by mention is dead: a follow-up @codex mention spawns a fresh environment

- **Symptom:** Both 2026-07-05 Codex tasks (C1 #364, commit f9ce109; #377, commit a8d51e0) completed with `make_pr` reporting success but no branch or PR on GitHub — and the previously proven recovery (mention the task, ask for a format-patch) failed: the recovery mention spawned a FRESH environment (branch `work`, no origin remote, no `gh`, none of the task's commits) that could not produce the patch.
- **Root cause:** A follow-up @codex mention is a new task, not a message to the old one; task state lives only inside the original session. Two compounding platform gaps: the sandbox cannot reach github.com (HTTP 403), so the kick's "verify your PR exists" step cannot actually be executed — tasks truthfully report completion while structurally unable to detect their own stranding; and the Codex task UI currently shows no diff view or Create PR button (owner-observed 2026-07-05), removing the platform's own manual recovery affordances.
- **Evidence:** #364 comment thread (fresh-env reply 2026-07-05T07:14Z: current branch `work`, commit f9ce109 unavailable, no `origin/main` configured); #377 delivery-verification comment; owner UI observation 2026-07-05.
- **Status:** Superseded by delivery protocol v2 (2026-07-05, proven 4/4: PRs #402/#404/#405/#406). The comment-based fallback was ALSO unexecutable: the env has NO issue-comment tool, no origin remote (so `git format-patch origin/main` fails — determine the base locally as the newest commit not authored by the task), and 403s to github.com. The ONLY working channel is the final summary the connector relays. Protocol v2: skip make_pr; embed the complete `git format-patch <local-base>..HEAD --stdout` output as fenced block(s) IN the final summary; maintainer extracts (fence-strip), applies with `git am` (authorship preserved), validates, opens the PR. Chat-print recovery of stranded sessions fails on context limits — v2 re-kick (fresh run) is cheaper than archaeology.
- **Date:** 2026-07-05

## Prod parse 502s were undiagnosable: safe degradation without loud reporting

- **Symptom:** The first real production smoke (2026-07-04) found POST /api/parse-capture returning 502 "Parsing failed safely" for hours. The app degraded exactly as designed (raw capture survived, mock retry offered), but nothing anywhere said WHY: Vercel runtime logs showed only a trace-skip warning. Root-causing required manual probing and code spelunking.
- **Root cause:** Two stacked gaps. (1) `captureError` ships errors only to Sentry/PostHog/Langfuse adapters — with none configured in prod, server-side error capture was a silent no-op; the provider error (whose HTTP status pinpoints quota-vs-key-vs-model) was swallowed. (2) A first diagnosis probe used the wrong request shape (`{"text":...}` vs required `rawText`) and produced a plausible-but-wrong confirmation of the quota theory — the probe's own 502 was a validation error that never reached the provider. Pattern: "degrade safely" without "report loudly" makes failures invisible, and unvalidated probes confirm whatever you already believe.
- **Evidence:** PR #361 (one console.error line made the next probe definitive: `AI capture parsing request failed: 429`); Vercel runtime log queries 2026-07-04/05.
- **Status:** Fixed by #361 for this route. Open pattern-level follow-up: every catch-and-degrade path repo-wide must emit a sanitized console line (works with zero adapters configured); the daily-driver floor's provider canary (FR-030 draft) closes the detection gap end-to-end. Probe rule: before trusting a probe result, confirm the probe exercised the layer under test (find its server-side log line).
- **Date:** 2026-07-05

## Smoke test asserted a vocabulary the API never spoke

- **Symptom:** The prod smoke's parser-status check failed against a HEALTHY production: the test allowed `["ready", "ai_unavailable"]` but the API's designed value is `ai_configured`. A green surface produced a red smoke.
- **Root cause:** The smoke test restated the status vocabulary by hand instead of importing/deriving it from the source of truth (the route's own unit tests assert `ai_configured`); it was written against a remembered contract, not a read one. Restated vocabularies drift; imported ones cannot.
- **Evidence:** PR #360 (fix); the GET /api/parse-capture contract in route.ts + route.test.ts.
- **Status:** Fixed by #360. Standing rule for test authors (including agents): assert enum/status values by importing the canonical constant or reading the contract file in the same change — never from memory.
- **Date:** 2026-07-05

## Subagent delegate-and-quit, and the checkpoint gap in mid-task deaths

- **Symptom:** (a) A subagent tasked with implementation spawned its own background agent and stopped — twice, recursively; the grandchild eventually delivered, creating near-duplicate-work ambiguity when a retry agent launched. (b) Separately, agents dying mid-task (~50% of runs in the 2026-07-04 batch) left work only as local uncommitted worktree state.
- **Root cause:** (a) Nothing in the subagent prompt forbade delegation, and delegating is a low-effort "completion" for an agent unsure how to start. (b) No checkpoint discipline was specified, so agents defaulted to one giant end-of-task commit — maximally exposed to mid-task death.
- **Evidence:** PR #356's double-delegation chain (2026-07-04); the retry agent correctly verified-not-redid the existing branch and PR.
- **Status:** Fenced by two mandatory prompt clauses (operator-ratified 2026-07-04/05): every implementation subagent prompt explicitly forbids the Agent tool, and requires checkpoint discipline — untracked WORKPLAN.md first, commit per coherent unit, push after every commit, HANDOFF section on failure. Salvage protocol: fetch the branch, read WORKPLAN + diff, fresh-launch a continuation agent (never resume the dead one). A death now costs minutes, not work.
- **Date:** 2026-07-05
- **2026-07-05 addendum — the "API Response stalled mid-stream" death is SIZE-UNCORRELATED, and a batching-for-speed inference was wrong.** During the Opus subtle-polish session two subagents died with "API Error: Response stalled mid-stream," losing all work each time. In the moment this was rationalized as "long runs catch the stall window, so split into shorter runs" — **the data refutes that.** Completion metadata across 8+ runs that session: the two deaths were the SHORTEST-lived runs (527s / 532s, 38–48 tool calls) while successful runs went far longer (up to 3125s / 304 tool calls, and a 1878s solo run). Run length did not predict the stall. What the two deaths shared was not size but STATE: both were multi-packet batches still in a front-loaded audit/investigation phase with a **clean worktree — nothing committed yet** — so the probabilistic stream stall cost the entire run. Correct conclusion: the stall is an external API event we cannot prevent or predict from task shape; the only lever is making failure CHEAP. (1) Commit+push per SMALLEST coherent unit is what bounds a stall to the current unit — proven when the re-dispatched batch with strict per-packet-commit ordering ran 52 min and would have preserved every committed packet on death. (2) Prefer single-focus tasks — not because they stall less (unproven), but because they fail cheaper and salvage cleaner. Do NOT justify batching as stall-avoidance, and do NOT justify splitting as stall-avoidance; justify unit size by failure cost. Open gap: dead-agent transcripts were already garbage-collected (0 bytes) at post-mortem time — there is no captured final-state to inspect after a stall; if deeper root-causing is ever needed, snapshot the agent transcript on the death notification before it's reaped.
- **Date (addendum):** 2026-07-05

## A merged migration went unapplied for two days: no staged apply-SQL, no reminder

- **Symptom:** Migration Drift stayed RED even after the owner applied the four 2026-07-06 drift-fix files — two OLDER migrations (`20260705120000_add_task_is_reversible` / C3, `20260705130000_add_execution_session_cap_outcome` / C4) had merged on 2026-07-05, been flagged "prod needs manual apply," but never got a staged drift-fix file and were silently forgotten. Prod ran ~two days behind main on Stage-1 schema.
- **Root cause:** The manual-prod-apply step depended entirely on a human remembering, at merge time, to hand-assemble apply SQL (DDL + `schema_migrations` ledger rows) and stage it. Nothing generated the SQL, enqueued it, or flagged the PR — so a busy merge dropped it. The C3/C4 PRs (#422/#430) were mock-green and CI-green: the Migrations+RLS lane proves a migration is CORRECT, never that it was APPLIED to prod.
- **Evidence:** Migration Drift run 28835436092 (RED, 2026-07-07); `drift-fix-c3-c4-2026-07-07.sql` (owner-assembled recovery); green again from run 28844055978.
- **Status:** Fixed by U2b. `pnpm drift:assemble <files>` generates the paste-ready apply SQL in one command (proven to reproduce the hand-assembled ledger exactly — PR #453); a `Migration Apply Reminder` PR check flags any migration-adding PR with that exact command; `pnpm status` surfaces a RED Migration Drift with the fix. The human gate on prod DDL is deliberately kept — the prevention is generation + reminder, not auto-apply (NS-INV-2 additive-only makes CI auto-apply a later, lower-risk graduation, not now).
- **Date:** 2026-07-07

## A second merge race turned main red: two green-in-isolation docs PRs combined within 49 seconds

- **Symptom:** PR #471 (privacy/evidence hygiene, touched `docs/KNOWN_ISSUES.md`) and PR #472 (the blocking format check itself, plus a repo-wide reformat) each passed CI on their own branch, then merged 49 seconds apart. The combined state on main was never itself CI-validated before landing, and it had formatting drift; CI's new `pnpm format:check` step then failed on every subsequent PR (it checks the whole repo, not just the diff) until a human opened a one-file prettier fix by hand (PR #476).
- **Root cause:** Same pattern as the earlier `WorkflowState` guard race (#331/#337, above): a PR's CI proves the PR against the merge ref at review time, not against whatever lands on main seconds later from a concurrently-merging PR. `pnpm format:check` was added in the same PR (#472) that also reformatted the tree, so #471's un-rebased `docs/KNOWN_ISSUES.md` edit combined with #472's formatting pass into a state neither PR's own CI run had seen.
- **Evidence:** Commits `6b7c8561` (#471, 2026-07-09 18:30:34) and `4455c49c` (#472, 18:31:22); fix commit `8386bd69` (#476, 19:23:35).
- **Status:** Fenced going forward by `.github/workflows/format-selfheal.yml`: the blocking format check is what caught the drift (the fence already worked as a stop), and this workflow now auto-heals it — on the next CI failure whose only problem is formatting, it reformats main, verifies clean, and opens a PR through the same docs safe-automerge lane #476 rode, instead of waiting for a human to notice.
- **Date:** 2026-07-09

---

_Seeded 2026-07-02 from repo history and operator memory. Dead branches at seeding time (`agent/single-review-policy`, `codex/...a4-governance-restructure...`, `fix/plan-single-task-scheduling`, `ui/handoff-cockpit-pass`) were not chronicled — whoever closes or deletes one adds its entry._
