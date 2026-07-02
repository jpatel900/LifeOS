---
name: agentic-research-frontier
description: "Use when choosing what to research or where a project could advance the state of the art in agentic engineering: 'what open problems could we attack', 'is this direction novel or known', 'what would a real result look like here', planning a research thrust, or evaluating whether an ambitious idea has a falsifiable milestone. Pairs with agentic-research-methodology, which governs HOW to run whatever this skill helps you choose."
---

# Agentic Research Frontier

Open problems in agentic engineering where a single disciplined project — one that actually practices this library — can produce results that advance the state of the art. For each: why current common practice (SOTA) falls short, what asset a disciplined project has, the first three concrete steps executable in any repo, and a falsifiable **"you have a result when..."** milestone.

**Everything in this file is labeled OPEN or CANDIDATE.** This skill must model the no-oversell rule itself: these are directions with reasoned promise, not established findings. As of 2026-07-02 the field moves fast — re-check what has since been solved before investing (see Provenance).

**Jargon:** *SOTA* = state of the art, here meaning common best practice, not a leaderboard. *Falsifiable milestone* = a pre-registered outcome that could visibly fail. *Override rate* = how often a human reverses an agent's proposed/executed action.

## When to use / when NOT to use

**Use when:** choosing a research direction, sizing its promise, or forcing an ambitious idea into a falsifiable shape.

**Do NOT use for:**
- HOW to run the experiments (evidence bar, pre-registration, refutation) → `agentic-research-methodology`. Every program below routes through it.
- Claiming results publicly → `agentic-external-positioning` (its claims ladder applies with full force to research claims).
- Day-to-day engineering — none of this file is needed to fix a bug.

## The problems

### 1. Earned autonomy (OPEN)

**Why SOTA fails:** agent autonomy is gated by *static* permission lists — allowlists and approval prompts configured once, by intuition, then never updated by evidence. The human either rubber-stamps (gate theater) or bottlenecks.
**The asset:** a project running `agentic-change-control` accumulates decision data — every propose→approve/override/edit event, per action class.
**First three steps:** (1) Log every approval decision with action class, outcome, and any human edit (a one-file JSONL is enough). (2) Define graduation criteria per class in advance (e.g. N≥20 consecutive non-overridden instances; the ladder's graduation rule). (3) Graduate ONE low-stakes class (e.g. docs-only commits) by the data, and keep logging post-graduation defects.
**You have a result when:** a data-graduated class runs auto-executed for 30+ days with zero overrides/defects, while a matched still-gated class shows the human approving ≥95% unchanged — demonstrating the gate carried no information the data hadn't already captured. Falsified if post-graduation defects exceed the gated baseline.
**Field update (as of 2026-07):** industry now names the endpoint of this ladder the "dark factory" (fully hands-off pipelines; five-level maturity spectrum from human-written through agent-authored-human-reviewed to no-human-review). Practitioner consensus matches this problem's framing: graduation is gated on test-oracle strength — "a weak oracle makes Dark Factory dangerous" — not on model capability. The open question stays open: graduation driven by *decision data* rather than by declaration.

### 2. Self-verification that transfers (OPEN)

**Why SOTA fails:** agents grade their own work in-context; the author's blind spots are the grader's blind spots (see `agentic-context-engineering-reference` §5–6), so "I verified it" correlates weakly with correctness.
**The asset:** externalized verification the author cannot touch — tests, golden suites (`agentic-validation-and-qa`), invariant checks — plus cheap cold-context verifier sessions.
**First three steps:** (1) For one month, tag every shipped agent change as author-verified-only vs cold-verifier-checked. (2) Track escaped defects per bucket. (3) Tighten: verifier receives only the diff + claimed verification report, never the author's reasoning.
**You have a result when:** the cold-verifier bucket shows a pre-registered, significant reduction in escaped defects at acceptable cost overhead — measured, not felt. Falsified if the buckets don't separate (which would itself be a publishable negative: the isolation intuition is wrong at current model strength).

### 3. Durable memory across sessions (OPEN)

**Why SOTA fails:** conversation memory dies at compaction; naive fixes (bigger windows, transcript summaries, vector stores over chat logs) preserve *text* but not *decisions with their evidence* — the summary keeps the conclusion and silently drops the caveat that made it safe.
**The asset:** the files-as-memory discipline: campaign docs with re-verification commands (`agentic-long-horizon-campaign`), the failure chronicle, ADRs.
**First three steps:** (1) Run one real multi-week problem strictly by the campaign protocol. (2) At each session boundary, log re-entry cost: minutes-to-first-productive-action and human words of re-briefing needed. (3) Compare against a control problem run with ad-hoc handoffs.
**You have a result when:** cold sessions pass their next campaign gate with ZERO human re-briefing across N≥10 consecutive resumptions, and re-entry cost stays flat as the campaign ages (ad-hoc control degrades). Falsified if campaign-doc drift (state file says X, repo says Y) recurs despite the re-verification protocol.

### 4. Multi-agent reliability (OPEN)

**Why SOTA fails:** fan-out multiplies throughput and error together; common practice reviews multi-agent output the same way as single-agent output, so defect rates scale with agent count. (This library's own authoring hit the other failure mode: fan-out also multiplies *cost* into rate limits.)
**The asset:** structured handoffs, adversarial reviewer roles, and per-boundary verification (`agentic-context-engineering-reference` §5).
**First three steps:** (1) Pick a decomposable task class you actually repeat (e.g. multi-file refactors). (2) Run matched tasks in both modes — single strong session vs fan-out+adversarial-review — with a pre-registered defect rubric. (3) Count verified defects and total cost per mode.
**You have a result when:** reviewed fan-out beats the single-agent baseline on defect rate at equal-or-better wall-clock, on tasks you pre-registered — not on the anecdote where it happened to shine. Falsified if review overhead eats the parallelism (also worth publishing).

### 5. Skill-library compounding (CANDIDATE — this library is itself the experiment)

**Why SOTA fails:** prompt/skill collections are published and adopted on plausibility; almost nobody measures whether a library actually lifts a smaller model's ceiling, so libraries bloat with unverifiable advice.
**The asset:** you are holding a complete, versioned library with defined scope — an ideal treatment variable.
**First three steps:** (1) Build a held-out suite of ~10 realistic tasks in a repo the library wasn't written from (debugging, onboarding, validation tasks). (2) Pre-register a rubric and margin. (3) Run smaller-tier model with library vs without (library dir removed), matched budgets; grade blind per `agentic-research-methodology` §6. Candidate harness (as of 2026-07): Evalite (mattpocock) ships agent-testing scorers that fit this shape — verify current state before adopting.
**You have a result when:** with-library beats without-library by the pre-registered margin on the held-out suite — and, the stronger claim, approaches the frontier-model-without-library score. Falsified if no separation: the library is decoration, and honesty about that goes in the chronicle.

## Working a problem from this list

1. Pick ONE. A research thrust is a campaign: open a `CAMPAIGN.md` (`agentic-long-horizon-campaign`) with the milestone above as its pre-registered success criterion.
2. Every experiment runs under `agentic-research-methodology` — pre-registration, negatives, assigned refutation. Research thrusts get NO exemption from change control.
3. Results — positive or negative — are written up; negatives go to the chronicle, positives climb the claims ladder (`agentic-external-positioning`) before any public statement.

## Provenance and maintenance

Authored 2026-07-02. Problem selection and "why SOTA fails" characterizations reflect the field as of this date and WILL age; the milestones are designed to remain falsifiable even as tooling changes. Nothing here is an established result — states are OPEN (unattempted at rigor, to this author's knowledge) and CANDIDATE (attemptable immediately with this library).

**Volatile facts, re-verify if this file is old:**
- Whether any problem has since been credibly solved: search recent agentic-engineering literature and major agent-tool release notes before investing (a solved problem here should be demoted to a reference, not re-attempted).
- The premise of #5 (skill libraries unmeasured) and #2 (self-grading weak) are empirical claims about the ecosystem as of 2026-07-02 — re-verify before repeating them.
- Sibling skills referenced: `agentic-research-methodology`, `agentic-external-positioning`, `agentic-change-control`, `agentic-validation-and-qa`, `agentic-long-horizon-campaign`, `agentic-context-engineering-reference`, `agentic-failure-archaeology` — re-verify against the library index.
