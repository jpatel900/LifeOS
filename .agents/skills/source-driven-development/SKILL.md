---
name: source-driven-development
description: Use for platform-sensitive LifeOS changes so current official sources are checked before framework or API assumptions become bugs.
---

# source-driven-development

## Overview / purpose

Require current official sources for fast-moving platform behavior before making platform-sensitive LifeOS changes.

## When to use

- Touching or reasoning about OpenAI APIs, Structured Outputs, or model behavior.
- Touching Supabase Auth, RLS, Postgres, migrations, or client/server boundaries.
- Touching Google Calendar API, OAuth, or external-write behavior.
- Touching Vercel deployment/runtime behavior.
- Touching Next.js framework behavior.
- Touching Playwright/browser validation behavior.
- Touching GitHub Actions, Codex Action, or workflow permissions.

## Do not use when

- The task is purely repo-local wording, structure, or policy with no platform-behavior dependency.
- The relevant fact is already stable and fully governed by repo authority docs.

## Process

1. Identify the platform behavior that could be stale or version-sensitive.
2. Check the current official source before editing or making claims.
3. Use repo authority docs for LifeOS-specific decisions and the official source for platform truth.
4. Note the key source checked when the implementation depends on that external behavior.
5. Treat blogs, memory, and folklore as secondary at best.

## Common rationalizations

- "I know this API already." Re-check when behavior could have changed.
- "A blog post is good enough." Not for platform-sensitive repo changes.
- "The source lookup can happen after coding." Wrong order.

## Red flags

- Hardcoded assumptions about changing APIs or framework defaults.
- Claims about provider behavior with no current source.
- Using external docs to override LifeOS product rules.

## Verification

- The change or explanation cites the relevant official source internally in the handoff or note.
- Repo authority docs remain the source of implementation policy.

## Done criteria

- Platform-sensitive assumptions were verified against current official sources.
- The key source checked is named when it materially affected the change.
- No external source was allowed to override LifeOS safety or scope rules.

## Authority / safety boundaries

- `AGENTS.md`, requirements, and repo authority docs still govern LifeOS behavior.
- This skill supplements repo docs; it does not replace them.
