# Plan single-task scheduling repair

Date: 2026-07-01
Branch: `fix/plan-single-task-scheduling`
PR: https://github.com/jpatel900/LifeOS/pull/227

## Scope

Repair the cockpit Plan flow after the merged handoff work exposed a no-op in the common single-task path. This did not change Google Calendar, AI parsing, environment-variable behavior, schemas, migrations, RLS policies, or external-write logic.

## Root Cause

After `Capture -> Do today -> Plan`, the cockpit often has exactly one ready task. The Plan hour rail looked actionable, but `onPlan` required `selectedTaskId` to be set first. In the one-task case there was no separate user-visible reason to select the task, so tapping `Drop here` did nothing and the user could not naturally progress to Execute.

## Change

- `apps/web/src/app/components/LifeOSCockpit.tsx` now defaults the Plan rail to the only ready task when no task is explicitly selected.
- Multi-task Plan still requires explicit task selection and now says `Select a task first`.
- `apps/web/tests/e2e/cockpit-flow-repair.spec.ts` adds a regression for `Capture -> Do today -> Plan -> Drop here -> Start focusing`.
- `docs/PROJECT_STATE.md` records the shipped workflow repair.

## Verification

Local validation on the clean branch:

- `pnpm --filter @lifeos/web type-check`
- `pnpm --filter @lifeos/web test -- workflow.test cockpitViewModel WorkflowContext.areas routeSmoke`
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/cockpit-flow-repair.spec.ts`
- `pnpm --filter @lifeos/web lint`
- `pnpm --filter @lifeos/web test`
- `pnpm --filter @lifeos/web build`
- `pnpm --filter @lifeos/web test:e2e`

Remote validation on PR #227:

- GitHub `Monorepo Validation`: passed
- GitHub `Playwright E2E`: passed
- GitHub `Migrations + RLS Verification`: passed
- Vercel preview: passed

## Known Limitations

- `pnpm format:check` still fails across 184 pre-existing files, including `.agents/skills/impeccable/**` and many unrelated repo files. It was not fixed in this branch because formatting the whole repo would create unrelated churn.
- PR #226 was closed as superseded because it was created from the old merged `ui/handoff-cockpit-pass` branch and remained conflict-heavy.

## Rollback

Revert commit `ed2981a` from `fix/plan-single-task-scheduling`. That returns Plan to the previous explicit-selection-only behavior and removes the regression note/test.
