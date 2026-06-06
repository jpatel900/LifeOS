# Codex Skill Routing

Use the smallest relevant trusted skill/plugin set for LifeOS work.

Default allowed for LifeOS development:

- repo-local `.agents/skills`
- `superpowers` only for planning, debugging, test-driven development, and verification discipline
- `GitHub` only for PRs, branches, CI, reviews, and issues
- `codex-security` only for security-sensitive surfaces
- `Supabase` only for database, auth, RLS, migrations, and Supabase client/server work
- `build-web-apps` only for React, Next.js, frontend, and browser verification work
- `playwright` MCP for bounded browser validation only (see `docs/agent/PLAYWRIGHT_MCP_VALIDATION.md`)
- `Vercel` only for deployment, build, env, and runtime diagnostics
- `openai-docs` / `openai-developers` only for OpenAI API, Responses API, Structured Outputs, models, prompts, and schema contracts
- `Sentry` only during Sentry-related observability work

## Frontend Routing Rule

When the task touches `apps/web/components.json`, `apps/web/src/components/ui/**`, shared interaction patterns, or token-level styling in `apps/web/src/app/globals.css`:

- prefer `frontend-ui-engineering`
- use a shadcn skill when the work is specifically about primitives, component installation, composition, or shadcn conventions
- prefer app-local shadcn-compatible primitives over route-local one-off controls
- do not use shadcn as an excuse to turn shell/layout/route identity into generic stock components

Avoid by default unless explicitly requested:

- Slack
- Gmail
- Outlook
- Teams
- Twilio
- Stripe
- Figma
- Canva
- Expo
- iOS/macOS
- game development tools
- life-science tools
- CRM tools
- Jira/Confluence
- Netlify
- Cloudflare
- Render

Repo-local skills override relevant global or user-level skills.

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
