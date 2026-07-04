# FAILURES.md — the failure chronicle

Status: Living chronicle of closed battles — investigations, dead ends, and reverted approaches, so no session re-fights them.
Read when: BEFORE investigating any recurring symptom, and before proposing an approach that feels obvious (check it wasn't already tried).
Rule: every revert, abandoned branch, and multi-hour dead-end investigation adds an entry. Retirement with a documented "why" is a success outcome; silent abandonment is the failure.
Distinction: live, tolerated flaws belong in `docs/KNOWN_ISSUES.md`. This file records _settled_ matters: what was tried, why it lost, and what replaced it. Method reference: the `agentic-failure-archaeology` skill in `.agents/skills/`.

Entry schema: **Symptom → Root cause → Evidence → Status → Date.**

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
- **Status:** Fenced by the patch-paste protocol, proven three-for-three on 2026-07-04: the kick instructs Codex to post `git format-patch origin/main --stdout` as issue comments; a maintainer applies the patch in a worktree (`git am`, author preserved), runs the lanes the sandbox cannot (local Supabase/RLS), and opens the PR. Candidate follow-up (owner call; delivery apparatus is frozen): make patch-paste the kick template's standard fallback and add a deterministic claimed-PR-exists check after any Codex completion comment.
- **Date:** 2026-07-04

---

_Seeded 2026-07-02 from repo history and operator memory. Dead branches at seeding time (`agent/single-review-policy`, `codex/...a4-governance-restructure...`, `fix/plan-single-task-scheduling`, `ui/handoff-cockpit-pass`) were not chronicled — whoever closes or deletes one adds its entry._
