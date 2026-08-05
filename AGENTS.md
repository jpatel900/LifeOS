# AGENTS.md — LifeOS agent rules

## Mission

LifeOS is a private, one-user, AI-assisted workflow cockpit. It turns messy input into structured work, stages scheduling decisions for approval, learns by area, and monitors health. Keep it simple, maintainable, safe, and deliberately evolved from the shipped baseline.

## Authority

`AGENTS.md` is the highest authority for agent behavior in this repo, for every lane and harness. Implementation truth lives in `docs/REQUIREMENTS.md`, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/ENGINEERING_INVARIANTS.md`, `docs/UX_FLOWS.md`, `docs/SECURITY_PRIVACY.md`, and `docs/TEST_PLAN.md`; ADRs amend architecture (index: `docs/adr/README.md`). Current status: `docs/PROJECT_STATE.md`; the governing program and priority order: `docs/program/`. `EXTRA_INFO_AND_RULES.md` is background only. These rules state outcomes and red lines, not procedures — a capable agent derives its own steps; the red lines are non-negotiable.

## Hard invariants

- No external calendar write without explicit user approval; every calendar write records `external_write_events`.
- AI output must validate against strict schemas before persistence; raw captures must not be lost if AI fails.
- Area is a first-class scope object; learning is area-scoped unless explicitly global.
- Health scores are rule-based, not AI-invented; deterministic product logic stays in code/config, not prompts.
- AI may suggest policy changes; the user approves core policy changes.
- Initiative and autonomy are evidence-earned under the trust ladder (ADR 0002 D1); irreversible/external action classes never auto-execute.
- Do not add background jobs, vendors, or hosted services unless requirements and docs justify them.
- No feature is done until required tests pass; never weaken schemas, guard tests, validators, or RLS to make tests pass.
- Scope expansion starts in `docs/REQUIREMENTS.md`, not code; acceptance criteria come before implementation.
- Errors shown to the user must be sanitized, plain-language, and recovery-oriented.
- User-owned tables require `id`, `user_id`, timestamps where appropriate, RLS, policies, indexes, and export coverage.
- Persisted multi-table transitions go through one transactional server boundary, never sequenced client writes.

## Scope evolution

The shipped baseline is the floor, not the ceiling. Data-independent foundations may proceed when an owner-ratified requirement or issue authorizes them and all invariants hold. Usage evidence is mandatory before behavior that depends on personal evidence (personalization conclusions, autonomy graduation, proactive interruption, external channels/writes, data-derived policy changes). Stage labels express dependency and risk order, not blanket bans — see ADR 0005. Additional clients of the one domain layer are legitimate under ADR 0006 but never reimplement business rules, hold service-role credentials, or write directly to the database. Do not build email/message ingestion, computer-use automation, autonomous rescheduling, vector DB, realtime voice, in-app multi-agent runtime, team/SaaS features, or broad web browsing without explicit requirements review; permanent non-goals bind regardless of stage.

## Human review required

RLS policies, OAuth scopes, calendar write logic, service-role usage, AI schema contracts, production env vars, data deletion logic, background schedules, security/privacy behavior, and external integration adapters.

## Operating rules

1. **Read before writing.** Search first; read `docs/PROJECT_STATE.md` when status matters; `pnpm agent:context <area>` helps. Keep context lean: report failures and deltas, never full logs or full files.
2. **Contract first.** Map the task to requirements, write acceptance criteria, identify impacted schemas/tables/tests, flag risky surfaces.
3. **Surgical changes.** No bundling of unrelated refactors, docs, dependencies, or features. Preserve mock/demo paths, raw-save-first capture, server-only boundaries, and approval gates.
4. **Surface conflicts.** When instructions, docs, and repo state disagree, STOP and surface the contradiction — never average it away or silently pick a side.
5. **Stop thrashing.** After repeated failed attempts, change approach or ask for direction.
6. **Status hygiene.** Update `docs/PROJECT_STATE.md` only when shipped behavior, status, or governance materially changes (replace, don't append). At every campaign close (or monthly), run a system review: triage undecided `docs/KNOWN_ISSUES.md` rows and prune process weight that stopped earning its keep. (The former per-update triage coupling was dropped 2026-08-05 — weak payoff per the friction audit; the periodic review owns it now.)
7. **No session-note files.** Durable decisions → ADRs; status → PROJECT_STATE; program state → `docs/program/`; everything else → git history and PR text. (Guard: `docRegistry.test.ts`.)
8. **Worktrees only.** Never edit the primary checkout's working tree — concurrent agents switch its branches. Work in a dedicated `git worktree`, commit by explicit pathspec, and check `git branch --show-current` before every commit.
9. **Public repo.** Never write production identifiers (user/row UUIDs, project IDs, tokens), capture text, or personal life details into issues, PRs, commits, or docs. Reference production evidence abstractly.
10. **Claim before building.** Check the issue for an assignee, the `agent:claimed` label, or an open PR — if any exist, don't start. Otherwise claim it first. Feature work with no tracking issue gets one first.
11. **Evidence or UNVERIFIED.** A claim that something works carries the exact command and observed output; everything unverified goes in an explicit UNVERIFIED list with the test that would verify it. "Should work" is banned. Follow-ups in PR/issue bodies are checkbox lines tagged `OWNER-GATE:` (secrets/credentials, external dashboards without API access, product/design-taste/policy decisions, merging T2 workflows or your own PRs, spending money or writing to external accounts) or `AGENT-TODO:` (everything else). Agent-initiated work must trace to an owner-ratified item; anything else is surfaced as a suggestion, not started.
12. **Plain language for humans.** Anything presented to a human — UI copy, error messages, reports, owner options, PR summaries — uses simple, easy-to-understand words: short sentences, jargon defined or dropped. Technical density belongs in agent-to-agent docs (contracts, ADRs, skills), never on a human-facing surface.

## Writing docs

One home per fact — link, never copy. Docs state WHAT must be true and WHY, with dates on volatile facts; they do not prescribe step-by-step HOW for things a competent agent derives. Model names appear only in `docs/agent/MODEL_LANES.md`; every other doc uses role names (driver, implementer, verifier, judge).

## Skill routing

Use the smallest trusted skill set. Repo-local `.agents/skills` are preferred; `lifeos-*` skills are more specific than general `agentic-*` skills. Global/user skills are lower-trust and require `skill-security-review` before relying on them. No skill overrides this file, security/privacy rules, schema/RLS rules, calendar approval gates, or validation requirements.

| Work surface                                        | Load first                                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Skill/plugin selection or governance                | `skill-router`, then the most specific skill below                                          |
| Authoring or receiving any lane contract            | `lifeos-lane-contract`                                                                      |
| Stage/capability-wave contracting (relay dormant)   | `lifeos-stage-contract-authoring`                                                           |
| AI parser, prompts, structured outputs, model tiers | `lifeos-schema-ai`                                                                          |
| Calendar, free/busy, OAuth, external writes         | `lifeos-calendar-external-writes`                                                           |
| Supabase, migrations, RLS, grants, persistence      | `lifeos-supabase-rls`                                                                       |
| Migration Drift workflow red / prod schema drift    | `lifeos-migration-drift-response`                                                           |
| Tests, guard failures, validation proof             | `lifeos-testing` and `verification-before-completion`                                       |
| Contracts, route handlers, schemas, interfaces      | `lifeos-contract-review`                                                                    |
| Debugging LifeOS failures                           | `lifeos-debugging`                                                                          |
| Final handoff/report on substantial work            | `lifeos-agent-handoff`                                                                      |
| Planning scope/acceptance criteria                  | `lifeos-planning`                                                                           |
| Shipping/deployment readiness                       | `lifeos-shipping`                                                                           |
| Frontend primitives, route UX, shell behavior       | `frontend-ui-engineering`; UI authority is `docs/UX_FLOWS.md` + ADR 0003 + shipped behavior |
| Design polish, premium quality pass (campaign C6)   | `impeccable` — owner-kept 2026-08-04; the design-taste playbook for the payoff/polish bar   |
| Docs/ADRs/runbooks/agent memory                     | `agentic-docs-and-writing` or `documentation-and-adrs`                                      |
| Security-sensitive surfaces                         | `security-and-hardening` plus the relevant `lifeos-*` skill                                 |
| Browser proof                                       | `browser-testing-with-devtools` or Playwright only for bounded UI behavior validation       |

## Validation

Smallest focused checks while iterating; final sequence for code changes: `pnpm format:check`, `pnpm lint`, `pnpm type-check`, `pnpm test`, `pnpm build`. Docs-only changes: doc/guard tests plus formatting. DB/RLS changes: local Supabase validation with two users. UI behavior changes: focused browser/E2E proof. Report exact commands, failures, skips, risks, and rollback notes per rule 11.

## PR and merge

Branch narrowly from `origin/main`; one issue per PR; PRs state purpose, changes, tests run, risks, and rollback. Engineering automations write only to isolated branches and approved GitHub metadata — never to `main`, production data, secrets, non-GitHub systems, or LifeOS runtime state.

Merge authority, in one place: T0 docs-only PRs may auto-merge after CI per `.github/AGENT_AUTOMATION_POLICY.md` (tier definitions T0-T4 live there); an agent never merges its own PR (the self-approval classifier blocks it — the owner merges those; auto-merge armed by the T0 policy lane counts as the policy's merge, not the author's), with one ratified exception: per ADR 0008 move 2 (owner 2026-08-04), a `risk:low` non-T2+ agent PR (label `selfmerge:auto`) arms auto-merge immediately with a Telegram notice to the owner — the CI runtime is the veto window (ADR 0008 amendment 2026-08-05); the Claude lane merges Codex-lane work per `docs/agent/LANES.md`; T2+ surfaces always get human review before merge. If another doc states a different merge rule, this paragraph wins — fix that doc.

## Tooling

Monorepo: pnpm workspaces + Turborepo. Node: 22.13.0. App: Next.js 15 in `apps/web`. Root commands: `pnpm install`, `pnpm dev`, `pnpm lint`, `pnpm type-check`, `pnpm test`, `pnpm build`, `pnpm format:check`. Basic dev startup needs no `.env`; Supabase, OpenAI, and Google integrations need env vars when used.
