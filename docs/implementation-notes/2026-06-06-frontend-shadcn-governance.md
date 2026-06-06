# 2026-06-06 Frontend Shadcn Governance

## Intent

Make the frontend more internally consistent without collapsing LifeOS into generic stock shadcn screens.

## Decision

LifeOS should keep moving shared primitives and repeated interaction patterns toward app-local shadcn-compatible components, while preserving product-specific composition as custom code.

That split is now the explicit repo rule:

- `apps/web/src/components/ui/**` is the primitive layer.
- `apps/web/src/app/globals.css` remains the token and shared-surface foundation.
- Shared controls and repeated interaction patterns should prefer primitive reuse or extension over route-local duplication.
- `AppShell`, route identity, area accents, workflow editorial framing, and flagship/support/admin composition should remain intentionally custom.
- New shadcn-compatible primitives should be added only when they solve repeated usage, accessibility, or consistency problems.

## Why

The repo is already partially shadcn-based. The useful direction is to standardize the primitive layer and shared patterns, not to rewrite the whole app into kit-style screens.

That gives the project more consistency and less UI drift without throwing away product-specific authorship.

## Documentation updated

- `AGENTS.md`
- `docs/CODEX_SKILL_ROUTING.md`
- `docs/UI_UX_WORLD_CLASS_ROADMAP.md`
- `docs/PROJECT_STATE.md`

## Runtime impact

None. This is a documentation and governance change only.

## Validation

- Reviewed the updated docs for alignment with the current frontend structure:
  - `apps/web/components.json`
  - `apps/web/src/components/ui/**`
  - `apps/web/src/app/globals.css`
- No code paths or tests were changed in this pass.
