# UI/UX Roadmap Reopen For Clarity And Diagnostic Staging

- Task name: `#154 UI Pass 7 01 Reopen roadmap for clarity and diagnostic staging`
- Branch: `pass-7-issue-200-hardening`

## Original scope

Reopen the active UI/UX roadmap so it clearly reads as an active Pass 7 clarity-and-diagnostics program rather than a maintenance-only UX artifact.

## Assumptions

- The roadmap already names Pass 7 as active, but large parts of the surrounding language still imply the remaining work is mostly maintenance.
- The smallest safe fix is to update the active-gap language and route-level remaining-gap language, not to rewrite the full historical proof sections.

## Decisions

- Added a `Pass 7 reopen note` near the top of the roadmap that explicitly states the program is active for clarity, diagnostic staging, route restraint, mobile-first hierarchy, and proof-based final audit work.
- Rewrote the `Current gap` column in the outcome table so it no longer frames the remaining work as maintenance-only.
- Rewrote the route scorecard `Main remaining gap` column so each primary route names active Pass 7 work rather than passive maintenance posture.
- Updated `docs/PROJECT_STATE.md` to reflect that the roadmap was reopened explicitly for clarity and diagnostic staging.

## Deviations

- I did not add the information-hierarchy doctrine yet. That remains `#155`.
- I did not change route source, tests, or runtime behavior. This is roadmap framing and handoff truth only.

## Tradeoffs

- The roadmap is slightly more explicit and repetitive near the top, but it now matches the real program posture.
- Earlier passes remain marked `done`, which is correct, but the new reopen note prevents those rows from being misread as “the UI is only in maintenance now.”

## Files changed and why

- `docs/UI_UX_WORLD_CLASS_ROADMAP.md`
  - Added the reopen note and changed outcome-gap and route-gap language to active Pass 7 framing.
- `docs/PROJECT_STATE.md`
  - Added a concise recently-completed bullet reflecting the reopened roadmap posture.
- `docs/agent/UI_PASS_7_GITHUB_UPDATES.md`
  - Added the exact GitHub comment text for `#154`.
- `docs/implementation-notes/2026-06-08-ui-ux-roadmap-reopen-clarity-staging.md`
  - Preserved the scope and proof for this roadmap framing pass.

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

- If later passes do not follow through, the roadmap will now be more ambitious than the implementation state.
- The reopen note fixes posture, but the concrete doctrine for staging user, safety, diagnostic, and developer truth still remains `#155`.

## Deferred items

- Add the UX information-hierarchy doctrine in `#155`.
- Add or update the UI review guide in `#156`.

## Rollback notes

- Revert the roadmap, `PROJECT_STATE`, and this note together.
- Do not keep the reopened wording without the matching `PROJECT_STATE` summary bullet.
