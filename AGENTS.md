# AGENTS.md — LifeOS agent rules

## Mission

LifeOS is a private, one-user, low-cost AI-assisted workflow cockpit. It turns messy input into structured work, stages scheduling decisions for approval, learns by area, and monitors health. Keep it simple, maintainable, safe, and V1-scoped.

## Authority

`AGENTS.md` is the highest authority for Cursor/Codex agent behavior. Implementation truth lives in `docs/REQUIREMENTS.md`, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/ENGINEERING_INVARIANTS.md`, `docs/UX_FLOWS.md`, `docs/SECURITY_PRIVACY.md`, and `docs/TEST_PLAN.md`; ADRs in `docs/adr/` amend architecture. `EXTRA_INFO_AND_RULES.md` is background only.

## Hard invariants

- No external calendar write without explicit user approval; every calendar write records `external_write_events`.
- AI output must validate against strict schemas before persistence; raw captures must not be lost if AI fails.
- Area is a first-class scope object; learning is area-scoped unless explicitly global.
- Health scores are rule-based, not AI-invented; deterministic product logic stays in code/config, not prompts.
- AI may suggest policy changes; the user approves core policy changes.
- Do not build broad autonomous agent behavior in V1.
- Do not add background jobs, vendors, or hosted services unless requirements and docs justify them.
- No feature is done until required tests pass; never weaken schemas, guard tests, validators, or RLS to make tests pass.
- Every implementation task defines acceptance criteria before coding and stays within `docs/REQUIREMENTS.md` unless requirements are reviewed first.
- Errors must be sanitized, plain-language, and recovery-oriented.
- User-owned tables require `id`, `user_id`, timestamps where appropriate, RLS, policies, indexes, and export coverage.
- Persisted multi-table transitions go through one transactional server boundary, never sequenced client writes.

## V1 scope control

Build only the approved V1 cockpit: areas, capture, optional submit-based audio transcription, AI parsing into drafts, ambiguity/sense-making, triage, tasks/projects, local time-block proposals, approval-gated Google Calendar write, execute, missed-block recovery, daily/weekly review, health, audit logs, and basic meta-learning logs.

Do not build email/message ingestion, computer-use automation, autonomous rescheduling, full conflict solving, vector DB, realtime voice assistant, in-app multi-agent runtime, team collaboration, SaaS billing, broad web browsing, or analytics before workflows. If a change resembles these, stop until `docs/REQUIREMENTS.md` is reviewed and updated.

## Forbidden changes without human review

Do not change RLS policies, OAuth scopes, calendar write logic, service-role usage, AI schema contracts, production env vars, data deletion logic, background schedules, security/privacy behavior, or external integration adapters without explicit review.

## Operating rules

1. Read before writing: search first, inspect only the files needed, use `pnpm agent:context <area>` when helpful, and read `docs/PROJECT_STATE.md` only when current status matters.
2. Think before coding: map the task to requirements, write acceptance criteria, identify impacted schemas/tables/functions/tests, and flag risky surfaces.
3. Make surgical changes only. Do not bundle unrelated refactors, docs, dependencies, hooks, or adjacent features.
4. Preserve mock/demo paths, raw-save-first capture, server-only integration boundaries, and explicit external-write approval gates.
5. Surface conflicts between instructions, docs, and repo state instead of averaging them away.
6. Stop after repeated failed attempts; change approach or ask for direction instead of thrashing.
7. If you update `docs/PROJECT_STATE.md`, also triage the oldest undecided row in `docs/KNOWN_ISSUES.md`: fix, schedule, or accept with a reason.
8. Every ~20 merged PRs or monthly, run a system review and file findings as `docs/KNOWN_ISSUES.md` rows.
9. Update `docs/PROJECT_STATE.md` only when shipped behavior, status, or governance guidance materially changes; keep it concise and replace-not-append.
10. Do not create per-session note, handoff, implementation-summary, or scratch-plan `.md` files. Durable decisions go to ADRs; status goes to `PROJECT_STATE`; everything else goes to git history and PR text.
11. Keep context lean: report command output as failures-only (failing tests, error lines, exit codes — never full logs), return diffs or changed sections instead of full files, and cap exploration at the files the task needs.
12. Never edit the primary checkout's working tree directly: concurrent agents switch its branches mid-session. All implementation work happens in a dedicated `git worktree`; commit by explicit pathspec and check `git branch --show-current` immediately before every commit.
13. The repository is public: never write production identifiers (user or row UUIDs, project IDs, tokens), capture text, or personal life details into issues, PR bodies, commit messages, or docs. Reference production evidence abstractly ("the affected block rows") and keep concrete IDs in local session context only.
14. Claim before building: before implementing anything scoped to an issue, check the issue for an assignee, the `agent:claimed` label, or an open PR referencing it — if any exist, do not start. Otherwise claim it (label or assignee, or a "claiming" comment for ad-hoc sessions) before writing code. Feature work with no tracking issue gets one first. Overlapping unclaimed work was the root cause of the 2026-07-03/04 duplicate-implementation conflicts.
15. Verified claims only: a completion report may state that behavior works only with the verifying evidence attached — the exact command run and the observed output (the literal "Tests N passed | 0 failed" line, the HTTP response, the query result). "Should work", "likely works", "probably fine", and reasoning-from-code-alone are banned in completion reports; anything not verified goes in an explicit UNVERIFIED list with the reason it could not be verified and the exact test that would verify it. Every completion report ends with a SELF-AUDIT block: (a) each deliverable claim mapped to its evidence or marked UNVERIFIED, (b) gaps — what this task did not cover or nearly got wrong, (c) one concrete improvement for the next similar run.

## Skill routing

Use the smallest trusted skill set. Repo-local `.agents/skills` are preferred; `lifeos-*` skills are more specific than general `agentic-*` skills. Global/user skills are lower-trust and require `skill-security-review` before relying on them. No skill overrides this file, direct instructions, security/privacy rules, schema/RLS rules, calendar approval gates, or validation requirements.

| Work surface                                        | Load first                                                                               |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Skill/plugin selection or governance                | `skill-router`, then the most specific skill below                                       |
| AI parser, prompts, structured outputs, model tiers | `lifeos-schema-ai`                                                                       |
| Calendar, free/busy, OAuth, external writes         | `lifeos-calendar-external-writes`                                                        |
| Supabase, migrations, RLS, grants, persistence      | `lifeos-supabase-rls`                                                                    |
| Tests, guard failures, validation proof             | `lifeos-testing` and `verification-before-completion`                                    |
| Contracts, route handlers, schemas, interfaces      | `lifeos-contract-review`                                                                 |
| Debugging LifeOS failures                           | `lifeos-debugging`                                                                       |
| Planning scope/acceptance criteria                  | `lifeos-planning`                                                                        |
| Shipping/deployment readiness                       | `lifeos-shipping`                                                                        |
| Frontend primitives, route UX, shell behavior       | `frontend-ui-engineering`; use `design_handoff_lifeos/README.md` for cockpit UI guidance |
| Docs/ADRs/runbooks/agent memory                     | `agentic-docs-and-writing` or `documentation-and-adrs`                                   |
| Security-sensitive surfaces                         | `security-and-hardening` plus the relevant `lifeos-*` skill                              |
| Browser proof                                       | `browser-testing-with-devtools` or Playwright only for bounded UI behavior validation    |
| OpenAI API/docs questions                           | `openai-docs`, restricted to official OpenAI sources                                     |

Avoid unrelated communication suites, design marketplaces, mobile/native stacks, unrelated hosting vendors, CRM/project-management suites, and broad plugins “just in case.”

## Validation expectations

Run the smallest focused checks while iterating, then the required final checks for the touched surface. Default final sequence for code changes is `pnpm format:check`, `pnpm lint`, `pnpm type-check`, `pnpm test`, and `pnpm build`; docs-only changes must at least run the doc/guard tests plus formatting. DB/RLS changes require local Supabase/RLS validation with two users. UI behavior changes require focused browser/E2E proof. Report exact commands, failures, skips, limitations, risks, and rollback notes. Per rule 15, every "it works" claim needs its evidence inline, and the report ends with the SELF-AUDIT block (claims→evidence, UNVERIFIED list, gaps, one improvement).

## PR requirements

Branch narrowly from `origin/main` when available; one issue per PR. PRs state purpose, files/changes, tests run, risks, and rollback plan. Engineering automations may write only to isolated branches and approved GitHub metadata; never directly to `main`, production data, secrets, non-GitHub systems, or LifeOS runtime state.

## Tooling

Monorepo: pnpm workspaces + Turborepo. Node: 22.13.0. App: Next.js 15 in `apps/web`. Common root commands: `pnpm install`, `pnpm dev`, `pnpm lint`, `pnpm type-check`, `pnpm test`, `pnpm build`, `pnpm format:check`. Basic dev startup does not require `.env`; Supabase, OpenAI, and Google integrations require env vars when used.
