# 2026-06-23 - Context-diet routing and manual-fallback cleanup

Status: Implemented on `docs/207-209-212-214-218-context-diet`
Why: The remaining context-diet and routing issues were all versions of the same problem: too much duplicated control-plane guidance, one dangling skill reference, no explicit manual-fallback status block for the Codex prompt template, and no bounded `projects-tasks` context entry for the next operating-layer planning wave.

## Changes

- `docs/CODEX_SKILL_ROUTING.md`
  - Marked this as the canonical routing file.
  - Kept GitHub Issues/Actions as the default implementation route and local Codex CLI as manual fallback only in the documented cases.
  - Replaced the dangling `frontend-ui-engineering` reference with the real repo-local UI guide `docs/agent/UI_AGENT_GUIDE.md` plus category-based frontend/browser routing.
  - Compressed the avoid-by-default section from a long marketplace list into stable categories so the file stays readable.
- `docs/agent/CODEX_PROMPT_TEMPLATE.md`
  - Added the required manual-fallback status block.
  - Pointed tool routing at `docs/CODEX_SKILL_ROUTING.md` and validation selection at `docs/agent/VALIDATION_MATRIX.md` instead of duplicating routing doctrine.
  - Added a compact hard-invariants block derived from `AGENTS.md` sections 2 and 8, explicitly separated from `docs/ENGINEERING_INVARIANTS.md`.
  - Clarified that `docs/LIFE_OS_WIKI.md` and `EXTRA_INFO_AND_RULES.md` are planning-only background references.
- `docs/agent/CONTEXT_INDEX.md` and `docs/agent/REPO_MAP.json`
  - Added the `projects-tasks` area.
  - Reinforced that background-reference docs do not belong in normal implementation context.
- `docs/LIFE_OS_WIKI.md` and `EXTRA_INFO_AND_RULES.md`
  - Normalized the non-authority banner so both real background docs state the full authority chain and their planning-only role.

## Decisions

- The right fix for `#207` was not to create a new repo-local skill just to satisfy a name in one doc. The real repo-local guidance already exists in `docs/agent/UI_AGENT_GUIDE.md`, so the routing file should point there.
- The routing doc should name stable tool categories where possible instead of depending on every specific marketplace/plugin label continuing to exist.
- The prompt template should stay short and route back to canonical files. If it grows into a second routing manual, the context-diet effort fails.

## Validation

- `pnpm agent:context projects-tasks`
- `git diff --check`
- `pnpm format:check` remains noisy repo-wide and is not a reliable patch-only signal in the current checkout

## Risks and limitations

- `projects-tasks` starts as a bounded planning context entry. The forward-looking guardrail content still lands in the next grouping.
- Background-doc banners are guidance, not a mechanical enforcement layer; agents can still ignore them if they ignore the authority chain.

## Rollback

- Revert the routing, prompt-template, context-index, and background-banner docs in this branch. No runtime code, workflows, or automation permissions changed.
