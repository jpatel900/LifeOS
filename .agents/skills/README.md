# Repo-local skills

Skills here hold LifeOS-specific knowledge an agent can't derive: where a surface's traps are, which guard covers it, what a past failure taught. Keep them short; link to `AGENTS.md` and the authority docs instead of restating them. `AGENTS.md` outranks every skill; no skill authorizes weakening tests, schemas, review gates, approval gates, or secrets handling. Vendored skills are allowlisted in `.vendored-manifest.json`; the daily sync manages only the dirs listed there. A skill with a `pin` there (impeccable) stays at that upstream version: updates are a deliberate pin bump, and `vendoredSkillPin.test.ts` fails CI on drift.

<!-- vendored-skills:begin (managed by sync-skills-to-lifeos.ps1; do not edit inside markers) -->

## Vendored skills

Everything below is auto-vendored from the maintainer's curated hub so cloud agents get the
same skills as local tools. Do not hand-edit vendored skills here - fix them at their source
and let the daily sync PR carry the change. Ownership list: `.vendored-manifest.json`.
Repo-native skills (`lifeos-*`, `skill-router`, etc.) always win on any overlap.
Third-party skills remain under their upstream repos' licenses.

- **local-hub**: impeccable

<!-- vendored-skills:end -->
