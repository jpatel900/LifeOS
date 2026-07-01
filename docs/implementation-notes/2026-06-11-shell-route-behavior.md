# Shell Route Behavior

- Task name: `#171 UI Pass 7 18 Shell route behavior`
- Status: complete with focused browser proof and screenshot evidence

## Original scope

Keep global shell controls secondary to route-local work so primary workflow routes regain a cleaner first viewport without changing route contracts.

## Decisions

- Collapsed the shell quick-note composer behind an explicit `Quick note` toggle on non-Capture, non-Home routes.
- Kept quick note behavior available, but removed the always-visible input and save button from the shell's default resting state.
- Preserved Home and Capture rules that keep shell quick-note controls fully hidden.

## What changed

- `apps/web/src/app/components/AppShell.tsx`
  - Added a closed-by-default quick-note composer state.
  - Moved quick-note guidance and save action inside the optional composer panel.
  - Kept success feedback visible after save while returning the shell to a quieter resting state.
- `apps/web/src/__tests__/routeSmoke.test.tsx`
  - Updated shell quick-note regression coverage to open the composer explicitly before save feedback assertions.
- `apps/web/tests/e2e/shell-clutter.spec.ts`
  - Updated mobile shell assertions so triage proves the quick-note composer stays collapsed until opened.
- `apps/web/tests/e2e/p0-ux-regression.spec.ts`
  - Updated the shell quick-note end-to-end regression to reflect the collapsed composer flow.

## Validation commands and results

- `pnpm --filter @lifeos/web test -- src/__tests__/routeSmoke.test.tsx src/__tests__/appShellAccent.test.tsx`
  - passed
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/shell-clutter.spec.ts tests/e2e/p0-ux-regression.spec.ts`
  - passed
- `git diff --check`
  - passed with existing CRLF warnings only
- `pnpm lint`
  - passed
- `pnpm type-check`
  - failed once on the known `.next/types` churn, then passed immediately after `pnpm build`
- `pnpm test`
  - passed
- `pnpm build`
  - passed

## Screenshot evidence

- `apps/web/test-results/pass-7/171-shell-route-behavior/2026-06-11-171-triage-mobile-rest.png`
- `apps/web/test-results/pass-7/171-shell-route-behavior/2026-06-11-171-triage-desktop-rest.png`

Review note:

- Route and state shown: `/triage` at rest on mobile and desktop.
- Primary action stays route-local: the triage heading and current work surface land ahead of any shell input.
- Safety truth still visible: quick note remains device-local and secondary when opened.
- What moved lower: the shell quick-note input and save action now stay hidden until the user explicitly opens them.
- Unchanged: Home and Capture still suppress shell quick-note controls entirely, and Areas remains in supporting admin nav.

## Risks

- The shell is quieter by default, but quick note success feedback is still shell-level support content and could be simplified further if later evidence shows it still competes with the route.
- The extra non-quiet shell context band is unchanged in this slice. If first-viewport clutter is still too high after screenshot review, that should be handled deliberately rather than folded into this change blindly.

## Rollback notes

- Revert the quick-note toggle behavior in `AppShell`, the updated route smoke coverage, and the two Playwright regression updates together.
