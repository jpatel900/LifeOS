# Verified-Medium Automation Lane

This document is policy-only. It does not enable a workflow, label, or merge behavior by itself.

## Goal

Define the narrow T2 surfaces that could eventually move into a reduced-human-friction lane after stronger scenario, evidence, and review gates exist.

## Eligible surfaces

Only consider these for a future verified-medium lane:

- plain-language UI copy improvements
- deterministic empty/loading/error state clarity
- route smoke coverage
- non-risky regression tests that preserve or strengthen assertions
- health display copy without scoring logic changes

## Ineligible surfaces

These remain outside the verified-medium lane:

- workflow data layer changes
- auth, RLS, Supabase, or migrations
- AI parser contracts or schema changes
- Google Calendar write behavior
- observability or privacy behavior
- workflow permissions or control-plane broadening
- package or dependency changes
- app behavior that changes persistence or external writes

## Required proof gates

Any future verified-medium candidate should require all of the following:

- linked scenario pack
- acceptance-criteria coverage map
- CI pass
- Codex baseline review with no blockers
- no escalated high-risk trigger
- Playwright or equivalent browser proof when UI is touched
- changed-file and changed-line limits
- forbidden-path guard pass

## Rollout stages

Use this order only:

1. Policy only
2. Dry-run labels
3. PR comments only
4. Optional auto-merge trial for tightly bounded paths

Do not skip stages.

## Merge boundary

Even in a future verified-medium lane, T3/T4 surfaces remain manual-decision territory. Verified-medium is not permission to weaken review for parser, auth, calendar, privacy, deployment, or workflow-control changes.
