# LifeOS

## Project documentation

Project documentation lives in `docs/`. Start with `docs/PROJECT_STATE.md` for the current handoff state, then read the relevant product, architecture, data model, UX, test, and security docs from that folder.

## Local development

From the `LifeOS` repository root:

- Install dependencies:

```bash
pnpm install
```

- Run the web app in development mode:

```bash
pnpm dev
```

This runs the Turbo pipeline, which in turn starts the `@lifeos/web` Next.js app on `http://localhost:3000`. You can also run the web app directly:

```bash
pnpm --filter @lifeos/web dev
```

- Lint the monorepo:

```bash
pnpm lint
```

- Type-check the monorepo:

```bash
pnpm type-check
```

- Run tests:

```bash
pnpm test
```

The current Phase 1 mock shell uses only local mock data. **No environment variables or API keys are required** to run the app, and there are **no Supabase, OpenAI, or Google Calendar calls** in this phase.