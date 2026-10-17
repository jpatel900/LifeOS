---
name: lifeos-shipping
description: Use for LifeOS production-readiness and rollout checks so deployment, smoke proof, and rollback expectations stay explicit.
---

# lifeos-shipping

- Checklist: `docs/VERCEL_PRODUCTION_CHECKLIST.md`. Post-deploy proof: `pnpm smoke:prod` (also runs weekly from `.github/workflows/weekly-prod-smoke.yml`). A green deploy is not product proof.
- Confirm which integrations (Supabase, OpenAI, Google) the expected runtime path needs; missing env means demo mode, which is acceptable only if the rollout goal allows it.
- Real Google Calendar writes only with explicit owner approval, on a non-critical calendar first.
- Secrets and tokens never reach client-visible surfaces.
- Every rollout note names the rollback (Vercel instant rollback to the previous deployment; migrations are forward-only, so a schema rollback is a new migration) and the remaining production risks.
- Deploys, production env changes, and production data stay owner-gated (`AGENTS.md` "Operational red lines"); you may prepare all of it, and declare what needs the owner.
