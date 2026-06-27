# Agent Context Index

Use the smallest relevant context first.

- Do not read all project docs by default.
- Use `pnpm agent:context <area>` for bounded repo orientation.
- Escalate to broader authority docs only when the task risk requires it.
- `AGENTS.md` remains the highest authority for agent behavior.
- For multi-step writes, new tables, vendor calls, or module size, check `docs/ENGINEERING_INVARIANTS.md` (binding, with guard tests).
- `docs/LIFE_OS_WIKI.md` and `EXTRA_INFO_AND_RULES.md` are background references for planning only; do not load them into normal implementation context.
- This index is a routing aid, not an authority document.
- Quick checks are iteration aids only; final validation still follows `AGENTS.md`.

## Areas

| Area                   | Start with                                |
| ---------------------- | ----------------------------------------- |
| `capture`              | `pnpm agent:context capture`              |
| `parse-capture-ai`     | `pnpm agent:context parse-capture-ai`     |
| `schemas`              | `pnpm agent:context schemas`              |
| `supabase-rls`         | `pnpm agent:context supabase-rls`         |
| `calendar`             | `pnpm agent:context calendar`             |
| `ui`                   | `pnpm agent:context ui`                   |
| `health-observability` | `pnpm agent:context health-observability` |
| `projects-tasks`       | `pnpm agent:context projects-tasks`       |
| `docs`                 | `pnpm agent:context docs`                 |
| `tests`                | `pnpm agent:context tests`                |

For world-class UI/UX work, `ui` context must then route through:

1. `docs/UI_UX_WORLD_CLASS_ROADMAP.md`
2. `docs/agent/UI_AGENT_GUIDE.md`
3. `design_handoff_lifeos/README.md` while the handoff cockpit pass is active
4. the touched cockpit source and focused tests
5. `docs/PROJECT_STATE.md` only when current shipped truth or blockers matter
6. the latest roadmap-linked implementation note only if the roadmap or guide points to it

## Escalation Path

1. Start here or with `pnpm agent:context <area>`.
2. For active UI/UX program work, read `docs/UI_UX_WORLD_CLASS_ROADMAP.md` and `docs/agent/UI_AGENT_GUIDE.md` before implementation.
3. Pull touched route source, focused tests, and proof surfaces before `docs/PROJECT_STATE.md` or older notes unless the task is blocked on shipped-truth status.
4. Read `docs/PROJECT_STATE.md` only when you need current status, blockers, or the shortest proof-routing handoff.
5. Pull the smallest relevant authority docs for the risk surface.

Keep `docs/agent/REPO_MAP.json` concise. Update it only when source paths or risk surfaces materially change.
