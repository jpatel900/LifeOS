# Mobile Nav Calm

- Task name: `#170 UI Pass 7 17 Make mobile navigation calmer and less crowded`
- Branch: `pass-7-issue-200-hardening`

## Original scope

Reduce mobile shell-nav crowding without removing route access or broadening into a full shell-behavior rewrite.

## Assumptions

- The wrapped multi-row primary nav was the clearest mobile clutter problem after `#169`.
- `#171` still owns the broader shell-versus-route hierarchy question, so this issue should focus on navigation shape rather than all shell controls.

## Decisions

- Forced the primary nav into a single horizontal scroll lane on mobile.
- Kept route access intact by allowing horizontal overflow inside the nav itself rather than vertical wrap across the header.
- Added Playwright proof that the mobile primary nav stays single-row on non-quiet routes.

## Deviations

- I did not demote or redesign the quick-note controls here. That remains part of the later shell-behavior pass.
- The supporting `Areas admin` affordance from `#169` stays on its own quieter row for now.

## Tradeoffs

- Horizontal scrolling is a better compromise than wrapped nav rows at this stage. It keeps the header shorter and the route closer to the first viewport.
- The shell is calmer, but not yet minimal. Non-quiet mobile routes still have too much chrome before route content, which is the next issue's problem.

## Files changed and why

- `apps/web/src/app/components/AppShell.tsx`
  - Made the primary workflow nav a single horizontal lane and prevented chip shrink-wrap from collapsing route access.
- `apps/web/tests/e2e/shell-clutter.spec.ts`
  - Added single-row mobile-nav assertions on non-quiet routes.
- `docs/PROJECT_STATE.md`
  - Recorded the mobile single-lane nav rule.
- `docs/agent/UI_PASS_7_GITHUB_UPDATES.md`
  - Added the exact GitHub comment draft for `#170`.

## Validation commands and results

- `pnpm --filter @lifeos/web test -- src/__tests__/routeSmoke.test.tsx src/__tests__/appShellAccent.test.tsx`
  - passed
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/shell-clutter.spec.ts`
  - passed

## Screenshot evidence

- `apps/web/test-results/pass-7/170-mobile-nav-calm/mobile-triage-shell.png`
- `apps/web/test-results/pass-7/170-mobile-nav-calm/mobile-areas-shell.png`
- `apps/web/test-results/pass-7/170-mobile-nav-calm/desktop-triage-shell.png`

Review note:

- The primary workflow nav now stays in one lane on mobile, which shortens the shell before route content.
- What stayed unchanged: route destinations, active-state logic, supporting `Areas admin` role, quiet-shell rules, and quick-note behavior.
- What still remains noisy: quick-note controls and supporting rows still consume too much height on non-quiet routes; that belongs to `#171`.

## Risks

- Some users may need to horizontally scroll to reach `Health` on mobile. That is acceptable here because it is still better than multi-row wrap clutter.
- If later shell work adds more primary links without further structure changes, the lane could become too long again.

## Rollback notes

- Revert the single-lane nav change, the Playwright row assertion, the screenshot evidence note, the GitHub draft block, and this note together.
