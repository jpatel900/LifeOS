# Contract-review checklist — merging a pipeline PR

Deterministic conformance rubric for the reviewer/merger (scheduled driver or any agent with merge authorization). Designed so a mid-tier model reaches the same verdict a frontier model would. Work through EVERY item; any single FAIL = do not merge (comment the specific item + @codex fix request instead).

## A. Identity and freshness
- [ ] PR body contains a closing keyword for exactly one pipeline-manifest issue.
- [ ] That issue is the LOWEST unmerged slice in the epic relay table (NS-INV-6 — no out-of-order merges).
- [ ] The issue's named file paths/modules still exist on current main (freshness rule; if the repo drifted, STOP and comment on the epic).

## B. Checks
- [ ] ALL CI checks green — no skipped-but-required, no "in progress". Never merge on yellow.
- [ ] If the diff touches apps/web/ or supabase/, confirm the heavy jobs (Playwright E2E, Migrations + RLS) actually RAN (path-gated CI can skip them; a green run that skipped them is not evidence).
- [ ] If the diff adds live-DB RLS tests: they are inside apps/web/src/__tests__/phase4aRls.local.test.ts (any new *.local.test.ts file does NOT run in CI — FAIL).

## C. Scope conformance (diff vs touch manifest)
- [ ] Every changed file is inside the issue's MAY-touch list. List violations file-by-file.
- [ ] Nothing from the MUST-NOT-touch list changed (always includes: .github/workflows/**, pipeline scripts, ci.yml, unrelated prompts).
- [ ] No schema weakening: no dropped/renamed columns or tables, no loosened zod schemas, no removed/weakened tests or RLS policies (grep the diff for deletions in migrations, packages/schemas, __tests__).
- [ ] Additive-only (NS-INV-2): migrations only ADD; no ALTER that repurposes an earlier slice's column.

## D. Contract satisfaction
- [ ] Each numbered task in the issue maps to visible diff content. Name the mapping.
- [ ] Each acceptance criterion is either covered by a test in the diff or demonstrably true from CI output. "Should work" is FAIL.
- [ ] New AI judgment surfaces write suggestion_records/override_records (NS-INV-3) — search the diff.
- [ ] New persisted AI artifacts are approval-gated (NS-INV-4) — no new silent write path.
- [ ] New prompt context flows through the context-assembly module (NS-INV-1), not ad-hoc plumbing.
- [ ] **Coherence pass honored.** The slice's FR(s) are registered in `coherence-registry.json` with valid `invariants`/`policy_ids`; any new cross-feature interaction the diff creates is a registered edge; every `X` edge has a `resolution_ref`; new interactions map to a named interaction-pattern (or logged petition); the map-view field is answered; new copy conforms to house voice (no retired terms); new UI uses only registered keymap entries and `--state-*`/`--area-accent*` tokens (no raw hex). `coherenceRegistry.test.ts` is green.

## E. S0 (contract slice) PRs only
- [ ] Diff touches ONLY the four contract docs (+ doc-guard expectations).
- [ ] Appendix content transcribed faithfully: numbers, table/column names, and pinned paths in the docs MATCH the issue appendix exactly. Spot-check every threshold number.
- [ ] Conflicts with pre-existing doc text are flagged as PR comments by the author, not silently resolved.

## F. Verdict
- ALL PASS -> plain merge (never --admin, never --no-verify). Comment: "Contract review: PASS on all checklist sections."
- Any FAIL -> comment the failed items with file/line specifics + @codex fix request. Do NOT merge partially conformant work.
- **Coherence STOP-and-surface.** When authoring or review surfaces a contradiction between two features, two artifacts, or a feature and an invariant — an FR-number collision, a token/keyword meaning two things, a policy id used two ways, an interaction pattern that fights another, an invariant an FR would violate — you MUST NOT silently resolve it, author around it, or pick a side to keep moving. STOP. Record it as a `kind:"X"` edge (or an open contradiction note) and surface it: a dated decision-log entry on the governing epic + tag @jpatel900. Resolution is an owner-gated decision that lands in REQUIREMENTS/the registry/the ADR **and all affected sibling artifacts together**. Silent resolution is itself a coherence failure.
- Anything not covered by this checklist that feels wrong -> STOP, comment on the epic, tag @jpatel900. Uncertainty escalates; it never merges.
