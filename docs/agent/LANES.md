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

| Lane   | Issue                             | Branch                         | File manifest (may touch)                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------ | --------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude | #556 (FR-026 capture containment) | `feat/556-capture-containment` | `apps/web/src/app/components/moments/CaptureOverlay.tsx` (+test), `apps/web/src/app/components/moments/TodayMoments.tsx`, `apps/web/src/app/components/LifeOSCockpit.tsx` (capture stage + Execute side-capture + premature toast), new shared capture component under `apps/web/src/app/components/`, `apps/web/tests/e2e/{capture-parse-mock,moments-home-parity}.spec.ts`, related unit tests, `docs/agent/LANES.md`. WorkflowContext is CONSUMED, not edited. |
| Codex  | #565 (mid-parse capture drop)     | `codex/productivity-565-*`     | `apps/web/src/lib/WorkflowContext.tsx` (submitCaptureText early-return block ONLY — scoped ownership grant, see issue #565 comment) + its unit test file. Nothing else.                                                                                                                                                                                                                                                                                           |

> Primary coordination interface is GitHub (claim comments in AGENT-CLAIM format,
> `agent:claimed` labels, early draft PRs exposing live touch sets). This file is
> the repo-local mirror; on disagreement, the GitHub claim wins. Merge order when
> slices share a contract: declared in the claim (#565 → #556).

## Queued (not yet claimed)

| Lane   | Scope                                                                                                                |
| ------ | -------------------------------------------------------------------------------------------------------------------- |
| Claude | Epic #555 order after #556: execute/review contracts, mobile shell + a11y visual halves, self-hosted fonts           |
| Codex  | Productivity workstream — awaiting owner scope; territory must be file-disjoint from the epic #555 build order above |

## Done (recent, for context)

- #555 item 1 one-shell routing (PR #566, merged 2026-07-13) — Claude lane
- #551 home hero truth (PR #564, merged 2026-07-13) — Claude lane
- #558 badge truth (PR #563), #559 a11y semantics (PR #562) — Codex lane, harvested + merged 2026-07-13
