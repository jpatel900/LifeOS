# LANES.md — in-flight work ledger (both harnesses)

> **Check this file before starting any slice. Update it when you claim or finish one.**
> Purpose: two agentic harnesses (Claude lane, Codex lane) work this repo in
> parallel. This ledger is how they avoid file collisions. It lists every
> in-flight slice with the files it may touch. Rules:
>
> 1. If a file you need is listed under another in-flight slice → do not start.
>    Comment on that slice's issue and wait, or renegotiate the split.
> 2. **Shared contract surfaces are Claude-lane-edit-only:** view models
>    (`momentsViewModel.ts`, `cockpit/viewModel.ts`), `WorkflowContext`,
>    `packages/schemas`, route/page files, `.github/workflows/**`. Codex lane
>    builds against them, never edits them.
> 3. Both lanes use subagents for actual implementation (owner directive
>    2026-07-13); the lane orchestrator authors contracts, verifies, and (Claude
>    lane only) merges.
> 4. Cross-cutting changes need a design note in `docs/implementation-planning/`
>    before code.
> 5. One slice = one issue = one branch = one PR. Claude lane is the single
>    merge-serialization point for both lanes.

## In flight

| Lane   | Issue                           | Branch                       | File manifest (may touch)                                                                                                                                                                                                                                                                                                                                                          |
| ------ | ------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude | #555 item 1 (one-shell routing) | `feat/555-one-shell-routing` | `apps/web/src/app/components/LifeOSCockpit.tsx`, `apps/web/src/app/today/page.tsx` (new), `apps/web/src/app/components/moments/TodayMoments.tsx`, `apps/web/tests/e2e/nav-truth.spec.ts` (new), `apps/web/tests/e2e/{cockpit-flow-repair,handoff-cockpit,capture-parse-mock,moments-home-parity}.spec.ts`, `apps/web/src/__tests__/*` (router-mock updates), `docs/agent/LANES.md` |

## Queued (not yet claimed)

| Lane   | Scope                                                                                                                       |
| ------ | --------------------------------------------------------------------------------------------------------------------------- |
| Claude | #556 FR-026 capture containment → then epic #555 order (execute/review contracts, mobile shell + a11y visual halves, fonts) |
| Codex  | Productivity workstream — awaiting owner scope; territory must be file-disjoint from the epic #555 build order above        |

## Done (recent, for context)

- #551 home hero truth (PR #564, merged 2026-07-13) — Claude lane
- #558 badge truth (PR #563), #559 a11y semantics (PR #562) — Codex lane, harvested + merged 2026-07-13
