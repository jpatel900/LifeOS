# README — LifeOS vision and roadmap corpus

This curated corpus is important strategic input for LifeOS: it preserves the long-horizon product vision, pressure-tests current doctrine, and supplies candidate roadmap contracts. It is not disposable history. It also is not direct implementation authority: `docs/REQUIREMENTS.md` and ADRs govern builds, and vision ideas enter implementation only through reviewed contract changes. ADR 0005 governs that path.

Last governance reconciliation: 2026-07-15.

## If you are here to BUILD LifeOS things

Read in this order, nothing else first:

1. **vision-execution-companion.md** — curated candidate contracts for every
   vision item: WHAT/LANDS/WHEN/SPEC/DONE-WHEN/NEVER + suggested batch order.
   Use it to prepare requirements and issues, never as standalone build authority.
2. The LifeOS repo's own doctrine (SYSTEM_MAP.md → AGENTS.md → ADR 0002/
   0003 via `git show origin/main:<path>`). Repo doctrine OUTRANKS this
   folder wherever they conflict — flag conflicts, never resolve them.
3. The active plan file for your packet (below), if any.

Hard rules that bind you in every file here: doctrine-first (REQUIREMENTS
/ADRs before code), respect ADR 0005's capability-specific evidence gates,
respect current issue ownership and dependency order, use isolated worktrees,
and escalate unresolved conflicts. Stage labels do not impose blanket waits on
owner-ratified, data-independent foundations.

## If you are here to UNDERSTAND the vision

The four-pass triptych+1, in reading order:

- **vision-fable-final-pass.md** — pass 1: features. Keep/shrink/evolve/
  add. Headliners: Initiative Ladder, Triggers, Compost, Mirror,
  Moments×Map, Rehearsal, Life Archive, apparatus sunset.
- **vision-fable-final-pass-map.html** — one-glance map of pass 1.
- **vision-fable-deeper-pass.md** — pass 2: layers (8 parts). Profile-as-
  hypothesis, voice-as-policy, RUPTURE PROTOCOL, life-arc (retrospective
  only), delight budget, context diet, inference ladder, body-as-weather,
  money boundary, ten-year pre-mortem, top-3 ranking, sanctuary, TRUST
  KERNEL, prosthesis/exoskeleton/teacher, lineage of minds.
- **vision-fable-wider-pass.md** — pass 3: world (W1–W5). Agentic
  perimeter + INJECTION INVARIANT (urgent), second dyad + household
  boundary, sibling harvest (METHOD consulting, RiseUp instantiation,
  doctrine-engineer arc), five novel claims, the operator-only boundary.
- **vision-fable-horizon-pass.md** — pass 4: seams (H1–H7). Purpose
  gauge, council view, deliberations, cadence stack + closure ritual,
  gardens, future self + continuity envelope.

## If you are here to APPLY THE METHOD (any software/org, not LifeOS)

- **THE-METHOD-self-sustaining-systems.md** — the doctrine (6 layers,
  15 axioms, bootstrap Phases 0–5, software↔org translation, failure
  modes, AI cold-start protocol). Self-contained.
- **THE-METHOD-companion-templates.md** — templates T1–T9, deterministic
  phase-exit checklists, worked examples. Copy templates verbatim.
- First real-world instantiation candidate: RiseUp / Mission 3690
  (see execution companion §7c).

## Active build-plan files (pre-vision; still live)

- **plan-moments-shell.md** — P0–P7 structural pass (P0–P6 MERGED as of
  2026-07-05; P7 remains — hot-file, careful session).
- **plan-subtle-polish.md** — SP-1..SP-10 (SP-1/2/3/5/7 MERGED as of
  2026-07-05; verify remainder against git log before starting).
- **plan-daily-driver-floor.md** — G1–G4 (G2/G3/G4 done; G1 remains,
  absorbs #368).
- **plan-coherence-framework.md** — R1–R9 registries, CO-0..7 packets
  (CO-0/6/7 merged; verify others).
- **plan-task-map-contract.md** — FR-031 task node maps v0/v1/v2 (its
  internal "FR-022" label is stale; FR-031 is correct).
- **prototype-1/2-today-home.html** — throwaway UX prototypes (taste
  reference only; never import).
- **lifeos-work-map.html** — session work map. ALSO: a possibly newer
  copy lives at C:\Users\jaypa\LifeOS-work-map.html — check both dates;
  keep whichever is current, per the owner's map-first preference.
- **drift-fix-2026-07-05.sql** — HISTORICAL (applied; drift green).

## Staleness rule

Every status claim in this folder decays. Before acting on any "X is
done/pending" statement: `git log --oneline -15` on the repo, open
PRs/issues, `pnpm status`. Reality outranks this index; when they
disagree, update the doc you caught lying.
