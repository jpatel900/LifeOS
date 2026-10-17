# LANES.md — Claude and Codex lanes

Two harnesses work this repo: the Claude lane and the Codex lane. Live state (claims, branches, status) lives on GitHub issues and PRs, never here.

## Who does what

- Claude lane: visual/experience work, architecture- and doctrine-sensitive changes, contracts for both lanes, final verification, and integration of Codex-lane work: it harvests (Codex deliveries may be patch-only), verifies independently, and merges per AGENTS.md "Merge authority".
- Codex lane: contracted, text-verifiable implementation (pure logic, data layer, guard tests, e2e specs), standing audits, second opinions.
- Only root agents post on GitHub; subagents report to their root. A root verifies subagent work against the repo (diffs, tests it runs), never the subagent's own report.
- Cross-lane review is read-only; the authoring lane fixes its own branch.

## Red zones (Claude lane edits only)

`apps/web/src/lib/WorkflowContext.tsx` · `momentsViewModel.ts` · `lib/cockpit/viewModel.ts` · `packages/schemas/**` · route/page files · `.github/workflows/**` · migrations/RLS · `docs/REQUIREMENTS.md` · `docs/UX_FLOWS.md` · `docs/adr/**`. The Codex lane builds against them and never edits them, unless a Claude-root comment on the issue names the exact files; that exception ends with the issue.

## Running in parallel (owner 2026-08-05)

Lanes may run at once when each has claimed its issue and listed the files it expects to touch, and the lists don't overlap. Overlap is semantic too: the same requirement, state transition, interface, or user journey counts even without a shared file. On overlap the later claimant waits, or the lanes agree the interface first and name one integration owner. Dependent work stacks on the dependency's branch (`Depends on #N`); never cherry-pick. Red-zone files stay single-lane. Merges serialize through the queue; CI and the Main Red Guard own integration truth.

## Claims

A claim comment names the lane, branch, expected files, and dependencies. There is no acknowledgement step: claim, then proceed unless a live claim or open PR overlaps. Open a draft PR as soon as work is pushed; its file list is the live claim. Answer the other lane's pending claims, blockers, and handoffs before starting your own work. Release a claim with a completion or release comment. A lapsed claim with no activity may be taken over after a takeover notice; never silently adopt another lane's issue.
