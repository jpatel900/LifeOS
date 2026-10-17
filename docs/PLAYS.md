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

## Distilled plays (one line + pointer)

- **Patch-paste delivery recovery** — When the work exists but the transport failed, ship the patch over the one channel that works and apply it with `git am`. The issue-comment version (#347-#349) is dead. Current protocol v2 → kick text in `.github/workflows/pipeline-advance.yml`; see `docs/FAILURES.md`.
- **Guard test born with the invariant** — PR #369 shipped the NS-INV-1 guard with the invariant. Promoted 2026-10-17 → `docs/ENGINEERING_INVARIANTS.md` preamble (guard in the same PR, proven by a planted violation).
- **Generate + flag, don't rely on remembering (manual prod-apply gate)** — Keep the human gate and stop relying on memory: generate the artifact and surface the reminder (`pnpm drift:assemble`, PR #453). For migrations this was later replaced by the gated `migration-apply.yml`; the move still applies to any easy-to-forget manual step.

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
