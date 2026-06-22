# Next-Phase Gate Review

## Purpose

Provide a compact, repeatable diagnostic review before the project moves into a new implementation phase or merges a substantial change. This review is for fragility, duplication, production risk, missing proof, and scope control. It is not a design rewrite, cleanup spree, or implementation pass.

## When to use

Use this review:

- before starting a new phase
- before opening a pull request
- before merging
- after large AI-generated changes
- before touching risky surfaces such as schemas, migrations, RLS, authentication, AI parsing, prompt contracts, calendar writes, environment/config, or deployment

Do not use it as a generic brainstorming template. Use it when the next step could hide fragility, production risk, silent failure, or scope creep.

## Inputs to inspect

Inspect only the smallest relevant set needed to review the current phase boundary:

- `AGENTS.md`
- `docs/PROJECT_STATE.md`
- `docs/REQUIREMENTS.md`
- `docs/ARCHITECTURE.md`
- `docs/DATA_MODEL.md`
- `docs/ENGINEERING_INVARIANTS.md`
- `docs/SECURITY_PRIVACY.md`
- `docs/TEST_PLAN.md`
- affected routes, server actions, adapters, schemas, migrations, or tests
- recent diffs or branch changes if reviewing in-flight work

Prefer implementation authority docs and source files over background docs.

## Review questions

Answer these directly:

- What is fragile here?
- Does any change add a multi-step persisted write, a new table, a new vendor call, or push a module over budget? Check the matching invariant in `docs/ENGINEERING_INVARIANTS.md`.
- What did we duplicate?
- What could break in production?
- What could break silently?
- What should we clean before moving forward?
- What tests are missing?
- What should not be touched yet?
- What would be scope creep?

Also check:

- whether raw captures can still survive AI/parser failure
- whether AI output still validates before persistence
- whether deterministic logic remains in code/config instead of prompts
- whether external writes remain approval-gated and audit-logged
- whether auth/RLS/service-role boundaries are still explicit
- whether mock-safe paths still exist when the phase requires them

## Required output format

```markdown
### 1. Verdict

Choose one:

- Safe to proceed
- Proceed with caution
- Blocked until cleanup
- Blocked until tests/proof
- Needs human architecture decision

### 2. Top Risks

| Risk | Severity | Evidence | Recommended Action |

Severity must be one of:

- Low
- Medium
- High
- Critical

### 3. Fragility Map

Group findings by:

- Data model / schemas
- API / backend
- Frontend / UX
- AI prompts / parsing
- Auth / permissions
- Calendar or external writes
- Tests / validation
- Environment / deployment
- Documentation / agent rules

### 4. Duplication Map

For each duplicated or near-duplicated item include:

- Where it appears
- Why it matters
- Whether to consolidate now or later

### 5. Production Breakage Scenarios

For each scenario include:

- Trigger
- Failure mode
- User impact
- Detection method
- Prevention or mitigation

### 6. Cleanup Before Moving Forward

Split into:

#### Must clean now

#### Should clean soon

#### Can ignore for now

### 7. Missing Tests

Include:

- Test file or area
- Behavior to test
- Why it matters

### 8. Scope Control

State:

- What should not be changed in the next step
- What would be scope creep
- What should be deferred

### 9. Suggested Next Action

Give one concrete next action.
```

## Severity definitions

- `Low`: worthwhile cleanup or clarity issue; low likelihood of user-facing breakage
- `Medium`: credible fragility or missing proof; can become a later regression if ignored
- `High`: likely regression, production incident, or unsafe behavior if the next phase proceeds without addressing it
- `Critical`: immediate blocker involving data loss, auth/RLS breakage, schema/persistence corruption, silent external writes, secret exposure, or other violation of LifeOS non-negotiables

## Rules / constraints

- This review is diagnostic only. Do not implement fixes unless the user explicitly asks for fixes.
- Distinguish real blockers from optional cleanup. Do not inflate every imperfection into a stop-ship issue.
- Prefer evidence from authority docs, code, tests, migrations, and diffs over assumptions.
- Prefer small, scoped cleanup recommendations over broad refactors.
- Call out silent-failure risks separately from obvious breakage.
- Flag scope creep explicitly when a “cleanup” recommendation would actually expand requirements, architecture, or integrations.
- Preserve LifeOS invariants: no hidden prompt logic, no schema weakening, no secrets in clients, no approval bypass for calendar writes, no broad autonomous behavior, no broad rewrites.
- If the review finds conflicts between docs, code, and tests, surface the conflict plainly instead of averaging it away.
- If proof is missing, say proof is missing. Do not treat green partial tests as full evidence.

## Non-goals

- implementing fixes
- rewriting architecture
- broad document rewrites
- re-scoping product requirements
- bundling unrelated cleanup into the next phase
