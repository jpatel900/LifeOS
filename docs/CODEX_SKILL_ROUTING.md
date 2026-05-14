# Codex Skill Routing

Use the smallest relevant trusted skill/plugin set for LifeOS work.

Default allowed for LifeOS development:

- repo-local `.agents/skills`
- `superpowers` only for planning, debugging, test-driven development, and verification discipline
- `GitHub` only for PRs, branches, CI, reviews, and issues
- `codex-security` only for security-sensitive surfaces
- `Supabase` only for database, auth, RLS, migrations, and Supabase client/server work
- `build-web-apps` only for React, Next.js, frontend, and browser verification work
- `Vercel` only for deployment, build, env, and runtime diagnostics
- `openai-docs` / `openai-developers` only for OpenAI API, Responses API, Structured Outputs, models, prompts, and schema contracts
- `Sentry` only during Sentry-related observability work

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
