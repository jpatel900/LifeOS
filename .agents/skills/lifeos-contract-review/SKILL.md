---
name: lifeos-contract-review
description: Use for LifeOS route, schema, adapter, and interface changes so contract impact is checked before implementation or review approval.
---

# lifeos-contract-review

## Overview / purpose

Make interface and contract impact explicit when a change touches Route Handlers, Server Actions, shared schemas, adapters, or integration boundaries.

## When to use

- Touching Next.js Route Handlers.
- Touching Server Actions.
- Touching shared schemas or shared packages.
- Touching AI parser contracts.
- Touching Google Calendar adapter contracts.
- Touching Supabase client/server boundaries.
- Touching validation or error-shape contracts.

## Do not use when

- The task is isolated copy-only or layout-only work with no contract surface.
- The change is purely internal refactoring with no caller-facing or validation-facing effect.

## Process

1. Identify the input contract.
2. Identify the output contract.
3. Check validation behavior and failure semantics.
4. Check backward compatibility and caller impact.
5. Check privacy or logging impact.
6. Check the tests that prove the contract still holds.

## Common rationalizations

- "The types still compile, so the contract is fine." Types alone are not enough.
- "Only one caller uses this." Verify instead of assuming.
- "Errors can stay vague." Error shape is part of the contract.

## Red flags

- Silent contract drift across route, schema, and UI layers.
- Validation loosened to fit a buggy caller.
- Sensitive provider or server details leaking through error shapes.

## Verification

- Input/output expectations are explicit.
- Validation and error semantics are reviewed, not inferred.
- Relevant regression proof exists for affected callers.

## Done criteria

- Contract surfaces and impacted callers are identified.
- Compatibility and error-shape risks are checked.
- Required validation proof is named or run.

## Authority / safety boundaries

- This skill does not authorize T3/T4 implementation by itself.
- `AGENTS.md`, schema rules, approval gates, and privacy rules override this skill.
