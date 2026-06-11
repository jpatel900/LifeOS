# UI Screenshot Evidence Workflow

- Task name: `#164 UI Pass 7 11 Define screenshot evidence workflow`
- Branch: `pass-7-issue-200-hardening`

## Original scope

Define the screenshot workflow that sits between the high-level proof requirement and the later final audit packet.

## Assumptions

- The repo already requires screenshot proof for certain UI work, but it did not yet say where to keep images during work or what note must accompany them.
- The correct short-term storage answer is the existing ignored `apps/web/test-results/` path, not committed image binaries.

## Decisions

- Added one compact workflow doc for screenshot evidence.
- Defined the minimum image set, local storage location, suggested naming, and required review note.
- Wired the UI guide to the new doc instead of expanding the guide into another long operational checklist.

## Deviations

- I did not create the final audit packet format here. That still belongs to `#197`.
- I did not add screenshot files or new folders to the repo. The workflow defines location and naming without committing binary artifacts.

## Tradeoffs

- Using `apps/web/test-results/` keeps the workflow pragmatic and aligned with existing local proof paths, but it means the actual files remain local unless attached or referenced elsewhere later.
- The doc stays intentionally lightweight. It is enough to make proof repeatable now without front-loading the heavier final-audit packet shape.

## Files changed and why

- `docs/agent/UI_SCREENSHOT_EVIDENCE_WORKFLOW.md`
  - Added the operational screenshot workflow for Pass 7 UI issues.
- `docs/agent/UI_AGENT_GUIDE.md`
  - Routed screenshot-required work to the new workflow doc.
- `docs/agent/UI_PASS_7_GITHUB_UPDATES.md`
  - Added the exact GitHub comment draft for `#164`.
- `docs/implementation-notes/2026-06-11-ui-screenshot-evidence-workflow.md`
  - Recorded scope, decisions, proof, and rollback notes for this docs batch.

## Validation commands and results

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

- Later audit work may still decide that some screenshot artifacts need an attachment-first or external-link-first convention beyond this local workflow.
- Because the doc points at a local ignored directory, teams or future agents still need to reference chosen files explicitly in handoff notes instead of assuming reviewers can browse them remotely.

## Deferred items

- Standardize the final screenshot evidence packet in `#197`.
- Use later UI implementation issues to produce real screenshot sets against this workflow.

## Rollback notes

- Revert the workflow doc, the guide link, the GitHub draft block, and this note together.
- Do not replace it with more scattered reminders inside unrelated docs; the point is to keep one operational proof path.
