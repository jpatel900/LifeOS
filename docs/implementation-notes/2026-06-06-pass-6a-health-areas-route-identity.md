# Pass 6A: Health and Areas Route Identity

Date: 2026-06-06

## Scope

Complete Pass 6A of the active UX roadmap by strengthening route identity on:

- `apps/web/src/app/health/page.tsx`
- `apps/web/src/app/settings/areas/page.tsx`
- `apps/web/src/app/globals.css`

Constraints stayed explicit:

- no schema, auth, parser, persistence, or Google write changes
- no shell redesign
- no truth-boundary weakening around saved-versus-local behavior

## What changed

### Health

- Reframed the route header around a trust-and-repair desk instead of a generic diagnostics page.
- Added a distinct health-specific header and flagship/support-card treatment so the trust answer, trust map, and repair queue read like one authored scene.
- Kept the authored run-feedback system from Pass 5C intact while making the surrounding route feel more specific and less template-derived.

### Areas

- Reframed the route header around ownership boundaries instead of generic settings/admin language.
- Added a stronger ownership summary, including the current selected area, so the route reads more like a registry of active scopes than a generic settings list.
- Calmed the area-record layout into a single-column scan and tightened the ownership/admin framing around actions, accents, and diagnostics.

## Why this was the right slice

- Pass 5C stabilized action feedback on Health and Areas, so route-identity work could happen without mixing visual/editorial changes with cadence repairs.
- These two routes were the clearest remaining cases where strong underlying behavior still read too much like a shared template.
- The value here was not more UI surface. The value was making the route purpose legible from framing and emphasis before the user reads every label.

## Proof

- `pnpm --filter @lifeos/web test -- src/__tests__/healthPage.test.tsx`
- `pnpm --filter @lifeos/web test -- src/__tests__/workflowAreaAccent.test.tsx`
- `pnpm --filter @lifeos/web test -- src/__tests__/phase4aPersistence.test.tsx`
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/workflow-hierarchy.spec.ts`
- `pnpm --filter @lifeos/web lint`
- `pnpm --filter @lifeos/web build`
- `pnpm --filter @lifeos/web type-check`
- `pnpm --filter @lifeos/web test`
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts tests/e2e/workflow-hierarchy.spec.ts tests/e2e/interaction-feedback.spec.ts`
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/workflow-card-accent.spec.ts tests/e2e/execute-focus-flagship.spec.ts`

## Follow-up

The next honest gap is Pass 6B: sharpen route identity on Execute and Review. Their shell burden and feedback cadence are already stable enough that the remaining issue is route voice, not mechanics.
