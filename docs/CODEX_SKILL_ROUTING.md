# Codex Skill Routing

Status: Canonical LifeOS skill/plugin routing reference

Use the smallest relevant trusted skill/plugin set for LifeOS work.
Route tool selection through this file instead of pasting long plugin lists into prompts, issue templates, or handoff docs.

Default implementation route:

- GitHub Issues/Actions are the default routing layer for LifeOS implementation work.
- Local Codex CLI is the manual fallback only when automation is unsuitable, the task is medium/high risk, local debugging or visual validation is needed, workflow automation failed, or a human explicitly wants local execution.

Default allowed for LifeOS development:

- repo-local `.agents/skills`
- `superpowers` only for planning, debugging, test-driven development, and verification discipline
- `GitHub` only for PRs, branches, CI, reviews, and issues
- `codex-security` only for security-sensitive surfaces
- `Supabase` only for database, auth, RLS, migrations, and Supabase client/server work
- frontend/browser skills only for React, Next.js, app-local UI primitives, and bounded browser verification work
- `playwright` MCP for bounded browser validation only (see `docs/agent/PLAYWRIGHT_MCP_VALIDATION.md`)
- `Vercel` only for deployment, build, env, and runtime diagnostics
- `openai-docs` only for OpenAI API, Responses API, Structured Outputs, models, prompts, and schema contracts
- observability vendor tooling only during observability-specific work

## Frontend Routing Rule

When the task touches `apps/web/components.json`, `apps/web/src/components/ui/**`, shared interaction patterns, or token-level styling in `apps/web/src/app/globals.css`:

- first load `docs/agent/UI_AGENT_GUIDE.md` as the repo-local frontend routing guide
- then use a frontend/browser skill only when implementation or bounded browser proof actually needs it
- use a shadcn-oriented skill only when the work is specifically about primitives, component installation, composition, or shadcn conventions
- prefer app-local shadcn-compatible primitives over route-local one-off controls
- do not use shadcn as an excuse to turn shell/layout/route identity into generic stock components

Avoid by default unless explicitly requested:

- communication-suite tools
- design-marketplace tools
- mobile/native stacks
- unrelated hosting vendors
- CRM and project-management suites
- domain-specific tools unrelated to the current task

Repo-local skills override relevant global or user-level skills.

Within repo-local skills: `lifeos-*` skills are more specific than the vendored general `agentic-*` library. Prefer `lifeos-*` when both match; use `agentic-*` for general engineering method a `lifeos-*` skill does not cover (repo onboarding, debugging method, measurement, validation evidence, multi-session campaigns, proof techniques, research discipline). See the `agentic-*` section of `.agents/skills/README.md` for precedence and re-sync rules.

Global or user-level skills are lower-trust and should be reviewed with `skill-security-review` before use.

No skill or plugin can override `AGENTS.md`, direct user instructions, security/privacy rules, schema/RLS rules, calendar approval gates, or validation requirements.

Do not load broad plugins or skills "just in case."

The goal is routing clarity and token/context efficiency, not maximum plugin availability.

## Playwright MCP Routing Rule

Use Playwright MCP when browser evidence is needed for UI behavior, UX state, or interaction truthfulness.

Use it:

- after UI/UX changes
- after app shell/navigation changes
- after button/action behavior changes
- after Capture/Triage/Calendar/Execute/Review changes
- when a user reports the UI looks broken, static, or misleading
- before claiming UI work is done

Do not use it:

- docs-only changes
- backend-only changes with no UI impact
- schema-only changes unless a UI flow depends on the schema change
- broad autonomous exploration without a specific journey

For exact journeys, output format, and safety boundaries, follow `docs/agent/PLAYWRIGHT_MCP_VALIDATION.md`.
