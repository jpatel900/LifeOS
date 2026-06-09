# UI Agent Context Route Update

- Task name: `#152 Docs Hygiene 06 Update UI agent context route`
- Branch: `pass-7-issue-200-hardening`

## Original scope

Update the UI context route so future agents load the smallest useful live context for UI work instead of defaulting to stale notes or oversized read sets.

## Assumptions

- The current `ui` route is stale because it still points to an old implementation note before the new Pass 7 control-plane docs.
- A small dedicated UI agent guide is justified here because it is routing guidance, not the later full review guide from `#156`.
- The route should prefer active roadmap plus current proof surfaces, and treat historical notes as opt-in only.

## Decisions

- Added `docs/agent/UI_AGENT_GUIDE.md` as the compact UI context-routing guide.
- Updated `docs/agent/CONTEXT_INDEX.md` so the `ui` path now routes through the roadmap, UI agent guide, Pass 7 execution map, `PROJECT_STATE` only when needed, route source, and focused tests.
- Updated `docs/agent/REPO_MAP.json` so `pnpm agent:context ui` reflects the same live context order and no longer defaults to an older implementation note.

## Deviations

- I did not build the full UI review guide yet. That remains `#156`.
- I did not change UI code, tests, or route behavior. This is routing guidance only.

## Tradeoffs

- There is one more agent doc than before, but it replaces stale implicit routing with an explicit small-entry guide.
- The guide intentionally avoids deep route-level review criteria so it does not pre-empt `#156`.

## Files changed and why

- `docs/agent/UI_AGENT_GUIDE.md`
  - Added the compact UI context-routing guide.
- `docs/agent/CONTEXT_INDEX.md`
  - Updated the UI route ordering and escalation path.
- `docs/agent/REPO_MAP.json`
  - Updated `pnpm agent:context ui` output to match the new routing guidance.
- `docs/agent/UI_PASS_7_GITHUB_UPDATES.md`
  - Added the exact GitHub comment text for `#152`.
- `docs/implementation-notes/2026-06-08-ui-agent-context-route-update.md`
  - Preserved the scope and proof for this routing change.

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

- The new guide must stay small; if it starts absorbing review logic or historical detail, it will become another context-sprawl problem.
- `#156` still needs to add the actual review guide layer on top of this routing baseline.

## Deferred items

- Add or update the UI agent review guide in `#156`.
- Add duplicate-active-plan guardrails in `#153`.

## Rollback notes

- Revert the UI guide, context-index changes, repo-map changes, and this note together.
- Do not restore the old `ui` route that points to a stale implementation note by default.
