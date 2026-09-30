---
name: lifeos-lane-contract
description: Use when authoring or receiving a LifeOS lane contract — the brief handed to a single implementation, fix, or sweep lane. Covers premise checks, checkpointing, the validation floor, guard handling, and the report.
---

# lifeos-lane-contract

Per-lane mechanics. Each clause was earned by a named failure. `AGENTS.md` rule 13
applies: deliver the full intended scope; skip any step here that would stop or
shrink the work without protecting a red line.

**Growth rule:** clauses grow one-in-one-out. Adding a clause means retiring or
merging one. A new failure an existing clause already covers sharpens that clause.

## When to use

- Authoring any implementation, fix, or sweep lane contract.
- Receiving one. Read it before setup.

Companion: `lifeos-stage-contract-authoring` is wave-level scoping (ADR 0005,
`docs/adr/0005-staged-evolution-after-v1.md`). This skill is the per-lane
mechanics inside one slice. Skip it for a true one-liner.

## Process

### 1. Evidence ladder

`agent report < file content < running build < deployed app`. Check each contract
claim at the highest tier it touches: a claim about rendered or deployed behavior
needs a render or a probe, not a grep. A drifted line number means your view is
stale, so re-read the cited line. _Why: six wrong contracts in the week of
2026-07-25 asserted from a lower tier than the claim lived at._

### 2. Check premises early, then proceed on what you verified

Check the contract's premises against `origin/main` (and a running build where
relevant) before building on them. If one is wrong, say so in one sentence and
proceed on the verified reading. Pause only if the choice is irreversible,
crosses an `AGENTS.md` red line, or changes what the product is for. If a skill
or repo doc contradicts the contract, say so. _Why: contracts cited reports
instead of files._

### 3. Skills

Name the skills to load. The routing table lives in `AGENTS.md`; repo-local
`.agents/skills` beat general ones, and `lifeos-*` beat `agentic-*`. UI lanes
use `frontend-ui-engineering`. Cockpit UI can read `design_handoff_lifeos/README.md`
as a historical design reference; requirements, UX flows, ADRs, and verified
shipped behavior stay authoritative.

### 4. Checkpointing

`WORKPLAN.md` lives outside the repo root (the docRegistry guard flags root
markdown). Commit per unit and push after each commit. Don't sit on more than
~15 minutes of uncommitted work. Commit before any `git checkout <ref> -- <path>`.
_Why: lost work, and a checkout that ate uncommitted edits._

### 5. Validation floor

CI runs the full floor. Locally, before the first push:

- `pnpm format` (write, not check).
- Full `pnpm test` — scoped runs miss repo-wide guards.
- `pnpm build` — catches prerender crashes nothing else sees.
- `pnpm lint`, `pnpm type-check`, `prettier --check`.
- Vitest uses the threads pool on Windows.
- Pin calendar/clock-dependent moments in specs.
- Check that no stale dev server holds the port (look at the listener's commandline).

For UI changes: look at one real screenshot of the changed state and fix what is
wrong.

### 6. Guards are sacred

Never weaken, skip, or re-anchor-to-nothing a test to get green. A test asserting
removed behavior gets re-anchored to the new truth, not deleted. Never use an
exemption hatch (for example the plain-language guard's developer-layer marker)
to make a number look better. Ratchets move by strict equality, deliberately.

### 7. Truth mapping — copy and UX work

List the safety and truth guarantees the old UI or text carried, and confirm each
survives. Verify every claim of state against the code path that produces it.
Where words and behavior disagree, say so in one sentence and proceed on the
verified reading (make it true, or say the truth). Pause only if that choice is
irreversible, crosses a red line, or changes what the product is for.

### 8. Reach trace — sweeps

Trace every item to its terminus — user-visible, caught, classifier-load-bearing,
or dead — and post the table before rewriting anything. A verified zero is a
successful result; record it so it stays closed.

### 9. Report

Evidence only, per `AGENTS.md` rule 11: each "it works" claim carries the exact
command and observed output. List UNVERIFIED items with the exact command that
would prove each. UNVERIFIED means not proven, not not done.

Never park a lane and wait. No Monitors, no "waiting for a notification", no
ending a turn with verification still running in the background. Run remaining
checks in the foreground, read the output, report, and end. The orchestrator
watches CI. _Why: two lanes (2026-07-25/26) stalled at the finish line "waiting";
one lost its session before opening the PR._

### 10. PR hygiene

Draft early. Use the literal `closes #N`. Follow-ups appear only as
`- [ ] AGENT-TODO:` or `- [ ] OWNER-GATE:` checkboxes, never free prose.
Owner-gates carry plain options with short- and long-term impact and trade-offs.

## Red flags

- A completion claim with no command output beside it.
- A scoped test run standing in for the full suite.
- A diff that quiets a guard rather than satisfying it.
- Free-text "the owner should…" instead of an OWNER-GATE checkbox.
- "A grep proves the UI." It proves a string exists in a file.

## Authority

- `AGENTS.md`, the authority docs, and direct owner instructions override this skill.
- It does not authorize weakening guards, editing ADRs, or bypassing the
  external-write, RLS, schema, or secrets rules.
- It does not authorize merging: agent-authored PRs are OWNER-GATE (`AGENTS.md` rule 11).
