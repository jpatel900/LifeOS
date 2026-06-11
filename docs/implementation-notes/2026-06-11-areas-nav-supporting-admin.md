# Areas Nav Supporting/Admin Role

- Task name: `#169 UI Pass 7 16 Update Areas nav role`
- Branch: `pass-7-issue-200-hardening`

## Original scope

Make `Areas` read as supporting/admin in shell navigation rather than as part of the primary daily workflow loop.

## Assumptions

- This is a shell hierarchy issue, not an Areas route redesign.
- The change should preserve easy access to `Areas` while making its role visibly secondary to Capture, Triage, Planning, Execute, Review, and Health.

## Decisions

- Removed `Areas` from the primary shell nav list.
- Added a separate supporting nav affordance labeled `Areas admin`.
- Added focused route and Playwright guards so later shell changes cannot quietly move `Areas` back into the primary loop.

## Deviations

- I iterated the supporting affordance once after visual inspection. The first version used a separate `Admin` pill row and added too much shell bulk on mobile.
- The final version collapses that into one quieter link so the role shift is clear without wasting another full row.

## Tradeoffs

- `Areas admin` is deliberately explicit. It sacrifices some elegance for honest hierarchy, which is correct at this stage of Pass 7.
- Mobile shell clutter is still not ideal. This issue fixes role, not the broader mobile calm pass that belongs to `#170`.

## Files changed and why

- `apps/web/src/app/components/AppShell.tsx`
  - Split `Areas` out of primary nav and into a separate supporting nav affordance.
- `apps/web/src/__tests__/routeSmoke.test.tsx`
  - Added proof that `Areas` stays out of primary nav and becomes active in supporting nav only.
- `apps/web/src/__tests__/appShellAccent.test.tsx`
  - Preserved active-nav proof while accounting for the new supporting link.
- `apps/web/tests/e2e/shell-clutter.spec.ts`
  - Added browser-level proof that `Areas admin` lives outside the primary workflow loop on mobile without introducing horizontal overflow.
- `docs/PROJECT_STATE.md`
  - Recorded the new shell hierarchy rule for `Areas`.
- `docs/agent/UI_PASS_7_GITHUB_UPDATES.md`
  - Added the exact GitHub comment draft for `#169`.

## Validation commands and results

- `pnpm --filter @lifeos/web test -- src/__tests__/routeSmoke.test.tsx src/__tests__/appShellAccent.test.tsx`
  - passed
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/shell-clutter.spec.ts`
  - passed

## Screenshot evidence

- `apps/web/test-results/pass-7/169-areas-nav-role/mobile-triage-shell.png`
- `apps/web/test-results/pass-7/169-areas-nav-role/desktop-triage-shell.png`
- `apps/web/test-results/pass-7/169-areas-nav-role/mobile-areas-shell.png`
- `apps/web/test-results/pass-7/169-areas-nav-role/desktop-areas-shell.png`

Review note:
- The shell now treats `Areas` as reachable admin/support work instead of part of the main workflow loop.
- What stayed unchanged: current-area selection remains visible, route access is preserved, quiet-shell rules are unchanged, and no workflow or persistence behavior changed.
- What still remains noisy: mobile shell chrome still stacks too many elements before route content on non-quiet routes; that belongs to `#170`.

## Risks

- The explicit `Areas admin` label may need later copy refinement once the broader mobile shell pass lands.
- This issue intentionally does not solve the larger non-quiet-route mobile clutter problem.

## Rollback notes

- Revert the `AppShell` nav split, the focused tests, the screenshot evidence note, the GitHub draft block, and this note together.
