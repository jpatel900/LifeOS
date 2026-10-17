# FAILURES.md — the failure chronicle

Status: Living chronicle of closed battles — investigations, dead ends, and reverted approaches, so no session re-fights them.
Read when: BEFORE investigating any recurring symptom, and before proposing an approach that feels obvious (check it wasn't already tried).
Rule: every revert, abandoned branch, and multi-hour dead-end investigation adds an entry. Retirement with a documented "why" is a success outcome; silent abandonment is the failure.
Distinction: live, tolerated flaws belong in `docs/KNOWN_ISSUES.md`. This file records _settled_ matters: what was tried, why it lost, and what replaced it. Method reference: the `agentic-failure-archaeology` skill in the maintainer's skill hub (no longer vendored in-repo since the 2026-08-04 skills prune).

Apparatus-sunset convention (vision harvest, 2026-07-05): when an entry's Status is a standing _fence_ — a workaround, protocol, or ceremony that compensates for a tool/environment/model limitation (e.g. patch-paste delivery, mention-kick tokens, degraded-tier runbooks) — add a **Retirement condition** line stating the observable event that should trigger a deliberate retest, and delete the fence if the retest passes. Process volume is not trust; gates and guard tests are. The quarterly distillation (#289) sweeps these: a fence whose failure has not recurred in ~90 days gets retested, not kept by default.

Entry schema: **Symptom → Root cause → Evidence → Status → Date** (+ **Retirement condition** when the Status is a standing fence).

---

## Distilled entries (one line + pointer)

The lesson now lives in doctrine or a guard; full text is in git history (distillation #289, 2026-10-17).

- **Env-blind validation: implementer's green ≠ CI's green (B7, PR #291)** — PR #291 (2026-07-03): mock fallbacks made `pnpm test` green in a no-services sandbox while required CI lanes failed. → `lifeos-testing` (environment-dependent lanes; green from the right layer).
- **Codex ignored the pipeline's @codex kicks** — 2026-07: Codex ignores bot-authored mentions, so kicks post via `CODEX_KICK_TOKEN`. Do not switch back to `GITHUB_TOKEN`. → `.github/workflows/pipeline-advance.yml`.
- **Required-review branch protection was unsatisfiable** — 2026-06/07: required reviews cannot be met on a solo repo, so they were removed; strict up-to-date kept. Merge authority → `AGENTS.md` (PR and merge).
- **Remote schema dump committed as a migration broke local resets** — 2026-06-12/13: a remote drift dump committed as a migration broke `supabase db reset`. Never commit drift dumps; author migrations and verify a local reset. → KNOWN_ISSUES row 7; `scripts/agent/migration-drift-allowlist.mjs`.
- **Per-PR auto-review produced noise, not safety (check diet)** — PR #248: blanket auto-review was noise. Extend the risk classifier, not blanket reviews. → `scripts/agent/classify-pr-risk.mjs`.
- **Doc sprawl → the doc-registry guard** — Issue #228 / PR #244: session notes and duplicate docs forked truth. → `docRegistry.test.ts` (allowlist, shrink-only registry, entry-file budget that never rises).
- **Merge race turned main red: a guard and its offenders merged 77 seconds apart** — #331/#337 (2026-07-04); fixed by #340. Still open: why Main Red Guard skipped on that red main. → `lifeos-testing` (a PR's CI proves it against main as of that run).
- **Codex mention-lane deliveries stranded: make_pr claimed success, nothing reached GitHub** — #240/#313/#323 (2026-07-04): `make_pr` reported success but nothing reached GitHub; recovered by patch (#347-#349). → protocol v2, next line.
- **Stranded-delivery recovery by mention is dead: a follow-up @codex mention spawns a fresh environment** — 2026-07-05: a follow-up @codex mention starts a fresh environment with none of the task's commits, and the sandbox has no comment tool. Protocol v2 (patch inside the final summary, applied with `git am`; proven by #402/#404-#406) → the kick text in `.github/workflows/pipeline-advance.yml`; harvest rules → `docs/agent/LANES.md`.
- **A merged migration went unapplied for two days: no staged apply-SQL, no reminder** — 2026-07-07: C3/C4 migrations were CI-green but never applied to prod. Fixed by `pnpm drift:assemble` + the apply-reminder check, later by the gated `migration-apply.yml`. → `lifeos-migration-drift-response`; `lifeos-testing` (correct is not applied).
- **A second merge race turned main red: two green-in-isolation docs PRs combined within 49 seconds** — #471/#472 (2026-07-09); healed by #476. → same `lifeos-testing` rule; `format-selfheal.yml` heals format-only reds.
- **Two governance stores drifted apart: the repo's status doc went dead while the real program lived out-of-repo** — 2026-08-04: the real program lived outside the repo while PROJECT_STATE went stale. The program now lives in `docs/program/` (PR #811). → `AGENTS.md` (Authority); freshness rule at the top of `docs/PROJECT_STATE.md`.
- **Turbo's test cache key didn't cover the paths its own guards read — a docs-only change could hit a stale cached PASS** — 2026-08-21: `turbo.json`'s `test` task had no `inputs`, so a docs-only change could replay a cached PASS from a guard that reads `docs/**`. Never drop the root inputs or set `cache: false` to paper over a gap. → `scripts/agent/check-turbo-test-inputs.mjs` (CI).
- **A migration went unseen for a month: the drift detector only looked one way** — 2026-07-18 → 08-21: a hand-applied prod migration was invisible because the drift check only compared repo → prod. Now both directions, with an allowlist that has a reason per entry. → `scripts/agent/check-migration-drift.mjs`, `scripts/agent/migration-drift-allowlist.mjs`.
- **A self-test that would have caught this drift was never running: `campaigns.json` and its own guard went stale together** — 2026-08-29: `status.test.mjs` never ran in CI, and both program docs under-listed C2 slices in lockstep. Now a CI job (`program-state-self-test`) with a git-history cross-check and a vacuity floor. → `scripts/agent/status.test.mjs`.

## Owner decisions decided in chat, never written back — the work map drifted

- **Symptom:** The generated work map's "Owner Queue" showed five decisions as pending (#737 make-it-true, #742 door, merge/apply gates on #775/#777/#778) that the owner had already made days earlier. The owner discovered the drift by asking whether the map was accurate (2026-07-28).
- **Root cause:** A closure-ritual asymmetry with a dual-store state. The program formalized how decisions are ASKED (plain-language `- [ ] OWNER-GATE:` checkboxes on issues/PRs — machine-harvested by the map generator) but never formalized how they are CLOSED. Decisions happened in the orchestrator's chat and were recorded in the orchestrator's private layer (handover/program docs, session memory) — a second store the map does not read. The write-back to the canonical store (GitHub) was manual, unowned, and therefore skipped. Classic dual-write drift: the authoritative artifact was the one nobody was required to update.
- **Evidence:** 2026-07-28 map render listed all five resolved gates as open; each gate's issue/PR body still carried the unticked checkbox while the orchestrator's PROGRAM/TARGET-CARDS docs recorded the decisions with dates.
- **Status:** Fixed at instance and cause. Instance: all five gates ticked `- [x]` with DECIDED comments (see #737/#742 comments of 2026-07-28). Cause: standing closure ritual — the session in which the owner decides must, in that same turn, tick the gate's checkbox and post a one-line DECIDED comment on the artifact; the map is regenerated at every major milestone as part of the checkpoint. A decision is not done until the artifact says so.
- **Date:** 2026-07-28

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

## Parallel agent fan-out burned the entire usage window (ops, maintainer-side)

- **Symptom:** Two 19-agent authoring workflows died mid-flight with "session limit" errors; ~1.4M tokens spent for partial output; all work blocked until window reset.
- **Root cause:** Concurrent subagent fan-out multiplies cold-start context cost; a rolling usage window can be exhausted in minutes while sequential inline work would have fit.
- **Evidence:** 2026-07-02 skills-library authoring session (recorded in maintainer memory and the library's own `agentic-context-engineering-reference` §2).
- **Status:** Fenced — default to sequential/inline work for bulk tasks; reserve fan-out for adversarial review and schedule it right after window resets.
- **Date:** 2026-07-02
- **Retirement condition:** no repeat is recorded since 2026-07-02 (over 90 days), so a retest is due (#289 sweep, 2026-10-17): run one bounded fan-out of 5-10 agents. If it finishes inside the usage window, delete this fence.

## Codex Actions lanes retired in favor of the mention lane

- **Symptom:** Two ways to invoke Codex existed (Actions `codex-*` workflows and the @codex mention lane); the Actions lanes sat unused and looked like dead config.
- **Root cause:** Economic, not technical: Actions lanes bill the OpenAI API key per run; the mention lane bills the flat subscription.
- **Evidence:** Pipeline design (epic #243) routes exclusively through human-authored mention kicks.
- **Status:** Settled decision, not debt. Do not "clean up" by re-enabling Actions lanes without redoing the cost math.
- **Date:** 2026-07

---

_Seeded 2026-07-02 from repo history and operator memory. Dead branches at seeding time (`agent/single-review-policy`, `codex/...a4-governance-restructure...`, `fix/plan-single-task-scheduling`, `ui/handoff-cockpit-pass`) were not chronicled — whoever closes or deletes one adds its entry._
