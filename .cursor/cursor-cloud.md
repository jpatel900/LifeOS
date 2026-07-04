# Cursor Cloud notes

- Monorepo: pnpm workspaces + Turborepo.
- Package manager: pnpm with `pnpm-lock.yaml`.
- Node.js: 22.13.0 (`.nvmrc`).
- Frontend: Next.js 15 in `apps/web`.
- Shared packages: `packages/schemas`, `packages/types`, `packages/ui`, `packages/utils`.
- Common commands from root: `pnpm install`, `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm type-check`, `pnpm test`, `pnpm format`, `pnpm format:check`.
- Dev server defaults to http://localhost:3000.
- `pnpm-workspace.yaml` owns build-script approvals and overrides.
- Basic dev server startup does not require `.env`; Supabase, OpenAI, and Google integrations require env vars when used.
