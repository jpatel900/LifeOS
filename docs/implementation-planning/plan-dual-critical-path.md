# Plan — Dual Critical Path (Usability × Enjoyability)

**Preserved strategy:** 2026-07-06 (owner-directed). **Status:** non-authoritative planning snapshot.
The path definitions and feature ideas remain active strategic input for one-by-one disposition. Current shipped status lives in `docs/PROJECT_STATE.md`; implementation authority lives in REQUIREMENTS, ADRs, and live owner-ratified issues. Do not use the external work map or this snapshot as current execution state.

---

## Priority order (owner, 2026-07-06)

**Strict: ★ Usability > ★ Enjoyability > everything else.**

- **Usability** = _functionality as a baseline_ + _ease-of-use, but only up to the point where it doesn't balloon implementation time/cost._ Ship the baseline; add ease-of-use where it's cheap; do **not** gold-plate.
- Historical allocation (2026-07-06): usability was assessed as largely owner-gated, with U4 icons and U2b drift-prevention identified as agent-buildable before enjoyability E1→E3. Reclassify every remaining item against current `PROJECT_STATE`, live claims/issues, ADR 0005, and the vision-disposition protocol before assigning owner or agent work.
- The parked-work rotation is a **small capped slice, subordinate to both paths** — it exists so set-aside work doesn't rot ("due share from time to time"), never ahead of a path item.

## The two fronts

**★ Usability** — _"Can I live in it, on my real data, without breakage or lies?"_
Historical snapshot: the reliability floor G1–G4 was recorded as done and the remaining usability work as owner-gated. This is not a current restriction on agent build-work; verify shipped state and classify each candidate's real dependencies and risk gates before disposition.

**★ Enjoyability** — _"Does it act for me? Do I reach for it unprompted?"_
Historical snapshot: the moments surface + SP-1..10 polish was recorded as done and the remaining enjoyability work as agent-buildable. Re-verify each claim and candidate against current code, `PROJECT_STATE`, and live issues before contracting it.

The original plan treated these as asymmetric tracks and tagged each card with its then-current leverage. Those tags are historical classifications, not standing assignments; the disposition protocol determines current ownership and gates:
`OWNER-DRIVEN` · `AGENT-BUILDABLE` · `USAGE-GATED`.

## The shared linchpin — the live-in-it week

Both fronts converge on **one week of Jay as daily driver**. It cannot start until the owner queue clears (U1 ratify #251, U2 migrations) and prod holds real data (U3 populate). That week is the only place where:

- the S9 data-dependent surfaces (`override_records`, `execution_sessions`) light up — they **cannot** be seeded in CI or smoke; and
- the only honest signal for _what is actually enjoyable vs annoying_ is generated.

Build enjoyability features before the week; **validate both fronts during it.**

## Ordered paths (historical proposal; re-verify before contracting)

**Usability:** U1 ratify+close #251 (owner) → U2 apply 4 prod migrations, Drift RED (owner) → U3 populate real context (usage) → U4 PNG PWA icons (agent) → U2b migration-drift prevention (agent; record the learning only after U2 is green, per owner).
**Enjoyability:** E1 close the learning loop / apply-to-planning via additive `duration_profiles` (agent) → E2 scan reads `suggestion_records`, stop re-nagging (agent) → E3 brief worth opening / AI prose drafts (agent) → E4 outbound brief push, Telegram rung-1 (usage / Stage-3 candidate).

## Cadence — due share for parked work

The proposal used the two ★ paths as its primary thrust and pulled one parked item per cycle. Preserve this queue as candidates; select each future item through the current vision-disposition and issue protocol:
distillation #289 → task-map v1 #292 → automation graduations → systems-dynamics guards → orientation-as-surfaces → INV-8 delimiter hardening #448 (owner-gated).

## Safety rails (don't break anything)

- Additive-only schema (NS-INV-2). `duration_profiles` and any new store must be additive.
- Every migration ships through the **Migrations+RLS lane** (the real gate — the sandbox is blind to schema drift).
- No path item skips the **constraint chain** or the **coherence pass** (ADR 0004 / CO-6 gate).
- Deploy stays behind the **one-var revert flag** (`NEXT_PUBLIC_MOMENTS_HOME` pattern).
- Sequential relay + frozen merged contracts (NS-INV-6/7) unchanged.

## Scope note

This snapshot does not update GitHub issues or current status. Reconcile each candidate with current REQUIREMENTS, ADR 0005, and live issues before implementation.
