# Agent Automation Policy

This file defines the required human gate for agent-driven repo changes and GitHub automation in LifeOS.

LifeOS product/runtime automation remains tightly restricted by `AGENTS.md` and product authority docs.
Engineering automations may write only to isolated branches and approved GitHub metadata surfaces such as pull requests or issue comments. They must be label-gated, path-guarded, validation-gated, and must not touch production data, secrets, non-GitHub external systems (sole exception: owner-configured notify-only channels — see the instant self-merge section), or LifeOS runtime state.
Safe auto-merge also requires the repository-level GitHub auto-merge setting to be enabled. Without that repo setting, the workflow remains a guard/evaluator and cannot successfully arm auto-merge.

If a task spans multiple categories, apply the highest tier.
If classification is unclear, choose the stricter tier.
CI and validation requirements from `AGENTS.md` still apply. This policy adds human-gate rules; it does not create exceptions.

## T0 — Fully automatable after CI

Docs-only and issue-template changes need no extra human review once required checks pass. The deterministic safe auto-merge allowlist is the T0 row of the matrix below (`.agents/skills/**` owner-approved 2026-07-03); it must stay exactly there unless separately approved.

Second T0 route (ADR 0008 move 1b, owner-ratified 2026-08-04): strictly-additive test-only PRs under `automerge:tests-additive` + `risk:low`. Machine-checked, not claimed: every changed file must match the test-path allowlist in `scripts/agent/automation-policy.mjs` and the diff must contain zero deleted lines (renames, deletions, and binary changes disqualify). CI still gates the merge, and the Main Red Guard demotion applies to this class on any incident.

## Instant self-merge with owner notification (ADR 0008 move 2, amended 2026-08-05)

A `risk:low`, non-T2+ agent PR may opt in with the `selfmerge:auto` label (`selfmerge:30m` remains an alias). On labeling, the workflow sends a 1-2 line Telegram notice to the owner and posts a marker comment, then arms GitHub auto-merge IMMEDIATELY — the required CI checks are the only wait, and the check runtime is the owner's veto window (add `needs:human-decision`, request changes, or close the PR before checks pass). Guards still required at arm time: main green, no open guard-revert PR, no blocking label, no changes-requested review, no T2+ path, no merge conflicts. Owner decision recorded plainly: NO delivery fallback was chosen — if the Telegram send fails or its secrets are absent, the merge proceeds with no notice; compensating controls are the low-risk scope, the Main Red Guard, and class demotion (`SELFMERGE_WINDOW.enabled: false`, one-line PR).

Notification-channel carve-out (same amendment): the ban on automations touching non-GitHub systems has exactly one exception — notify-only messages to the owner's own configured channel (Telegram via `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` secrets). Nothing may be read from, or written to, any other external surface.

## Main Red Guard — notify and hold (owner decision 2026-08-05)

Detection is unchanged: CI failing on a push to `main` re-runs the failed jobs once, and only a reproduced failure (attempt 2+) fires the guard. What changed is what happens next. **The guard never arms auto-merge on its own revert PRs.** Owner decision recorded verbatim: "notify and hold + automatic stand-down + a diagnosis step".

- **Hold.** The revert PR still opens on double-red main, and its body says plainly: this revert is HELD, nothing merges until a human adds `revert:confirm`, and closing the PR cancels the revert.
- **Diagnose.** `scripts/agent/red-guard-diagnose.mjs` reads every attempt of the failed run, quotes the failing spec lines back, and classifies in plain language: the same test failing the same way on every attempt means the change or a real race is suspect; the same test failing in different ways, or different tests failing per attempt, means a flaky tier or the environment is suspect and a revert probably will not fix it. Fewer than two readable attempts degrades to "diagnosis unavailable: `<reason>`" rather than a confident guess. The read is posted on the PR and compressed to a 1-2 line Telegram notice under the carve-out above; if the send fails the guard proceeds without a notice and says so in the PR comment.
- **Confirm to arm.** Adding `revert:confirm` to an open guard revert PR arms auto-merge — unless `revert:wont-fix` is present, which gets an explaining comment instead.
- **Stand down.** When the revert PR's own CI completes, if a job with the same name as the one that reddened main also failed here, the revert cannot fix main: the guard adds `revert:wont-fix`, comments that a forward fix is indicated, and disarms auto-merge if a human had already confirmed.

Why: on 2026-08-05 the guard auto-armed PR #841 against five commits (an app re-land plus four docs-only commits) over what the evidence showed was tier nondeterminism — the same new spec failing two different ways across attempts. Only the revert's own coincidentally-red CI stopped it from landing.

## T1 — Agent PR allowed, human review recommended

Isolated UI copy and bounded route-smoke coverage (paths: T1 row below).

## T2 — Agent implementation allowed, human review required

A human reviews before merge or rollout: workflow and automation control-plane files, assertion-affecting test changes (modifying or deleting existing assertions), cross-flow UX, parser UI, health behavior, observability display, and workflow data-layer changes. Strictly-additive test-only PRs are the exception: per ADR 0008 move 1b they may ride the auto-merge lane under `automerge:tests-additive` (`scripts/agent/check-safe-automerge.mjs` machine-checks that every file is a test path and the diff deletes zero lines). Paths: T2 row below, plus `apps/web/src/__tests__/**`, `apps/web/tests/e2e/**` when behavior assertions materially change, and `apps/web/src/lib/observability/**` for UI-facing observability behavior.

## T3 — Planning or implementation only with explicit human approval

Start with planning/review only. Do not implement beyond bounded analysis unless a human explicitly approves the exact surface; after approval, keep implementation bounded to that surface. Covers Supabase schema, migrations, RLS, auth, OAuth, Google Calendar writes, AI parser contracts, observability privacy, secrets/env, and production deployment (paths: T3 row below). Planning may comment on the issue but creates no branches, commits, or implementation PRs.

## T4 — Human decision before any implementation

Stop at planning/review, tradeoffs, or requirements clarification until a human decides. Implementation proceeds only after explicit human approval and any resulting requirements or policy update. Covers new vendors, new external write capabilities, background jobs, autonomous scheduling, broad architecture changes, and scope expansion beyond requirements.

## Hands-off path matrix

Use this as the deterministic routing summary before opening or merging an automation-driven PR.

| Tier | Hands-off status                                                  | Allowed path examples                                                                                                                                                                 | Notes                                                                                                                                                                                                                                                                                                                                   |
| ---- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T0   | Safe auto-merge allowed after CI and review gates                 | `docs/**`, `README.md`, `.github/ISSUE_TEMPLATE/**`, `.agents/skills/**`                                                                                                              | Requires `agent:ready`, `risk:low`, and `automerge:safe`. The safe auto-merge allowlist must stay exactly here unless separately approved. Per ADR 0008 move 1a (owner-ratified 2026-08-04), agents may apply these labels themselves to `docs/program/**` program-state PRs — status updates ride this lane by standing authorization. |
| T1   | Agent may open PR; human review recommended                       | Narrow `apps/web/src/app/**` copy-only edits, bounded route-smoke coverage                                                                                                            | Not auto-merge eligible. Use when the blast radius is still low but not purely documentation metadata.                                                                                                                                                                                                                                  |
| T2   | Agent may open PR; human review required                          | `.github/workflows/**`, `.github/codex/prompts/**`, `scripts/agent/**`, meaningful test assertion changes                                                                             | Control-plane and assertion-bearing work stays out of hands-off merge lanes.                                                                                                                                                                                                                                                            |
| T3   | Planning first; implementation only after explicit human approval | `supabase/**`, `**/migrations/**`, `apps/web/src/lib/supabase/**`, `apps/web/src/lib/ai/**`, `apps/web/src/lib/googleCalendar/**`, `apps/web/src/app/api/google-calendar/**`, `.env*` | Sensitive auth, persistence, parser, calendar, secrets, and deployment-adjacent surfaces.                                                                                                                                                                                                                                               |
| T4   | Human decision before any implementation                          | New vendor/service surfaces, new background automation surfaces, scope-expansion surfaces                                                                                             | Requires an explicit human decision and usually requirements/policy updates first.                                                                                                                                                                                                                                                      |

## Guardrail references

- Safe auto-merge evaluator and revocation guard: `.github/workflows/safe-automerge.yml` and `scripts/agent/check-safe-automerge.mjs`
- Shared automation path policy: `scripts/agent/automation-policy.mjs`
- Shared automation path guard: `scripts/agent/check-automation-scope.mjs`
- PR risk classification: `scripts/agent/classify-pr-risk.mjs`
- Main Red Guard hold, diagnosis, and stand-down: `.github/workflows/main-red-guard.yml` and `scripts/agent/red-guard-diagnose.mjs`
- PR evidence guidance: `AGENTS.md` "Delivering work" (evidence or UNVERIFIED; OWNER-GATE/AGENT-TODO markers)
- Decision review guidance: `docs/adr/` (architecture decisions) and `AGENTS.md` "Owner gates"
