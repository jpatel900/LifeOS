# UI Severity Vocabulary

- Task name: `#165 UI Pass 7 12 Define severity vocabulary`
- Branch: `pass-7-issue-200-hardening`

## Original scope

Define the shared severity vocabulary before degraded-state copy and tests are expanded further.

## Assumptions

- Pass 7 needs a canonical distinction between degraded-but-usable and blocked-or-failed states before `#161` can add stable severity tests.
- The right short-term move is documentation and routing, not a broad component or route rewrite.

## Decisions

- Added one compact shared doc for `success`, `info`, `warning`, and `danger`.
- Explicitly documented that approval gating, loading, and developer detail are not severity levels.
- Recorded the current primitive mapping so `info` intent can map to `secondary` without pretending the component API already exposes a literal `info` variant.
- Wired the new severity doc into the active roadmap and UI guide rather than opening a separate planning branch.

## Deviations

- I did not change route runtime copy in this issue.
- I did not add new design tokens, alert variants, or a cross-app severity helper yet. That would be implementation work for later issues if the current primitives prove insufficient.

## Tradeoffs

- The doc is intentionally compact, which keeps it usable, but later route issues still need judgment when deciding between `info` and `warning` in edge cases.
- Using canonical severity intent plus primitive mapping avoids premature UI refactors, but it means tests must assert user-facing semantics rather than only component variant names.

## Files changed and why

- `docs/agent/UI_SEVERITY_VOCABULARY.md`
  - Added the canonical Pass 7 severity intent, primitive mapping, copy contract, and route anchors.
- `docs/agent/UI_AGENT_GUIDE.md`
  - Routed degraded-state and severity-test work to the new vocabulary doc.
- `docs/UI_UX_WORLD_CLASS_ROADMAP.md`
  - Added the severity vocabulary to the active Pass 7 rule set and proof spine.
- `docs/agent/UI_PASS_7_GITHUB_UPDATES.md`
  - Added the exact GitHub comment draft for `#165`.
- `docs/implementation-notes/2026-06-08-ui-severity-vocabulary.md`
  - Recorded scope, decisions, proof, and rollback notes for this shared-rule pass.

## Validation commands and results

- `pnpm install --frozen-lockfile`
  - passed
- `git diff --check`
  - passed with LF to CRLF normalization warnings only
- `pnpm lint`
  - passed
- `pnpm type-check`
  - passed
- `pnpm test`
  - passed
- `pnpm build`
  - passed

## Risks

- A few existing route strings may still blur `info` and `warning` until later copy issues land.
- Because this issue is doc-first, route tests added in `#161` will be the real check that the vocabulary is being applied consistently.

## Deferred items

- Return to `#161` and add degraded-state severity tests against this new vocabulary.
- Use later copy and route issues to normalize any remaining states that still read harsher or softer than they should.

## Rollback notes

- Revert the new severity doc, the roadmap and guide wiring, the GitHub draft block, and this note together.
- Do not replace the doc with issue-body-only guidance; Pass 7 needs one canonical shared rule, not repeated fragments.
