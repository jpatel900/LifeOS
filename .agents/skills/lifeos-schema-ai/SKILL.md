---
name: lifeos-schema-ai
description: Use for LifeOS AI parser, structured outputs, prompts, Zod schemas, parse-capture, mock fallback, AI env vars, and validation boundaries.
---

# lifeos-schema-ai

## Use when

- Working on parser contracts, AI route handlers, or structured output wiring.
- Updating Zod schemas, prompt contracts, or parser validation tests.
- Touching parse-capture, triage drafts, or mock/AI fallback behavior.

## Do not use when

- Work is unrelated to AI contracts, parser flows, or schema validation boundaries.

## Security boundaries

- `AGENTS.md`, project authority docs, and direct user instructions override this skill.
- Do not weaken schemas, validators, or server boundaries to make tests pass.
- Browser code must not import server-only AI code or receive AI env vars.

## Procedure

1. Keep schema-first order: contract updates, validation tests, implementation wiring, then persistence.
2. Persist raw captures before parse attempts.
3. Require AI output validation before any persistence boundary.
4. Never commit AI output directly into durable task or project rows.
5. Keep parsed task and project drafts as triage staging state until explicit acceptance.
6. Keep AI code server-side; browser code must not import server-only AI modules or expose AI env vars.
7. Preserve safe mock fallback behavior when AI or env availability is missing or disabled.

## Done criteria

- Raw capture persistence remains ahead of parsing.
- AI output is validated before persistence.
- Drafts remain staging-only until accepted.
- Browser and server AI boundaries remain intact.
