# Agentic Delivery Phase A Hardening

- Task name: `#56 #59 #60 #61` safe hands-off delivery hardening
- Branch: `governance/agentic-delivery-phase-a-hardening`

## Original scope

Harden deterministic automation guards before expanding hands-off delivery, add the first safe auto-merge label-propagation path for verified T0 issues, standardize PR evidence bundles, and add a lightweight automation decision log using GitHub-native surfaces.

## Assumptions

- The existing safe auto-merge path remains the only final merge authority.
- Workflow summaries, PR bodies, and issue comments are sufficient for V1 automation telemetry.
- Control-plane changes stay review-required even when they make future T0 work more hands-off.

## Decisions

- Consolidated guard definitions in `scripts/agent/automation-policy.mjs` so low-risk automation, CI autofix, safe auto-merge checks, and PR risk classification do not drift independently.
- Added `scripts/agent/check-automation-scope.mjs` as the shared deterministic path-policy evaluator for low-risk issue automation and CI autofix.
- Kept the safe auto-merge allowlist unchanged at `docs/**`, `README.md`, and `.github/ISSUE_TEMPLATE/**`.
- Allowed low-risk issue automation to propagate `risk:low` plus `automerge:safe` only after validation passes and only when the source issue already carries the full safe-label set.
- Standardized PR evidence bundles around route, outcome, changed files, coverage, validation, browser/manual proof, touched/untouched risk surfaces, rollback, and deferred items.
- Used workflow summaries plus docs runbooks as the automation decision-log surface instead of adding runtime telemetry or a database table.

## Deviations

- None from the intended scope. The work stayed in governance docs, workflow YAML, prompts, and agent scripts only.

## Tradeoffs

- Centralizing guard patterns reduces drift risk but makes `scripts/agent/automation-policy.mjs` more sensitive; any future change there affects multiple automation paths and should stay human-reviewed.
- Workflow summaries are lightweight and GitHub-native, but they are not queryable analytics. That is acceptable for the current repo scale.
- The evidence bundle adds some PR-body verbosity, but it is still far cheaper than forcing humans to reconstruct proof from raw logs.

## Files changed and why

- `scripts/agent/automation-policy.mjs`: shared allowlist/forbidden-path/high-risk-path definitions.
- `scripts/agent/check-automation-scope.mjs`: shared automation scope guard plus self-tests.
- `scripts/agent/check-safe-automerge.mjs`: switched to shared policy helpers and refreshed self-tests.
- `scripts/agent/classify-pr-risk.mjs`: switched to shared high-risk path definitions.
- `.github/workflows/codex-low-risk-issue-to-pr.yml`: safe-label propagation, shared guard usage, richer evidence bundle, decision-log summary.
- `.github/workflows/codex-ci-autofix.yml`: shared guard usage, richer evidence bundle, decision-log summary.
- `.github/AGENT_AUTOMATION_POLICY.md`: clarified path-tier matrix and hands-off boundaries.
- `.github/codex/prompts/low-risk-implementation.md`: required coverage/proof/risk-surface fields for evidence bundles.
- `.github/codex/prompts/ci-autofix.md`: required coverage/proof/risk-surface fields for evidence bundles.
- `.github/labels.md`: documented `automerge:safe`.
- `docs/agent/AUTOMATION_EVIDENCE_BUNDLE.md`: reviewer-facing PR evidence standard.
- `docs/agent/AUTOMATION_DECISION_LOG.md`: GitHub-native decision-log guidance and monthly review checklist.
- `docs/PROJECT_STATE.md`: concise current-state update and implementation note reference.

## Validation commands and results

- `node scripts/agent/check-automation-scope.mjs --self-test`
- `node scripts/agent/check-safe-automerge.mjs --self-test`
- `node scripts/agent/classify-pr-risk.mjs --self-test`
- `pnpm lint`
- `pnpm type-check`
- `pnpm test`
- `pnpm build`
- `pnpm format:check`
- `git diff --check`

Results:

- `check-automation-scope` self-test: passed (19 cases)
- `check-safe-automerge` self-test: passed (9 cases)
- `classify-pr-risk` self-test: passed (6 cases)
- `pnpm lint`: passed
- `pnpm type-check`: passed
- `pnpm test`: passed
- `pnpm build`: passed
- `pnpm format:check`: repo-baseline failure only in unrelated files `apps/web/src/app/page.tsx`, `README.md`, and `scripts/run-playwright-e2e.mjs`
- `git diff --check`: passed

## Risks

- Guard centralization means a bad shared policy edit could affect multiple automation routes at once.
- Workflow-summary logging is only as useful as the fields kept stable across future workflow edits.
- The repo-wide formatting baseline may still drift independently of these control-plane changes.

## Deferred items

- Scenario-pack and verified-medium automation work remains for the follow-on issues under `#53`.
- No change was made to the safe auto-merge allowlist, review workflow authority, or runtime product behavior.

## Rollback notes

- Revert the branch commit that introduces the shared automation policy and workflow summary/evidence-bundle changes.
- If necessary, restore the prior per-script guard logic and remove the new docs/runbook additions.
