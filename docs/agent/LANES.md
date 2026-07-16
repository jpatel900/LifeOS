# LANES.md — cross-harness coordination protocol (stable rules only)

Two agentic harnesses work this repo in parallel: the **Claude lane** and the
**Codex lane**. This file holds the STABLE rules of engagement. It must never
contain current tasks, branches, commits, or status — live state lives on
GitHub (single-home rule below). If this file and a live GitHub claim seem to
disagree about a boundary, surface the contradiction on the issue; do not
resolve it silently.

## Single-home rule

Every fact has exactly one authoritative home. Do not copy status across
surfaces — copies drift.

| Surface            | What belongs there                                                        |
| ------------------ | ------------------------------------------------------------------------- |
| `LANES.md` (this)  | Stable lane boundaries, red-zone rules, claim formats, collision protocol |
| Issue body         | Frozen task contract: authority anchors, acceptance criteria, touch sets  |
| Issue comments     | Claims, ACKs, collisions, blockers, verification handoffs                 |
| Draft PR           | Live implementation truth: actual files, commits, dependencies, evidence  |
| PR review comments | Cross-lane review findings (authoring lane fixes its own branch)          |
| ADRs               | Durable architecture/product decisions                                    |
| `PROJECT_STATE.md` | Materially changed shipped state                                          |

`docs/agent/HANDOVER.md` is Claude-lane session continuity only — never a
cross-lane communication bus.

## Lane definitions

- **Claude lane:** visual/experience work, architecture and doctrine-sensitive
  changes, contract authoring for both lanes, final verification (including the
  visual/experience gate), ALL merges (both lanes' PRs), continuity.
- **Codex lane:** contracted implementation with text-verifiable results (pure
  logic, data layer, guard tests, e2e specs), standing audits, second opinions
  on design notes.

**Root orchestrators only** write GitHub comments. Both lanes delegate
implementation to bounded subagents; subagents report internally to their root
and never claim issues or post status themselves.

## Red zones (Claude-lane-edit-only shared surfaces)

`apps/web/src/lib/WorkflowContext.tsx` · `momentsViewModel.ts` ·
`lib/cockpit/viewModel.ts` · `packages/schemas/**` · route/page files ·
`.github/workflows/**` · migrations/RLS · `docs/REQUIREMENTS.md` ·
`docs/UX_FLOWS.md` · `docs/adr/**`.

The Codex lane builds against these, never edits them. A scoped exception may
be granted per-issue by an explicit Claude-root comment on that issue naming
the exact file(s) and block(s); the exception dies with the issue.

## Claim protocol (issue comments, meaningful state changes only)

Comment only on: claim · ACK/collision · blocker or scope change ·
implementation handoff · verification result · claim release/completion.
No hourly chatter.

### CLAIM v1

```text
CLAIM v1
Lane: claude | codex
Orchestrator: <root>
Implementer: <subagent identifier>
Verifier: pending | <identifier>
Branch: <branch>
Base: <sha>
Claimed at / Claim until: <UTC>
Authority:
- <requirement/ADR/invariant>
Owned outcome:
- <one measurable outcome>
Expected touch set:
- <files or narrow globs>
Forbidden touch set:
- <other lane's files, red zones>
Shared contracts/red zones:
- <files/interfaces or none>
Dependencies:
- <issue/PR or none>
```

### ACK v1 (other lane, after overlap check)

```text
ACK v1
Lane: <acknowledging lane>
Issue: #<n>
Overlap check: no file or semantic overlap found
Checked against:
- branch <branch> / commit <sha> / touch set <summary>
```

### Pre-ACK (blocking-latency rule, owner-directed 2026-07-16)

A blocked lane is wasted lane capacity. Two mechanisms keep waits near zero:

1. **Pre-ACK in the contract.** When the issue body is authored by the
   Claude root and freezes an exact touch set, it may include a `PRE-ACK`
   line: _"Pre-ACKed: a CLAIM whose expected touch set exactly matches this
   manifest needs no further ACK — post the CLAIM and proceed."_ The overlap
   check happens once, at contract-authoring time, against live PRs/claims/
   red zones. A CLAIM that deviates from the frozen manifest in ANY way
   (extra file, widened glob, new dependency) forfeits the pre-ACK and waits
   for a normal ACK/COLLISION. Pre-ACK never applies to red-zone files or
   migrations/RLS.
2. **Response SLA.** The Claude lane answers pending CLAIM / BLOCKER /
   HANDOFF comments as the FIRST action of every session, at every session
   checkpoint, and in the daily driver run — before starting or resuming its
   own work. Harvesting a delivered HANDOFF outranks in-progress Claude-lane
   work. If an answer needs an owner decision, the Claude lane says so on
   the issue explicitly (so the blocked lane knows the wait is owner-side,
   not protocol-side).

### COLLISION v1 (instead of ACK when overlap exists)

```text
COLLISION v1
Type: file | contract | journey
Overlap:
- <exact file, requirement, or state transition>
Decision required: serialize | interface-first | single integration owner | owner product decision
Both lanes stop this slice until resolved.
```

### HANDOFF v1 (implementation → verification)

```text
HANDOFF v1
Issue: #<n>
Commit: <sha>
Changed files: ...
Evidence: <command> → <decisive output>
UNVERIFIED: ...
Other-lane review requested: usability/accessibility | contract/regression
```

## Collision matrix

| Situation                                       | Rule                                                   |
| ----------------------------------------------- | ------------------------------------------------------ |
| Same file                                       | Serialize; declare merge order in the claim            |
| Different files, same contract/state transition | Agree the interface first; name one integration owner  |
| Different files, independent contracts          | Parallel work allowed                                  |
| Dependent work                                  | `Depends on #<PR>` + stacked branch; never cherry-pick |

Overlap detection covers BOTH file intersection and semantic intersection
(same requirement, state transition, interface, or user journey). Absence of a
merge conflict does not prove independence.

## PRs

Open a draft PR as soon as work is pushed — the draft's file set is the live
touch-set broadcast the other lane diffs against. Before every commit and
before marking a PR ready, each root refreshes: open PRs, claims, the other
lane's branch SHA, actual changed-file intersections, shared
requirement/state-transition intersections.

PR body fields: Issue · Lane · Depends on · Base SHA · Authority anchors ·
Declared file manifest · Forbidden files confirmed untouched (yes/no) ·
Cross-lane overlap checked at (UTC + other branch SHA) · Validation evidence ·
NOT VERIFIED · Risk and rollback.

## Verification and integration ownership

Each lane's root verifies its own subagents' work (Claude adds the
visual/experience gate on anything rendered). Cross-lane review is read-only:
Claude reviews Codex PRs for usability/interaction/a11y; Codex reviews Claude
PRs for contract/regression. The authoring lane fixes its own branch; neither
lane edits the other's branch.

**Integration ownership:** Claude lane is the single integration point — it
harvests, applies, independently verifies, and merges Codex-lane work
(Codex-authored deliveries may be patch-only with no PR; the harvest replaces
the PR flow). Claude-AUTHORED PRs remain owner-merged under the existing
self-approval classifier — Claude prepares them (evidence complete, checks
green, marked ready) but does not merge its own work.

When a dependency lands, the integrating root posts on the dependent
issue/PR:

```text
DEPENDENCY-INTEGRATED v1
Dependency: #<issue>
Source commit: <sha of the delivering lane's commit>
Applied as: <integrating-branch SHA>
Base: <current origin/main SHA>
Verification:
- <commands and decisive output>
Overlap result:
- <what was retained unchanged / what stays separately attributable>
Integration status: clear | blocked
```

## Claim release

A claim is released by a completion comment (verification result + merged PR
link) or an explicit release comment when abandoning; a lapsed `Claim until`
with no activity means the other lane may post a takeover notice and proceed
after a reasonable wait. Never silently adopt another lane's claimed issue.
