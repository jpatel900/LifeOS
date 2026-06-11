# UI Screenshot Evidence Workflow

Status: Active Pass 7 proof workflow for route-level screenshots
Purpose: Define which screenshots to capture, where to keep them during work, and which review notes must accompany them
Read when: Collecting UI proof for shell, hierarchy, degraded-state, route-identity, or visual-system issues
Do not use for: Final audit scoring by itself or as permission to skip tests and rendered-behavior proof
Superseded by: n/a during Pass 7; `#197` may extend this into the final audit packet format

## When screenshots are required

Capture screenshots when a change affects:

- first-scan hierarchy
- shell or nav burden
- degraded or blocked user-facing states
- route identity or support-surface staging
- visual-system structure that changes how the route reads at rest

If the issue changes only docs or tests, screenshots are not required unless the issue explicitly asks for browser proof.

## Minimum required images

For each changed route or shared shell surface:

- one mobile screenshot at `390px` width showing the first viewport at rest
- one desktop screenshot showing the same route at rest

Add more only when the state is materially different:

- blocked
- degraded
- approval-gated
- before/after shell state that changes the conclusion

Do not create screenshot spam. The goal is proof, not an art dump.

## Local storage location

During implementation, keep screenshots in the ignored Playwright/manual proof area:

- `apps/web/test-results/`

Recommended subfolder naming:

- `apps/web/test-results/pass-7/<issue-or-batch-slug>/`

Example filenames:

- `2026-06-11-163-home-mobile-rest.png`
- `2026-06-11-163-home-desktop-rest.png`
- `2026-06-11-166-health-mobile-degraded.png`

Do not commit screenshot binaries to the repo by default. Keep the files locally, then reference the selected images in the issue comment, PR description, audit notes, or handoff.

## Review note required beside every screenshot set

Every screenshot set must be paired with a short note covering:

1. route and state shown
2. what the primary action is
3. what safety truth is visible
4. what moved into details or stayed secondary
5. what stayed intentionally unchanged

Keep the note short. One tight paragraph or five bullets is enough.

## Capture checklist

Before saving the images, verify:

- the route is at rest, not mid-animation or mid-scroll
- the relevant disclosure state is intentional
- the state matches the issue claim exactly
- the image proves hierarchy, not decoration
- tests and rendered behavior for the same state already passed or are queued immediately after

## Handoff reference format

When writing the issue comment, PR note, or implementation note, reference screenshot proof like this:

- `Mobile proof: apps/web/test-results/pass-7/163-home/2026-06-11-163-home-mobile-rest.png`
- `Desktop proof: apps/web/test-results/pass-7/163-home/2026-06-11-163-home-desktop-rest.png`
- `What got simpler: shell context no longer appears above the Home launchpad`
- `Unchanged: Home remains read-only`

If the final storage location changes outside the repo, keep the same note structure and replace the path with the actual attachment or review link.

## Final packet format

Issue `#197` extends this workflow into the final screenshot evidence packet used by the Pass 7 audit.

Use one compact packet note with these sections in this order:

1. `Routes covered`
2. `Mobile screenshots`
3. `Desktop screenshots`
4. `What got simpler`
5. `What moved into details`
6. `What stayed intentionally unchanged`
7. `Commands run`
8. `Remaining gaps`

Do not turn the packet into a narrative diary. It is an evidence index.

## Current Pass 7 packet index

`apps/web/test-results/` is refreshed by later Playwright runs, so the final packet must be generated immediately before the final audit.

Current required packet target:

- `apps/web/test-results/pass-7/final-audit/`

Generate it with:

- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/final-audit-packet.spec.ts`

The packet should contain:

- `app-shell-mobile-rest.png`
- `app-shell-desktop-rest.png`
- `home-mobile-rest.png`
- `home-desktop-rest.png`
- `capture-mobile-rest.png`
- `capture-desktop-rest.png`
- `triage-mobile-rest.png`
- `triage-desktop-rest.png`
- `planning-mobile-rest.png`
- `planning-desktop-rest.png`
- `execute-mobile-rest.png`
- `execute-desktop-rest.png`
- `review-mobile-rest.png`
- `review-desktop-rest.png`
- `health-mobile-rest.png`
- `health-desktop-rest.png`
- `areas-mobile-rest.png`
- `areas-desktop-rest.png`

## Boundaries

- Screenshots do not replace tests.
- Screenshots do not excuse docs drift.
- If the screenshot and the claim disagree, the screenshot wins until the docs are corrected.
- If the screenshot proves clutter or contradictory hierarchy, fix the route instead of rationalizing it away.
