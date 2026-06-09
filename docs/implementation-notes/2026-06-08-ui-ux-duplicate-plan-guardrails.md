# UI/UX Duplicate Plan Guardrails

- Task name: `#153 Docs Hygiene 07 Add duplicate active plan guardrails`
- Branch: `pass-7-issue-200-hardening`

## Original scope

Add explicit guardrails so future agents do not create duplicate active UI/UX plans instead of amending or retiring the current roadmap.

## Assumptions

- The problem is not missing documents. The problem is agents rationalizing a new active plan because a temporary note or fresh pass feels easier than updating the roadmap.
- The guardrail has to live in high-visibility docs, not just in a one-off implementation note.

## Decisions

- Added the one-active-plan rule to `AGENTS.md` so the highest-authority agent doc now states the UI/UX roadmap must be amended or explicitly retired before a new competing plan appears.
- Added a duplicate-plan guardrail section to `docs/UI_UX_WORLD_CLASS_ROADMAP.md`.
- Added matching operational guidance to `docs/agent/UI_AGENT_GUIDE.md`.

## Deviations

- I did not add new automation, scripts, or CI checks. This issue is guidance only.
- I did not create another governance doc for this rule. The point is to reduce surfaces, not add one more.

## Tradeoffs

- This relies on doc compliance rather than automatic enforcement.
- Putting the rule in three visible places is mildly repetitive, but that is cheaper than reopening the multi-roadmap failure mode.

## Files changed and why

- `AGENTS.md`
  - Added the single-active-UI-plan guardrail to the context-budget rules.
- `docs/UI_UX_WORLD_CLASS_ROADMAP.md`
  - Added the duplicate-plan guardrail section to the active roadmap itself.
- `docs/agent/UI_AGENT_GUIDE.md`
  - Added operational routing guidance that tells future agents to amend or retire the roadmap before creating any replacement.
- `docs/agent/UI_PASS_7_GITHUB_UPDATES.md`
  - Added the exact GitHub comment text for `#153`.
- `docs/implementation-notes/2026-06-08-ui-ux-duplicate-plan-guardrails.md`
  - Preserved the scope and proof for this guardrail pass.

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

- This is still a documentation guardrail, not a technical blocker.
- If future agents ignore `AGENTS.md`, they can still create drift, but the repo now makes the correct rule very explicit.

## Deferred items

- Add the UI review guide in `#156`.
- Carry the same single-active-plan discipline into later closeout work under `#199`.

## Rollback notes

- Revert the AGENTS, roadmap, UI agent guide, and this note together.
- Do not remove the guardrail from only one of the three surfaces or the rule will immediately become ambiguous again.
