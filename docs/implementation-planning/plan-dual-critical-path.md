# Plan — Dual Critical Path (Usability × Enjoyability)

**Adopted:** 2026-07-06 (owner-directed). **Live tracker:** `C:\Users\jaypa\LifeOS-work-map.html` (top two ★ lanes).
**This doc is the stable operating contract** — path definitions, leverage rule, cadence, safety rails. It holds nothing that changes per cycle; per-cycle status lives on the map, not here (one source of truth, no drift).

---

## Priority order (owner, 2026-07-06)

**Strict: ★ Usability > ★ Enjoyability > everything else.**

- **Usability** = *functionality as a baseline* + *ease-of-use, but only up to the point where it doesn't balloon implementation time/cost.* Ship the baseline; add ease-of-use where it's cheap; do **not** gold-plate.
- Because usability's remaining work is largely owner-gated, agent build-capacity serves usability first via the agent-buildable usability items (U4 icons, U2b drift-prevention) and by keeping the owner queue crisp — **then** enjoyability (E1→E3).
- The parked-work rotation is a **small capped slice, subordinate to both paths** — it exists so set-aside work doesn't rot ("due share from time to time"), never ahead of a path item.

## The two fronts

**★ Usability** — *"Can I live in it, on my real data, without breakage or lies?"*
Foundation (reliability floor G1–G4) is DONE. What remains is **owner-gated at the root**, so "pushing usability" means keeping the owner queue crisp and unblocking Jay — not agent build-work.

**★ Enjoyability** — *"Does it act for me? Do I reach for it unprompted?"*
Foundation (moments surface + SP-1..10 polish) is DONE. What remains is **agent-buildable now**: make the system *act* on decisions instead of just recording them, remove nagging, make the brief worth opening.

These are **not two symmetric tracks.** Usability's next moves are owner actions; enjoyability's are build work. The map tags every ★ card with its leverage so this asymmetry stays visible:
`OWNER-DRIVEN` · `AGENT-BUILDABLE` · `USAGE-GATED`.

## The shared linchpin — the live-in-it week

Both fronts converge on **one week of Jay as daily driver**. It cannot start until the owner queue clears (U1 ratify #251, U2 migrations) and prod holds real data (U3 populate). That week is the only place where:
- the S9 data-dependent surfaces (`override_records`, `execution_sessions`) light up — they **cannot** be seeded in CI or smoke; and
- the only honest signal for *what is actually enjoyable vs annoying* is generated.

Build enjoyability features before the week; **validate both fronts during it.**

## Ordered paths (detail + live status on the map)

**Usability:** U1 ratify+close #251 (owner) → U2 apply 4 prod migrations, Drift RED (owner) → U3 populate real context (usage) → U4 PNG PWA icons (agent) → U2b migration-drift prevention (agent; record the learning only after U2 is green, per owner).
**Enjoyability:** E1 close the learning loop / apply-to-planning via additive `duration_profiles` (agent) → E2 scan reads `suggestion_records`, stop re-nagging (agent) → E3 brief worth opening / AI prose drafts (agent) → E4 outbound brief push, Telegram rung-1 (usage / Stage-3 candidate).

## Cadence — due share for parked work

Primary thrust = the two ★ paths. **Each cycle also pulls exactly ONE parked item forward** so nothing rots. Rotation queue (current pick tracked on the map):
distillation #289 → task-map v1 #292 → automation graduations → systems-dynamics guards → orientation-as-surfaces → INV-8 delimiter hardening #448 (owner-gated).

## Safety rails (don't break anything)

- Additive-only schema (NS-INV-2). `duration_profiles` and any new store must be additive.
- Every migration ships through the **Migrations+RLS lane** (the real gate — the sandbox is blind to schema drift).
- No path item skips the **constraint chain** or the **coherence pass** (ADR 0004 / CO-6 gate).
- Deploy stays behind the **one-var revert flag** (`NEXT_PUBLIC_MOMENTS_HOME` pattern).
- Sequential relay + frozen merged contracts (NS-INV-6/7) unchanged.

## Scope note

This restructure lives in the **map + this doc**. GitHub issues (#293 tracker, #292 Stage-2 card) are **not** rewritten — propagating the two-front framing into the issues is a separate, owner-gated step.
