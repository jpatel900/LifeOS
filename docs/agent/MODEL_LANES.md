# MODEL_LANES.md — roles and the one model mapping

Other docs name roles, never models (guard: `apps/web/src/__tests__/docLinkIntegrity.test.ts`).

| Role        | Does                                                   | Current choice (2026-08-04)                            |
| ----------- | ------------------------------------------------------ | ------------------------------------------------------ |
| Driver      | plans, contracts, merges per AGENTS.md                 | strongest available frontier model                     |
| Implementer | builds a contracted slice; never grades its own work   | any capable current model with a written contract      |
| Verifier    | validates independently at the tier the claim lives at | same tier or stronger; never the implementing instance |
| Judge       | fresh-eyes scoring against ratified criteria           | strongest frontier model, fresh context                |

When a model generation changes, retest restrictions written for the old one; delete what no longer earns its keep. Product AI tiers (`AI_MODEL_*`) are separate: see `lifeos-schema-ai`.
