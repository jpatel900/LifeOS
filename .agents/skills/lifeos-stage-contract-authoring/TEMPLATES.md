# Templates — stage contract, epic, and slice issues

Fill-in-the-blanks skeletons. Prior artifacts #252, #251, and #253–#261 illustrate the shape but are not current authority. Resolve ambiguity from current REQUIREMENTS, ADRs, and the governing issue; escalate missing decisions instead of copying stale scope. These templates help an executor preserve structure without replacing judgment.

## 1. S0 contract issue skeleton

```markdown
**Stage <N> (epic #<E>) - slice 1 of <K>. Blocks every other Stage <N> slice.
Gate: <owner review | Claude fidelity review per epic decision log>.**

## Context

<2-4 sentences: what the capability wave adds; cite current REQUIREMENTS, ADR 0005, applicable invariants, and any capability-specific evidence gate.>

## Scope (binding)

Docs only: docs/REQUIREMENTS.md, docs/DATA_MODEL.md, docs/ENGINEERING_INVARIANTS.md, docs/UX_FLOWS.md.
MUST NOT touch: code, migrations, prompts, tests other than doc-guard expectations.

## Tasks

1. Integrate Appendix A (FR text) into REQUIREMENTS.md section 2, matching existing FR format.
2. Integrate Appendix B (target schema shapes) into DATA_MODEL.md.
3. Record Appendix C invariant notes in ENGINEERING_INVARIANTS.md with enforcement points.
4. Add Appendix D flow notes to UX_FLOWS.md at flow level.

## Acceptance criteria

- All FRs + shapes internally consistent and consistent with ADR 0002; doc-guard tests pass;
  no code changes; gate reviewer approval on the PR.

## Appendix A - draft requirement text (integrate, do not invent alternatives)

<One FR-XXX block per feature. Each block: **MUST** list, **SHOULD** list, **NON-GOALS** list.
Every MUST is testable. Every threshold is a NUMBER, never "reasonable" or "appropriate".>

## Appendix B - target schema shapes (column level; later slices ADD only)

<One block per table/column-set, tagged with the slice that implements it:
name, columns with types and nullability, FKs, uniques, RLS note, export note.
Pin every module path. Pin every constant.>

## Appendix C - invariants to record

<Cite NS-INV IDs affected; name the guard test that enforces each.>

## Appendix D - UX flow notes

<Flow-level only; respect mobile surface budget doctrine.>

map_view: <hosting moment / state tokens / collapsed+expanded representation>
```

## 2. Stage epic (campaign file) skeleton

Required sections IN ORDER — the relay workflow and driver parse some headings verbatim:

1. Header paragraph: governing ADR, "body = frozen scope + relay order; decision log = comment thread (append-only)"; re-entry instruction.
2. `## Entry prerequisites (hard)` — structural dependencies verified; capability-specific evidence pasted where required; S0 gate defined. Do not require unrelated prior-stage usage.
3. `## Success criterion (frozen <date>)` — numbered golden-journey behaviors + `CHECK:` line naming the spec/evidence.
4. `## Relay order` — table: slice, issue, name, depends-on. One slice in flight (NS-INV-6).
5. `## Standing agent rules for every issue in this epic` — **this heading text is load-bearing**: pipeline-advance.yml kick comments cite it verbatim. Copy the #251 section and adapt; never rename the heading.
6. `## Operating loop` — who kicks, who reviews (cite CONTRACT_REVIEW_CHECKLIST.md), who merges, owner touchpoints.
7. `## Manifest cutover` — ready-to-apply JSON for scripts/agent/pipeline-manifest.json (match its current schema exactly; read the live file first).
8. `## Binding rules for every slice` — NS-INV-1..9 one-liners.
9. `## Re-entry protocol (cold agent session)`.
10. `## Wrong paths` + `## Decision log` (both append-only).

## 3. Slice issue skeleton

```markdown
**Stage <N> (epic #<E>) - slice <i> of <K>. Depends: <predecessor> merged. Sequential relay per NS-INV-6.**

## Context

<2-3 sentences; cite the S0 appendix section this slice implements.>

## Scope (binding)

MAY touch: <explicit path list>. MUST NOT touch: <explicit path list — always include: pipeline scripts, ci.yml, unrelated prompts>.

## Tasks

<Numbered, mechanical, each verifiable. Cite exact file paths from S0. Include the RLS-test-location rule verbatim when schema is touched (live-DB RLS tests go INSIDE apps/web/src/**tests**/phase4aRls.local.test.ts).>

## Acceptance criteria

<Each criterion machine-checkable or observable in CI. Name the test files/specs. End with: "Zero user-visible change" when true.>
```

## 4. Hard rules for template use

- Numbers, paths, and names come from the CURRENT repo (read the live files), never from memory or old issues.
- If a skeleton section cannot be filled because information is missing: STOP and escalate to the owner on the epic. Do not fill gaps with plausible inventions.
- Never remove a template section; mark inapplicable ones "N/A — <reason>".
