# Plays

The success-side twin of `docs/FAILURES.md`: moves that worked, with WHY they
worked, so agents and the operator reuse them instead of rediscovering them.
Input to the quarterly distillation pass (#289), which mines both chronicles.

**Worthiness bar (same as FAILURES.md):** an entry must change how a future
agent or the operator acts. No activity logs, no "we shipped X" diary lines.

**Anti-bloat governors:** append-only, five fields, no essays. Hard cap ~15
entries: crossing it forces a distillation pass — recurring plays get promoted
to doctrine (checklist line, skill, invariant, or guard test) and their entries
compress to one line + pointer. The chronicle shrinks as doctrine grows.

Entry format: Situation / Move / Why it worked / Evidence / Reuse trigger.

---

## Patch-paste delivery recovery

- **Situation:** Codex cloud completed work but platform-side PR creation failed silently; fresh re-kicks cannot recover a prior task's commits.
- **Move:** Kick asks the still-live task for `git format-patch origin/main --stdout` posted as issue comments; maintainer applies with `git am` in a worktree (author preserved), runs the lanes the sandbox cannot, opens the PR.
- **Why it worked:** The patch travels over the one channel that always works (issue comments), and `git am` keeps attribution and history clean.
- **Evidence:** Proven 3/3 on 2026-07-04 (recovery PRs #347/#348/#349); now the kick template's standard fallback (PR #357).
- **Reuse trigger:** Any delivery lane where the artifact exists but the transport failed.

## Guard test born with the invariant

- **Situation:** S2 had to create the NS-INV-1 single prompt-construction choke point — an invariant that only holds if future code cannot quietly violate it.
- **Move:** The same PR that created the module shipped a repo-scanning guard test (construction-marker sentinel + `role: "system"` regex over all production sources) that fails CI on any second construction site.
- **Why it worked:** The invariant is enforced by CI from birth — violation is a red build, not a review-time hope. Same pattern as the doc-registry and migration-timestamp guards.
- **Evidence:** PR #369, `contextAssemblyChokePoint.test.ts`.
- **Reuse trigger:** Any new invariant whose violation is textually detectable — ship the guard in the PR that births the invariant, never later.

## Verify-not-redo on collision

- **Situation:** A retry agent found its assigned branch/PR already existed from an earlier interrupted attempt.
- **Move:** It verified the existing work against the contract and added only a targeted improvement commit, instead of re-implementing.
- **Evidence:** PR #356 second commit (2026-07-04).
- **Why it worked:** Treating existing artifacts as probably-valid-until-checked avoids duplicate work and merge ambiguity; the contract makes verification cheap.
- **Reuse trigger:** Any agent discovering its target already partially exists — verify against the contract first, then diff-fix.

## Harmony matrix before implementation

- **Situation:** Five plan streams in flight (Stage 1 relay, constraint layer, daily-driver floor, moments shell, task map) with real conflict potential.
- **Move:** The floor plan was required to produce an explicit feature × feature/invariant matrix where every CONFLICT cell carries a resolution, before any packet was cut.
- **Why it worked:** Conflicts got resolved at planning cost (minutes) instead of implementation cost (rework); the matrix doubles as seed data for the coherence registry.
- **Evidence:** `plan-daily-driver-floor.md` (2026-07-05) — caught the G1/C5 same-surface merge and the amnesty/no-silent-writes tension before code existed.
- **Reuse trigger:** Any plan touching surfaces another in-flight stream also touches.

## Loud one-line logging turned an outage diagnosable

- **Situation:** Prod parse 502s with zero server-side signal (observability adapters unconfigured; captureError a silent no-op).
- **Move:** One sanitized `console.error` line in the catch path — shipped same-day as a micro-PR.
- **Why it worked:** Console output needs no adapter, no vendor, no config; the very next probe returned the provider's HTTP status and settled quota-vs-key definitively.
- **Evidence:** PR #361; the `429` log line of 2026-07-05.
- **Reuse trigger:** Any catch-and-degrade path — the degrade may be silent for the user, never for the operator.

---

_Seeded 2026-07-05 from the first-prod-smoke + delegation-lane session._
