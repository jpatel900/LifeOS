# FAILURES.md — the failure chronicle

Settled battles: what was tried, why it lost, what replaced it. Live flaws go in `docs/KNOWN_ISSUES.md`. Add an entry for every revert or multi-hour dead end. An entry whose status is a standing fence (a workaround for a tool or model limit) carries a **Retirement condition**; retest it after ~90 quiet days and delete it if the retest passes.

Entry schema: **Symptom → Root cause → Evidence → Status → Date** (+ **Retirement condition** when the Status is a standing fence).

---

## Distilled entries (one line + pointer)

The lesson now lives in doctrine or a guard; full text is in git history (distillation #289, 2026-10-17).

- **Env-blind validation: implementer's green ≠ CI's green (B7, PR #291)** — PR #291 (2026-07-03): mock fallbacks made `pnpm test` green in a no-services sandbox while required CI lanes failed. → `lifeos-testing` (environment-dependent lanes; green from the right layer).
- **Codex ignored the pipeline's @codex kicks** — 2026-07: Codex ignores bot-authored mentions, so kicks post via `CODEX_KICK_TOKEN`. Do not switch back to `GITHUB_TOKEN`. (The relay workflow that posted kicks was deleted 2026-10-17.)
- **Required-review branch protection was unsatisfiable** — 2026-06/07: required reviews cannot be met on a solo repo, so they were removed; strict up-to-date kept. Merge authority → `AGENTS.md` (Merge authority).
- **Remote schema dump committed as a migration broke local resets** — 2026-06-12/13: a remote drift dump committed as a migration broke `supabase db reset`. Never commit drift dumps; author migrations and verify a local reset. → KNOWN_ISSUES row 7; `scripts/agent/migration-drift-allowlist.mjs`.
- **Per-PR auto-review produced noise, not safety (check diet)** — PR #248: blanket auto-review was noise. Extend the risk classifier, not blanket reviews. → `scripts/agent/classify-pr-risk.mjs`.
- **Doc sprawl → the doc-registry guard** — Issue #228 / PR #244: session notes and duplicate docs forked truth. → `docRegistry.test.ts` (allowlist, shrink-only registry, entry-file budget that never rises).
- **Merge race turned main red: a guard and its offenders merged 77 seconds apart** — #331/#337 (2026-07-04); fixed by #340. Still open: why Main Red Guard skipped on that red main. → `lifeos-testing` (a PR's CI proves it against main as of that run).
- **Codex mention-lane deliveries stranded: make_pr claimed success, nothing reached GitHub** — #240/#313/#323 (2026-07-04): `make_pr` reported success but nothing reached GitHub; recovered by patch (#347-#349). → protocol v2, next line.
- **Stranded-delivery recovery by mention is dead: a follow-up @codex mention spawns a fresh environment** — 2026-07-05: a follow-up @codex mention starts a fresh environment with none of the task's commits, and the sandbox has no comment tool. Protocol v2 (patch inside the final summary, applied with `git am`; proven by #402/#404-#406) → harvest rules → `docs/agent/LANES.md`.
- **A merged migration went unapplied for two days: no staged apply-SQL, no reminder** — 2026-07-07: C3/C4 migrations were CI-green but never applied to prod. Fixed by `pnpm drift:assemble` + the apply-reminder check, later by the gated `migration-apply.yml`. → `lifeos-migration-drift-response`; `lifeos-testing` (correct is not applied).
- **A second merge race turned main red: two green-in-isolation docs PRs combined within 49 seconds** — #471/#472 (2026-07-09); healed by #476. → same `lifeos-testing` rule; `format-selfheal.yml` heals format-only reds.
- **Two governance stores drifted apart: the repo's status doc went dead while the real program lived out-of-repo** — 2026-08-04: the real program lived outside the repo while PROJECT_STATE went stale. The program now lives in `docs/program/` (PR #811). → `AGENTS.md` (intro); freshness rule at the top of `docs/PROJECT_STATE.md`.
- **Turbo's test cache key didn't cover the paths its own guards read — a docs-only change could hit a stale cached PASS** — 2026-08-21: `turbo.json`'s `test` task had no `inputs`, so a docs-only change could replay a cached PASS from a guard that reads `docs/**`. Never drop the root inputs or set `cache: false` to paper over a gap. → `scripts/agent/check-turbo-test-inputs.mjs` (CI).
- **A migration went unseen for a month: the drift detector only looked one way** — 2026-07-18 → 08-21: a hand-applied prod migration was invisible because the drift check only compared repo → prod. Now both directions, with an allowlist that has a reason per entry. → `scripts/agent/check-migration-drift.mjs`, `scripts/agent/migration-drift-allowlist.mjs`.
- **A self-test that would have caught this drift was never running: `campaigns.json` and its own guard went stale together** — 2026-08-29: `status.test.mjs` never ran in CI, and both program docs under-listed C2 slices in lockstep. Now a CI job (`program-state-self-test`) with a git-history cross-check and a vacuity floor. → `scripts/agent/status.test.mjs`.
- **Owner decisions decided in chat, never written back** — 2026-07-28: gates decided in chat stayed unticked, so the work map lied. → `AGENTS.md` "Delivering work" (tick + DECIDED comment).
- **Prod parse 502s were undiagnosable** — 2026-07-05: safe degradation with no log line hid a provider 429; one sanitized `console.error` fixed it (#361). Every catch-and-degrade path logs one sanitized line. → `lifeos-testing` (a probe counts only if its server log shows it reached the layer).
- **Smoke test asserted a vocabulary the API never spoke** — #360: import status/enum constants; never restate them from memory.
- **Subagents lost work on mid-task deaths** — 2026-07-04/05: stream stalls are random and size-unrelated; only cheap failure helps. → `lifeos-lane-contract` (commit and push per unit).
- **Codex billing** — the @codex mention lane bills the flat subscription; the `codex-*` GitHub Actions lanes are live and bill `OPENAI_API_KEY` per run (2026-10-17: `codex-pr-review.yml` runs on `review:llm`). Expanding Actions use is a spending decision: redo the cost math and get the owner's call first.

---

_Seeded 2026-07-02 from repo history and operator memory. Dead branches at seeding time (`agent/single-review-policy`, `codex/...a4-governance-restructure...`, `fix/plan-single-task-scheduling`, `ui/handoff-cockpit-pass`) were not chronicled — whoever closes or deletes one adds its entry._
