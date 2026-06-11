# Area Display Pass

- Task name: `#172 UI Pass 7 19 Area display pass`
- Status: complete with focused browser proof and screenshot evidence

## Original scope

Reduce repeated area display in the first viewport while preserving area visibility and route trust.

## Decisions

- Removed the extra shell-level area spotlight from the non-quiet context header instead of editing every route card individually.
- Kept one persistent shell area anchor through the existing area selector row.
- Shortened the shell row label from `Current area` to `Area` so the shell stops repeating the same phrase when route-local area context is also present.

## What changed

- `apps/web/src/app/components/AppShell.tsx`
  - Moved the stable `Current area context` anchor onto the shell status row.
  - Removed the extra area spotlight from the non-quiet shell context header.
  - Kept area visibility through the selector row while reducing repeated first-viewport wording.
- `apps/web/tests/e2e/shell-clutter.spec.ts`
  - Added focused proof that the non-quiet shell context header no longer repeats `Current area`.
  - Captures mobile and desktop screenshot evidence for the quieter first-viewport state.

## Validation commands and results

- `pnpm --filter @lifeos/web test -- src/__tests__/routeSmoke.test.tsx src/__tests__/appShellAccent.test.tsx`
  - passed
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/shell-clutter.spec.ts tests/e2e/app-shell-accent.spec.ts`
  - passed

## Screenshot evidence

- `apps/web/test-results/pass-7/172-area-display-pass/2026-06-11-172-triage-mobile-rest.png`
- `apps/web/test-results/pass-7/172-area-display-pass/2026-06-11-172-triage-desktop-rest.png`

Review note:
- Route and state shown: `/triage` at rest on mobile and desktop.
- Primary action stays route-local: the route heading and task surface remain the first-scanning destination.
- Area stays visible through the persistent shell area control.
- What moved out: the duplicate shell context-header area spotlight no longer competes with the route.
- Unchanged: area accent behavior, area selection, quiet-route rules, and supporting `Areas admin` navigation.

## Risks

- Some routes still surface area context locally in their own cards, so this pass reduces repetition at the shell layer only. If later first-viewport review still feels noisy, route-level area copy should be handled per route rather than by re-inflating the shell.

## Rollback notes

- Revert the AppShell area-spotlight removal, the shell row label change, and the new shell clutter assertions together.
