# UI/UX Status Header Pass

- Task name: `#151 Docs Hygiene 05 Add status headers to UI UX docs`
- Branch: `pass-7-issue-200-hardening`

## Original scope

Add explicit status headers so the relevant UI/UX docs tell future agents whether each document is active, authoritative, archived, or otherwise limited in scope.

## Assumptions

- The main failure mode is not missing content; it is ambiguous document role at the top of the file.
- The smallest safe fix is to standardize the top-of-file contract, not to rewrite document bodies.
- `Superseded by` should exist only where it conveys real routing value; active authority docs can state `n/a`.

## Decisions

- Added the status-header contract to the remaining high-value UI/UX docs that lacked it or used ad hoc wording:
  - `docs/UX_FLOWS.md`
  - `docs/UI_UX_WORLD_CLASS_ROADMAP.md`
  - `docs/PROJECT_STATE.md`
  - `docs/agent/UI_PASS_7_EXECUTION_MAP.md`
  - `docs/agent/UI_PASS_7_FINAL_AUDIT_RUBRIC.md`
  - `docs/agent/UI_UX_DOC_INVENTORY.md`
  - `docs/agent/UI_PASS_7_LABEL_PLAN.md`
  - `docs/agent/UI_PASS_7_GITHUB_UPDATES.md`
  - `docs/archive/ui-ux/README.md`
- Kept the new archived redirect stubs from `#149` as part of the same header pattern rather than inventing a second style.

## Deviations

- I did not rewrite route rules, roadmap content, or issue metadata semantics. This is top-of-file routing and role clarity only.
- I did not yet tighten the context route itself. That remains `#152`.

## Tradeoffs

- Some docs now have more front matter than before, but that is cheaper than future agents misreading their authority level.
- A uniform header pattern slightly increases repetition across docs, but it eliminates ambiguity at the fastest possible scan depth.

## Files changed and why

- `docs/UX_FLOWS.md`
  - Added the authority/status header.
- `docs/UI_UX_WORLD_CLASS_ROADMAP.md`
  - Added the active-roadmap status header.
- `docs/PROJECT_STATE.md`
  - Added the shipped-truth handoff status header.
- `docs/agent/UI_PASS_7_EXECUTION_MAP.md`
  - Added an explicit supersession path for after GitHub backfill and closeout.
- `docs/agent/UI_PASS_7_FINAL_AUDIT_RUBRIC.md`
  - Added an explicit active-audit header and post-closeout role note.
- `docs/agent/UI_UX_DOC_INVENTORY.md`
  - Added the inventory status header.
- `docs/agent/UI_PASS_7_LABEL_PLAN.md`
  - Added a supersession line pointing to real GitHub metadata after backfill.
- `docs/agent/UI_PASS_7_GITHUB_UPDATES.md`
  - Reframed the top block into the same standard header contract.
- `docs/archive/ui-ux/README.md`
  - Added a supersession line pointing back to the live docs.
- `docs/implementation-notes/2026-06-08-ui-ux-status-header-pass.md`
  - Preserved the scope and proof for this header pass.

## Validation commands and results

- `git diff --check`
  - passed
- `pnpm lint`
  - passed
- `pnpm type-check`
  - passed
- `pnpm test`
  - passed
- `pnpm build`
  - passed

## Risks

- The header pattern is only as good as future maintenance; stale status lines can become their own drift vector if later passes do not update them honestly.
- This pass improves scan-time clarity, but it does not itself enforce smaller context loads. That remains `#152`.

## Deferred items

- Tighten the UI context route in `#152`.
- Add duplicate-active-plan guardrails in `#153`.

## Rollback notes

- Revert the header updates and this note together.
- Do not roll back the archived redirect stubs from `#149` as part of this header-only issue.
