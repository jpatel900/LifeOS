# Validation Matrix

These are minimum local iteration checks. They do not replace final validation requirements in `AGENTS.md`.

- Use narrower checks during iteration.
- Before final completion, follow `AGENTS.md` and the task’s risk surface.
- Opt-in local Supabase RLS tests remain opt-in because they require local Supabase/Docker and env setup.
- Do not use this file to justify skipping required final checks.
- For UI/browser verification scope and safety, use `docs/agent/PLAYWRIGHT_MCP_VALIDATION.md`.

| Change type                     | Useful iteration checks                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `docs-only`                     | Manual path/command check for changed docs. Re-open the changed doc sections and confirm linked paths exist. |
| `agent-orientation docs/helper` | `pnpm agent:context capture` · `pnpm agent:context schemas` · `pnpm agent:context unknown-area`              |
| `schema-only`                   | `pnpm --filter @lifeos/schemas type-check` · `pnpm --filter @lifeos/schemas test`                            |
| `capture / parse-capture`       | `pnpm --filter @lifeos/web test -- capture` · `pnpm --filter @lifeos/web test -- parseCapture`               |
| `Supabase / RLS`                | `pnpm --filter @lifeos/web test -- workflow.test.ts health.test.ts` · opt-in `phase4aRls.local.test.ts`      |
| `calendar / external writes`    | `pnpm --filter @lifeos/web test -- google-calendar` · `pnpm --filter @lifeos/web test -- calendar`           |
| `UI-only`                       | `pnpm --filter @lifeos/web test -- WorkflowContext.test.tsx sourceOfTruth.test.ts`                           |
| `UI-only` (browser walkthrough) | Run the scoped journeys in `docs/agent/PLAYWRIGHT_MCP_VALIDATION.md` and report required handoff output.     |
| `health / observability`        | `pnpm --filter @lifeos/web test -- health.test.ts` · `pnpm --filter @lifeos/web test -- observability`       |
| `cross-cutting triggers`         | Multi-step persisted write → transactional RPC (INV-1) · new table → export + RLS (INV-2) · new vendor call → adapter (INV-3) · touched page over budget → extract (INV-4). Run `pnpm --filter @lifeos/web test -- engineeringInvariants`. |
| `tests-only`                    | Run the changed test files first, then the nearest package-level test/type-check command.                    |
