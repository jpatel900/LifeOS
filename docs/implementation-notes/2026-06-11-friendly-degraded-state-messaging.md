# Friendly Degraded-State Messaging

- Task name: `#166 UI Pass 7 13 Add friendly degraded-state messaging`
- Branch: `pass-7-issue-200-hardening`

## Original scope

Add a shared degraded-state wording contract and align common user-facing degraded copy with that contract.

## Assumptions

- This issue should establish the shared rule and make only narrow runtime alignments where the current copy is obviously incomplete.
- Route-by-route degraded-state cleanup still belongs to the later route issues, especially `#178`.

## Decisions

- Added `docs/agent/UI_DEGRADED_STATE_COPY.md` as the compact shared rule for degraded and blocked wording.
- Aligned the Home degraded account-data copy so it now states the next move instead of stopping after a calm warning.
- Aligned the shared Capture AI-unavailable detail so it now states the still-working fallback plus the optional setup next step.

## Deviations

- This was not a docs-only issue. I made two narrow runtime copy alignments because leaving the shared rule unmodeled in shipped text would have been weak governance.
- I did not broaden into route-specific redesign or multi-surface copy rewrites.

## Tradeoffs

- The new shared copy rule is intentionally compact and reusable instead of becoming a giant style guide.
- The Home degraded alert now names `Health` as the trust-repair destination. That is the right direction and matches the larger Pass 7 architecture.

## Files changed and why

- `docs/agent/UI_DEGRADED_STATE_COPY.md`
  - Added the canonical degraded-state copy contract and anti-patterns.
- `docs/agent/UI_AGENT_GUIDE.md`
  - Routed future UI work to the degraded-state copy rule when wording changes are in scope.
- `apps/web/src/app/page.tsx`
  - Added the next-step clause to the Home degraded account-data message and details text.
- `apps/web/src/lib/statusVocabulary.ts`
  - Added the optional next setup step to the shared AI-unavailable detail string used by Capture.
- `apps/web/src/__tests__/page.test.tsx`
  - Updated degraded Home expectations.
- `apps/web/src/__tests__/capture.test.tsx`
  - Updated AI-unavailable detail expectations.
- `apps/web/src/__tests__/sourceOfTruth.test.ts`
  - Added static proof that the degraded-state copy rule is wired into the UI control surface.
- `docs/PROJECT_STATE.md`
  - Recorded the new shared degraded-state copy rule and current expectation.
- `docs/agent/UI_PASS_7_GITHUB_UPDATES.md`
  - Added the exact GitHub comment draft for `#166`.

## Validation commands and results

- `pnpm --filter @lifeos/web test -- src/__tests__/diagnosticsDisclosure.test.tsx src/__tests__/page.test.tsx src/__tests__/capture.test.tsx src/__tests__/healthPage.test.tsx src/__tests__/sourceOfTruth.test.ts`
  - passed

## Risks

- Route-specific degraded-state copy outside Home and Capture still needs later cleanup.
- The shared rule can prevent drift, but it does not replace route-by-route judgment.

## Rollback notes

- Revert the shared degraded-state doc, the narrow Home and status vocabulary copy changes, the associated tests, the GitHub draft block, and this note together.
