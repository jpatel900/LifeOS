---
name: agentic-long-horizon-campaign
description: "Use when a hard problem will span multiple sessions, agents, or context compactions and you must not lose state or drift — e.g. 'continue the migration', 'pick up where the last session left off', 'this bug hunt has taken three days', 'resume the campaign', 'multi-session refactor', 'the agent keeps forgetting what was tried'. Also when starting any task you estimate cannot finish in one context window, or when re-entering a repo that contains a CAMPAIGN.md."
---

# agentic-long-horizon-campaign

The executable campaign method for problems too big for one session. The core failure mode of long-horizon agentic work is drift: each new session (or post-compaction continuation) reconstructs the problem from partial memory, re-fights settled battles, and silently changes the goal. The countermeasure is a single in-repo state file — `CAMPAIGN.md` — that is more authoritative than any session's memory, plus a re-entry protocol that forces re-verification before continuation, and gates that make progress falsifiable. A campaign is finished when its success criterion (fixed at the start) is demonstrated, never when the work "feels done".

**Jargon defined once:** *Session* = one continuous run of an agent with one context window. *Compaction* = the agent tool summarizing/truncating its own context mid-session; treat post-compaction as a new session. *Gate* = a checkpoint whose passage requires reproducing a specific, pre-declared observation. *Drift* = any divergence between what is being worked on and what the campaign doc says should be worked on.

## When to use / when NOT to use

| Situation | Verdict |
|---|---|
| Task will plausibly span >1 session or >1 agent | USE — start a campaign before writing code |
| You just entered a repo containing `CAMPAIGN.md` | USE — run the re-entry protocol below |
| Context was compacted mid-task and continuation feels fuzzy | USE — treat as cold re-entry |
| A bug you expect to fix within this session | DO NOT — use **agentic-debugging-playbook** |
| Recording *why* a past approach failed, for posterity beyond one campaign | DO NOT duplicate — the project-wide chronicle belongs to **agentic-failure-archaeology**; the campaign's wrong-paths section covers only this campaign |
| Deciding how the finished result merges into the codebase | Not here — **agentic-change-control** owns merge gating; this skill only says results must go through it |
| Defining what counts as proof at the final gate | Thresholds and evidence standards live in **agentic-validation-and-qa** |
| First contact with an unfamiliar repo | Do **agentic-project-onboarding** first, then start the campaign |

Heuristic (default, not hard rule): if you estimate the task at more than ~2 hours of agent work or more than ~3 distinct phases, open a campaign. The cost of an unnecessary CAMPAIGN.md is minutes; the cost of a lost session is the session.

## 1. Starting a campaign

Do this BEFORE any implementation work:

1. Create the file at repo root (or the project's docs-of-record location per **agentic-docs-and-writing**):

   ```bash
   # bash
   test -f CAMPAIGN.md && echo "CAMPAIGN EXISTS - run re-entry protocol instead" || touch CAMPAIGN.md
   ```
   ```powershell
   # PowerShell
   if (Test-Path CAMPAIGN.md) { "CAMPAIGN EXISTS - run re-entry protocol instead" } else { New-Item -ItemType File CAMPAIGN.md }
   ```

2. Fill in the template from section 7. The two parts you must get right on day one:
   - **Success criterion**: measurable, checkable by a command or a number, fixed now. "Parser handles all 14 fixture files with zero diffs against golden output" — not "parser works better". If you cannot state a measurable criterion, the campaign is not ready to start; do the analysis first (**agentic-proof-and-analysis-toolkit** for how to turn a hunch into a testable claim).
   - **Solution menu** (section 4): enumerate candidate approaches before committing to one.

3. Commit the campaign file itself so every future session sees it:

   ```bash
   git add CAMPAIGN.md && git commit -m "campaign: open <short-name>"
   ```

4. If your agent tool has a persistent memory file (CLAUDE.md / AGENTS.md / .cursor/rules), add one line pointing at it: `Active campaign: see CAMPAIGN.md — run its re-entry protocol before working on <topic>.` Do not duplicate campaign content there; one home per fact.

## 2. The campaign artifact — required sections

`CAMPAIGN.md` has exactly these six sections. Full template in section 7.

| Section | Rule |
|---|---|
| **Objective** | One sentence + the measurable success criterion + the exact command that checks it. Frozen after day one; changing it requires a dated decision-log entry explaining why. |
| **Solution menu** | Ranked candidate approaches, each with its proof obligation (section 4). |
| **Phases** | Numbered. Each phase = exact commands + EXPECTED observation at the gate + branch instructions ("if you see X instead of Y → go to phase N / stop and record"). |
| **Current state** | Updated at EVERY session end (section 5). Contains re-verification commands. |
| **Decision log** | Dated, append-only. Never edit or delete old entries; append corrections. |
| **Wrong paths** | Fenced-off list: what was attempted, why it failed (with evidence), and "do not retry without new evidence". |

Hard rules:

- **Append-only history.** The decision log and wrong-paths sections only grow. Rewriting history is how the next session re-fights a settled battle.
- **Commands, not descriptions.** "Run the integration tests" is useless to a cold session. `npm test -- --grep integration` (or whatever the repo's real command is — discover it via `cat package.json` / `cat Makefile` / the repo's docs per **agentic-project-onboarding**) is executable.
- **Observations are pasted, not paraphrased.** A gate log entry contains actual command output (trimmed to the relevant lines), because paraphrases hide the discrepancies that matter.

## 3. Gate discipline

A *gate* is the exit condition of a phase. Rules (all hard):

1. A phase is passed ONLY when its pre-declared expected observation is **reproduced and pasted** into the decision log, with date and the command that produced it.
2. **No skipping gates because "it's probably fine".** If the gate command is expensive, that was a design error in the phase — split the phase, don't skip the gate.
3. If the observation differs from expected, follow the phase's branch instruction. If the phase has no branch covering what you see: STOP, record the anomaly in the decision log, and either amend the phase (dated log entry) or escalate to the human. Do not improvise silently.
4. Gates are declared BEFORE running the command. Writing the expected observation after seeing the output is gate-gaming — the campaign equivalent of the anti-test-gaming rule in **agentic-validation-and-qa**.
5. The final gate is always the success criterion from the Objective, verbatim. Success is measured against it, never judged by eye.

Branch-instruction grammar to use in phases:

```
GATE: run <command>
EXPECT: <specific observation, e.g. "exit 0 and line `14 passed, 0 failed`">
IF EXPECTED    -> mark phase passed in log, proceed to phase N+1
IF <symptom A> -> go to phase <M> (it means <diagnosis>)
IF anything else -> STOP. Paste output into decision log. Do not proceed.
```

## 4. Solution-menu pattern

Before implementing anything, enumerate the candidate approaches in the campaign doc:

| Rank | Approach | Proof obligation (what must be demonstrated BEFORE adopting it) | Status |
|---|---|---|---|
| 1 | `<approach>` | `<e.g. "spike shows round-trip on 3 fixture files">` | active |
| 2 | `<approach>` | `<...>` | untried |
| 3 | `<approach>` | `<...>` | untried |

Rules:

- **Work the top-ranked approach to its gate before touching the second.** Parallel half-attempts are how campaigns produce three broken branches and no knowledge.
- An approach's *proof obligation* is a small demonstration that the approach can work at all — a spike, a minimal repro of the key mechanism (**agentic-proof-and-analysis-toolkit** has the recipes). Adopting an approach without meeting its proof obligation is a recorded decision, not a default.
- When an approach fails: move it to **Wrong paths** with the evidence, promote the next candidate, log the decision. Never delete it from the menu — mark it `failed → see wrong paths`.
- Re-ranking the menu is allowed any time, with a dated log entry stating the new evidence that justified it.

## 5. Session-end protocol

At the end of EVERY session (and immediately before any handoff or expected compaction), update the **Current state** block to contain:

1. Which phase is active and which gates have been passed (with log dates).
2. Every claim about the world that the next session will rely on ("branch `campaign/x` builds clean", "fixture 9 still fails") — each with a **re-verification command** next to it.
3. Uncommitted/loose ends: stashes, untracked files, half-edits. Best default: commit work-in-progress to the campaign branch so state lives in git, not in a working tree that may be reset:

   ```bash
   git add -A && git commit -m "campaign wip: <phase> - <one-line state>"
   ```

4. The single next action, as an exact command or an exact edit target.

Then commit CAMPAIGN.md itself. An un-committed state block does not exist as far as the next session is concerned.

## 6. Re-entry protocol (cold session or post-compaction)

Run this whenever you start work in a repo with a CAMPAIGN.md, or after compaction. Hard rule: **proceed from the current gate, never from memory.**

```
[ ] 1. Read CAMPAIGN.md top-to-bottom. Yes, all of it. Wrong-paths especially.
[ ] 2. Check repo reality:
        git status
        git log --oneline -15
        git stash list
        git branch --show-current
[ ] 3. Re-verify EVERY claim in the Current state block by running its
       re-verification command. State files drift too: the repo may have
       moved, a dependency may have updated, a human may have intervened.
[ ] 4. Any claim that fails re-verification: record the discrepancy in the
       decision log BEFORE doing anything else, and update the state block.
[ ] 5. Resume at the active phase, at its last unpassed gate.
```

If steps 3–4 reveal the world has changed materially (criterion already met, approach invalidated, files gone), treat it as a branch-instruction miss: stop, log, re-plan explicitly. Never "patch around" a stale state block.

## 7. Drift alarms

- If you notice yourself doing work not covered by any phase: **STOP.** That is scope drift. Two legal moves only: (a) amend the campaign doc explicitly — add/modify a phase with a dated decision-log entry — or (b) drop the work. If it's genuinely valuable but out of scope, record it as a one-line "parked" note in the decision log or flag it for a separate task.
- If two sessions in a row end without passing a gate, the phases are too big. Split the active phase into smaller phases with cheaper gates. (Default guidance, not hard rule: a phase should be passable within one session.)
- If you catch yourself re-attempting anything in Wrong paths, stop and re-read its entry. Retrying requires new evidence, stated in the log, that invalidates the recorded failure reason.

## 8. Promotion — how campaign results enter the codebase

Campaign work happens on its own branch(es). Results are promoted only through normal change control:

1. Final gate passed: success-criterion command output pasted into the decision log.
2. Validation per **agentic-validation-and-qa** (evidence standards, thresholds set in advance).
3. Merge via **agentic-change-control** (risk tiering, PR hygiene, one-way-door checks). The campaign gets no special bypass because it was long or hard.
4. Close-out: mark the campaign `CLOSED (success|abandoned)` at the top of CAMPAIGN.md with date and final evidence; migrate durable lessons (failed approaches worth remembering project-wide) into the failure chronicle per **agentic-failure-archaeology**; then archive or delete CAMPAIGN.md per the project's doc policy.

## 9. Worked CAMPAIGN.md template

Copy this verbatim into a new campaign and replace placeholders. Discovery commands for placeholders: build/test commands → `cat package.json` / `cat Makefile` / `ls *.toml *.gradle* *.csproj 2>/dev/null`; default branch → `git remote show origin | grep "HEAD branch"` (bash) or `git symbolic-ref refs/remotes/origin/HEAD` (either shell).

````markdown
# CAMPAIGN: <short-name>
STATUS: OPEN            <!-- OPEN | CLOSED (success) | CLOSED (abandoned) -->
OPENED: <YYYY-MM-DD>    OWNER: <human or team who arbitrates scope changes>
BRANCH: campaign/<short-name>

## Objective
<One sentence: what this campaign delivers.>
SUCCESS CRITERION (frozen <YYYY-MM-DD>):
  <measurable statement, e.g. "all 14 files under fixtures/ produce zero
  diff against golden/ output">
CHECK COMMAND:
  <exact command, e.g. `<test-runner> --suite golden` — must exit 0>

## Solution menu
| Rank | Approach | Proof obligation | Status |
|---|---|---|---|
| 1 | <approach A> | <spike/demo required before adopting> | active |
| 2 | <approach B> | <...> | untried |

## Phases
### Phase 1: <name>
DO:
  <exact command or exact edit, one per line>
GATE: run `<command>`
EXPECT: <specific output/observation>
IF EXPECTED       -> log it, go to Phase 2
IF <symptom>      -> go to Phase <N> (<diagnosis>)
IF anything else  -> STOP, paste output to decision log

### Phase 2: <name>
...

### Phase FINAL: demonstrate success criterion
GATE: run the CHECK COMMAND from Objective
EXPECT: <the frozen criterion, verbatim>
IF EXPECTED       -> proceed to promotion (agentic-change-control)
IF anything else  -> STOP, log, re-plan

## Current state  <!-- OVERWRITE at every session end; everything else is append-only -->
AS OF: <YYYY-MM-DD HH:MM UTC>   ACTIVE PHASE: <n>
CLAIMS (re-verify each on re-entry):
  - <claim>            | verify: `<command>` | expect: <observation>
  - <claim>            | verify: `<command>` | expect: <observation>
LOOSE ENDS: <stashes, untracked files, or "none">
NEXT ACTION: <exact command or exact edit target>

## Decision log  <!-- append-only, never edit past entries -->
- <YYYY-MM-DD> Campaign opened. Criterion frozen as above.
- <YYYY-MM-DD> Phase 1 gate PASSED. Output:
  ```
  <pasted trimmed output>
  ```
- <YYYY-MM-DD> <decision + evidence>

## Wrong paths  <!-- append-only; do not retry without new evidence -->
- <approach/tactic>: attempted <date>. Failed because <evidence, pasted or
  linked>. DO NOT RETRY unless <what new evidence would justify retrying>.
````

Timestamp helpers for the state block: `date -u +"%Y-%m-%d %H:%M UTC"` (bash) / `Get-Date -AsUTC -Format "yyyy-MM-dd HH:mm 'UTC'"` (PowerShell 7+).

## Provenance and maintenance

- Authored 2026-07-02 as part of the agentic-engineering skill library.
- The method (state file + gates + re-entry re-verification) is practice-derived; the specific thresholds ("~2 hours / ~3 phases", "gate per session") are defaults/heuristics, not measured constants — recalibrate against your own campaign post-mortems.
- Volatile facts: none load-bearing. All commands used are core git (`git status`, `git log --oneline`, `git stash list`, `git branch --show-current`, `git remote show`, `git symbolic-ref`) and core shell (`date`, `Get-Date`) — stable across versions. Re-verify any of them with `git <subcommand> -h` if in doubt.
- Sibling-skill names referenced here (agentic-debugging-playbook, agentic-change-control, agentic-validation-and-qa, agentic-failure-archaeology, agentic-proof-and-analysis-toolkit, agentic-docs-and-writing, agentic-project-onboarding) may drift if the library is renamed; re-verify with a directory listing of the skill library root.
