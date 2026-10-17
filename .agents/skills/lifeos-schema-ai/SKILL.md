---
name: lifeos-schema-ai
description: Use for LifeOS AI parser, structured outputs, prompts, Zod schemas, parse-capture, mock fallback, AI env vars, and validation boundaries.
---

# lifeos-schema-ai

The product red lines in `AGENTS.md` (schema validation before persistence, raw capture never lost, capture text is data) and INV-8 govern. LifeOS-specific facts:

- **Real AI contracts** live in `packages/schemas`: `ParseCaptureResponseSchema` (with `ParseCaptureAmbiguityAssessmentSchema`) in `packages/schemas/src/parse-capture.ts`, and `TaskMapGraphDraftSchema` in `packages/schemas/src/task-map.ts`. A new mutation-producing AI call adds its own versioned input/output schema there, with valid and invalid fixtures, a prompt version, and an audit/trace record.
- **Order:** raw capture is saved before any parse attempt; parsed tasks/projects stay triage drafts until the user accepts them.
- **Boundaries:** AI code and AI env vars stay server-side; every parse goes through `parseCaptureIntoDrafts` and the context-assembly choke point (`apps/web/src/lib/ai/contextAssembly.ts`, NS-INV-1). Guards: `injectionContainment.test.ts`, `triageSortContainment.test.tsx`, `contextAssemblyChokePoint.test.ts`.
- **Model tiers** are configuration (`AI_MODEL_CHEAP`, `AI_MODEL_STANDARD`, `AI_MODEL_STRONG`, see `packages/schemas/src/model-tier.ts`), never hardcoded model names.
- **Mock fallback** stays safe and working when AI env is missing or disabled.
- **Prompt rules:** separate facts, assumptions, guesses, and decisions; give confidence levels and ranges, not fake precision; expose unknowns; propose reversible first moves; never claim an external action was completed.
