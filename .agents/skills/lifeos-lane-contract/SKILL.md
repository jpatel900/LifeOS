---
name: lifeos-lane-contract
description: Use when authoring or receiving a LifeOS lane contract — the brief handed to a single implementation, fix, or sweep lane. Covers premise checks, checkpointing, the local validation floor, truth mapping, reach traces, and the report.
---

# lifeos-lane-contract

Per-lane mechanics; each clause was earned by a named failure. `AGENTS.md` "Delivering work" governs scope and evidence. Clauses grow one-in-one-out.

## 1. Evidence ladder

`agent report < file content < running build < deployed app`. Check each contract claim at the highest tier it touches: a claim about rendered or deployed behavior needs a render or a probe, not a grep. A drifted line number means your view is stale. _Why: six wrong contracts in the week of 2026-07-25 asserted from a lower tier than the claim lived at._

## 2. Check premises, then proceed on what you verified

Check the contract's premises against `origin/main` (and a running build where relevant). If one is wrong, say so in one sentence and proceed on the verified reading. _Why: contracts cited reports instead of files._

## 3. Checkpointing

Commit per unit and push after each commit; don't sit on more than ~15 minutes of uncommitted work. Keep any `WORKPLAN.md` untracked. Commit before any `git checkout <ref> -- <path>`. _Why: stream stalls kill agents at random; only cheap failure helps, and a checkout once ate uncommitted edits._

## 4. Local validation floor

CI runs the full floor. Before the first push, also: `pnpm format` (write mode), the full `pnpm test` (scoped runs miss repo-wide guards), and `pnpm build` (catches prerender crashes nothing else sees). Make sure no stale dev server holds the port (check the listener's command line). For UI changes, look at one real screenshot of the changed state and fix what is wrong.

## 5. Truth mapping — copy and UX work

List the safety and truth guarantees the old UI or text carried, and confirm each survives. Verify every claim of state against the code path that produces it. Where words and behavior disagree, make it true or say the truth.

## 6. Reach trace — sweeps

Trace every item to its terminus (user-visible, caught, classifier-load-bearing, or dead) and post the table before rewriting anything. A verified zero is a result; record it so it stays closed.

## 7. Finish, then report

Don't end a turn with your own verification still running; finish it, read it, report. The orchestrator watches CI. _Why: two lanes stalled "waiting" at the finish line; one lost its session before opening the PR._ This skill does not authorize merging; merge authority is `AGENTS.md` "Merge authority".
