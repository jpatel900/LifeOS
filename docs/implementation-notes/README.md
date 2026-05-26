# Implementation Notes

Use implementation notes for durable, decision-focused context that would bloat `docs/PROJECT_STATE.md` or be lost in a PR thread.

## Required when

Create a note for:

- medium/high-risk work
- multi-step phases
- Supabase, RLS, auth, or OAuth work
- Google Calendar write surfaces
- AI parser contracts
- observability or privacy work
- deployment or workflow permission changes
- any task with non-obvious decisions, deviations, or tradeoffs

## Not required when

A note is usually unnecessary for:

- trivial copy changes
- an obvious one-file bug fix
- tiny docs cleanup

## Standard path

Use:

`docs/implementation-notes/YYYY-MM-DD-<task-slug>.md`

## Required fields

Each note should include:

- task name and branch
- original scope
- assumptions
- decisions
- deviations
- tradeoffs
- files changed and why
- validation commands and results
- risks
- deferred items
- rollback notes

## Style rule

Do not write a verbose diary log.

Good notes preserve decisions, boundaries, evidence, and handoff context.
Bad notes narrate every command or every thought.
