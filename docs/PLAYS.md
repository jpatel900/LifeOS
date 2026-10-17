# Plays

The success-side twin of `docs/FAILURES.md`. Moves that worked and why. An entry must change how someone acts. Cap ~15 entries; past that, promote recurring plays to doctrine or a guard and compress them to one line.

---

## Distilled plays (one line + pointer)

- **Patch-paste delivery recovery** — When the work exists but the transport failed, ship the patch over the one channel that works and apply it with `git am`. The issue-comment version (#347-#349) is dead. Current protocol v2 → kick text in `.github/workflows/pipeline-advance.yml`; see `docs/FAILURES.md`.
- **Guard test born with the invariant** — PR #369 shipped the NS-INV-1 guard with the invariant. Promoted 2026-10-17 → `docs/ENGINEERING_INVARIANTS.md` preamble (guard in the same PR, proven by a planted violation).
- **Generate + flag, don't rely on remembering (manual prod-apply gate)** — Keep the human gate and stop relying on memory: generate the artifact and surface the reminder (`pnpm drift:assemble`, PR #453). For migrations this was later replaced by the gated `migration-apply.yml`; the move still applies to any easy-to-forget manual step.

---

_Seeded 2026-07-05 from the first-prod-smoke + delegation-lane session._
