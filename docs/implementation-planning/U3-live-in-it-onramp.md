# U3 → live-in-it week: the on-ramp

_The one gate everything downstream waits on. This turns "populate real data" into a concrete, ordered path, and names what each step lights up. Grounded in the actual surfaces (verified 2026-07-08, session 9). Keep it a brain-dump-and-go, not a planning ritual — the point is to start living in it, not to perfect the data._

## Two prerequisites (both quick)

- **Clear the migration drift** so E1 works in prod — set the `SUPABASE_PROD_MIGRATOR_URL` secret and run Migration Apply (ping me, I'll watch it), or paste `drift-fix-duration-profiles-2026-07-07.sql`. Without it, duration recalibration (E1) can't persist.
- **`OPENAI_API_KEY` is already set** ✓ — so capture-parsing and AI-prose rollups work out of the box.

## The order (each step feeds the next; ~15 min to seed, then just live in it)

1. **Areas + accents** — `Settings → Areas` (or `/areas`). Create your _real_ life areas (job, side project, home, etc.) with their accent colors. **Lights up:** the entire cockpit is area-scoped — nothing else is meaningful until these are real.

2. **Charter per area + your operator profile** — `Settings → Areas`, the two panels. Charter = free text: _what the area is for, its ideal state, season, and constraints._ Operator profile (one global) = _your strengths, weaknesses, and how to compensate._ **Lights up:** both feed the AI context choke point (NS-INV-1) → capture parsing and rollup prose get personalized _immediately_. Empty charters leave the AI prompts byte-identical (no effect), so this is where the assistant starts to feel like it knows you. Highest ratio of effort→payoff.

3. **Brain-dump real thoughts** — `/capture` (or press **C** anywhere). Dump 10–20 real open loops, one per capture. **Lights up:** the AI parser turns each into task/project drafts with a first-move breakdown.

4. **Triage the drafts** — `/triage`. Accept into backlog / someday / reject. **Lights up:** real tasks and projects in real areas.

5. **Plan a real day** — `/calendar`. Accept time-block proposals onto the hour rail; approve the calendar write. **Lights up:** `calendar_blocks` (scheduled) → the Execute focus queue and the Today "Scheduled" count.

6. **Execute for real** — `/execute`. Start focus sessions on your actual blocks; mark outcomes honestly (done / cut-scope / defer). **Lights up:** `execution_sessions` — the _actuals_ that everything learning-related is computed from.

7. **Close the day** — the Close moment (home when it's evening). Log wins (S7), and after a few days approve the weekly rollup (S8, now AI-polished — the new "AI-polished" badge tells you when to scrutinize before approving).

8. **Repeat for ~a week.** The data-dependent surfaces need real cycles to light up:
   - **E1 duration recalibration** — after a few sessions per area, you'll see _"estimated 60m; your actuals run 1.4× → 84m"_ with **Use 84m / Keep 60m**. Accepting retimes the pending block and defaults future ones in that area.
   - **S9 learning loop** — override patterns → policy proposals in Review (E2 makes decided ones stop re-nagging across sessions).
   - **S8 rollups** — weekly per-area highlights/misses, week-over-week, AI-prose (E3).
   - **S7 wins** — the evidence log accrues.

## What "it's working" looks like (the honest enjoyment signal)

By end of week: capture feels faster than a notes app, the plan reflects your real day, recalibration has corrected at least one area's estimates, and a weekly rollup reads back something true you'd forgotten. That's the first honest read on whether LifeOS is worth living in — and the input that shapes Stage 2. Nothing before this week is a real signal.

## Notes

- This is a **brain-dump-and-go**, not a plan-it-perfectly step. Overplanning the seed data is the failure mode — enter roughly-real data fast and let a week of use correct it.
- If any data-entry surface misbehaves as you populate, flag it — that's exactly the kind of real bug the live-in-it week is meant to surface (and the first agent-buildable work that opens up afterward).
