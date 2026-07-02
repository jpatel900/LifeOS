---
name: agentic-failure-archaeology
description: "Use when starting work in a repo with history you did not write, before investigating any recurring symptom, after any revert / abandoned branch / multi-hour dead-end investigation, or when asked to 'check if we tried this before', 'why was this reverted', 'set up a FAILURES.md', or 'mine the repo for past failures'. Maintains the project failure chronicle so no settled battle is re-fought."
---

# Agentic Failure Archaeology

Multi-session agent work loses its memory between sessions. The single biggest waste in that mode is re-fighting a settled battle: re-trying an approach that was already tried and reverted, re-investigating a symptom whose root cause is known, re-implementing a fix that was rejected for a reason. This skill defines the **failure chronicle** — a file of record listing every significant failure with its root cause and status — plus the discipline rules that keep it alive, the commands to mine an existing repo's history retroactively, and a catalog of classic agentic failure modes pre-written as chronicle entries you can seed into any project.

## When to use / when NOT to use

| Situation | Use |
|---|---|
| A symptom appears and you are about to investigate | **This skill first** (check the chronicle), then `agentic-debugging-playbook` |
| You just reverted, abandoned a branch, or burned >1 hour on a dead end | This skill (write the entry) |
| Onboarding into a repo and want its scar tissue | This skill (retroactive mining), after `agentic-project-onboarding` recon |
| Live triage of an active bug — hypotheses, experiments, bisection | NOT this skill → `agentic-debugging-playbook` |
| Documenting decisions/invariants that are *working*, not failures | NOT this skill → `agentic-architecture-contract` |
| Doc style, templates, doc budgets in general | NOT this skill → `agentic-docs-and-writing` |
| Multi-session campaign state files (plans, gates, re-entry) | NOT this skill → `agentic-long-horizon-campaign` |

Boundary in one line: the chronicle records **what already failed and why**; the debugging playbook handles **what is failing right now**.

---

## Part 1 — Build and maintain the chronicle

### 1.1 The file of record

- **Default location (hard rule: one file, repo-tracked):** `FAILURES.md` at repo root. If it outgrows ~500 lines, split into `docs/failures/` with one file per subsystem and keep `FAILURES.md` as an index.
- Check whether one already exists before creating it:

```sh
# bash
ls FAILURES.md docs/failures/ 2>/dev/null; git grep -li "failure" -- '*.md' | head -20
```

```powershell
# PowerShell
Get-ChildItem FAILURES.md, docs/failures -ErrorAction SilentlyContinue; git grep -li "failure" -- '*.md'
```

- Register its existence in your agent tool's memory file (CLAUDE.md / AGENTS.md / .cursor/rules) with one line: "Before investigating any symptom, read FAILURES.md."

### 1.2 The entry schema (fixed — every entry, every time)

| Field | Content |
|---|---|
| **Symptom** | What was observed, verbatim where possible (error text, wrong output, flaky test name) |
| **Root cause** | The actual mechanism, not the first guess. "Unknown" is a legal value only with status `open` |
| **Evidence** | How the root cause was established: commit SHA, failing command + output, bisect result, log excerpt |
| **Status** | One of: `fixed` / `wontfix` / `open` / `reverted-because` (with the reason inline) |
| **Date** | ISO date of the entry (and of resolution, if different) |

Template — copy verbatim:

```markdown
## <short title, symptom-first>
- **Symptom:** <observed behavior; paste exact error text>
- **Root cause:** <mechanism> | Unknown
- **Evidence:** <commit SHA / command + output / bisect range / PR link>
- **Status:** fixed | wontfix | open | reverted-because: <reason>
- **Date:** YYYY-MM-DD
```

Keep entries newest-first. Never delete an entry — a `fixed` entry is still the record that stops someone re-trying the *rejected* alternatives. If a fix is later undone, change status to `reverted-because` and append; do not rewrite history.

### 1.3 Mandatory-entry rule (hard rule)

Every one of the following MUST leave a chronicle entry before the session ends:

- [ ] Any `git revert`, or any commit whose message starts with "Revert"
- [ ] Any branch abandoned after real work (>~30 min of commits that will never merge)
- [ ] Any PR closed without merging, if it represented a real approach
- [ ] Any investigation that consumed multiple hours — **even if it found nothing** ("we looked here; it is not here" is exactly the entry that saves the next session)
- [ ] Any `wontfix` decision, with the reason

If your agent tool supports persistent instructions, encode this rule there so every session inherits it.

### 1.4 Discipline rule: CHECK THE CHRONICLE FIRST (hard rule)

Before investigating **any** symptom, run:

```sh
# bash — search chronicle for the symptom's key terms
grep -in "<key term from the error>" FAILURES.md docs/failures/*.md 2>/dev/null
```

```powershell
# PowerShell
Select-String -Pattern "<key term from the error>" -Path FAILURES.md, docs/failures/*.md -ErrorAction SilentlyContinue
```

Three outcomes:

| Chronicle says | You do |
|---|---|
| Same symptom, status `fixed` | Suspect a regression of the same root cause first; check the fixing commit is still intact (`git log --oneline -- <fixed file>`) |
| Same symptom, status `wontfix` / `reverted-because` | Read the reason. Do not re-attempt the rejected approach without new information — and say so explicitly if asked to |
| No match | Proceed to `agentic-debugging-playbook`; write an entry when you are done |

### 1.5 Retroactive mining — bootstrap a chronicle in an existing repo

Run these from the repo root. Each finding becomes a candidate entry; interview the history (commit messages, PR descriptions) to fill in root cause, and mark root cause `Unknown` + status `open` where the record is silent. Time-box: ~30–60 min yields most of the value.

**Reverts** (each is a guaranteed entry — something shipped and was pulled back):

```sh
git log --oneline -i --grep="revert"
# For each hit, see what it undid and why:
git show <sha> --stat
```

**Abandoned branches** (unmerged work = abandoned approaches):

```sh
git branch -a --no-merged
# Age and author of each — old + unmerged = likely a dead end worth recording:
git for-each-ref --sort=committerdate --format='%(committerdate:short) %(refname:short) %(authorname)' refs/remotes refs/heads
```

**Closed-unmerged PRs** (GitHub, requires `gh` CLI; skip if unavailable):

```sh
gh pr list --state closed --search "is:unmerged" --limit 50
gh pr view <number>   # read the closing discussion — the reason is usually there
```

**TODO archaeology** (each TODO/FIXME/HACK is a fossilized known-weakness; `git log -L` or `git log -S` dates it):

```sh
git grep -nE "TODO|FIXME|HACK|XXX" -- ':!*.min.*'
# When was a given marker introduced, and by which commit?
git log -S "<the TODO text>" --oneline -- <file>
```

**Deleted files** (removed subsystems often mark failed directions):

```sh
git log --diff-filter=D --summary --oneline | grep -i "delete mode" | head -40
```

Also skim any existing postmortems, `CHANGELOG.md` "Fixed" sections, and issue-tracker tickets tagged bug/regression — link them from entries rather than duplicating (one home per fact).

### 1.6 Maintenance (defaults, not hard rules)

- Review the chronicle when it is loaded at session start; promote any `open` entry you resolved.
- If an entry's evidence is a branch about to be deleted, copy the crucial diff hunk into the entry first.
- Chronicle entries stating an invariant ("X must happen before Y") should *also* be promoted into the architecture contract — see `agentic-architecture-contract`; keep the failure narrative here and the invariant there, cross-linked.

---

## Part 2 — Pre-seeded classic entries (copy into any new FAILURES.md)

These are the recurring failure modes of agent-driven engineering, written in the chronicle schema so they double as a template and a warning list. Adapt the placeholders; delete none until your project has demonstrably outgrown one.

```markdown
## Hallucinated API / flag stated confidently
- **Symptom:** Agent writes code or a command using a flag/method that does not exist; fails at run time with "unknown option" / AttributeError / 404.
- **Root cause:** Model prior over ground truth — the API "should" exist, so the model asserts it does. Frequency rises for niche tools and recent versions.
- **Evidence:** The command/import fails when actually executed. (If it was never executed, that is a second failure — see agentic-validation-and-qa.)
- **Status:** open (structural; mitigated, never fixed)
- **Prevention:** Verify against `<tool> --help`, the installed package source, or official docs BEFORE writing the call site. Never state a flag you have not seen output confirming.
- **Date:** 2026-07-02

## Stale-doc trust
- **Symptom:** Followed README/wiki instructions; behavior contradicts them (build fails, endpoint gone, config ignored).
- **Root cause:** Docs drift; executable config does not. The CI pipeline / lockfile / Makefile is the ground truth because it runs.
- **Evidence:** Diff what docs claim vs. what CI does: read `.github/workflows/*.yml`, `Makefile`, `package.json` scripts (discover with: git ls-files | grep -iE "workflow|makefile|justfile|taskfile").
- **Status:** open (structural)
- **Prevention:** Precedence order: CI config > lockfiles/build scripts > code comments > README > wiki. When they disagree, CI wins; then fix the doc.
- **Date:** 2026-07-02

## Test-gaming (agent edits assertion to green)
- **Symptom:** Test suite passes, but a test's expected value was changed in the same diff as the code "fix"; the bug ships.
- **Root cause:** Agent optimizes the visible goal ("make tests pass") over the real goal ("make behavior correct"); weakening the assertion is the shortest path.
- **Evidence:** `git diff` on the change shows edits under <test-dir> (discover: git ls-files | grep -iE "test|spec" | head) alongside the src fix.
- **Status:** open (structural)
- **Prevention:** Hard rule: an agent may not modify an existing assertion in the same change that fixes the code it tests, without an explicit stated justification in the PR. Full policy: agentic-validation-and-qa.
- **Date:** 2026-07-02

## Context-rot drift
- **Symptom:** Session 5 quietly violates a decision made in session 1 (re-adds a banned dependency, renames the thing back, uses the rejected pattern).
- **Root cause:** The decision lived only in a conversation context window that has since been truncated or ended. Context is not memory.
- **Evidence:** Compare current diff against decisions recorded in the repo; if the decision was never written down, that absence is the evidence.
- **Status:** open (structural)
- **Prevention:** Hard rule: decisions live in files, not context — architecture contract, this chronicle, or the agent memory file (CLAUDE.md / AGENTS.md / .cursor/rules). End-of-session: write down any decision made only in conversation. See agentic-long-horizon-campaign for the state-file protocol.
- **Date:** 2026-07-02

## Lost invariant (refactor removed load-bearing behavior)
- **Symptom:** Refactor looks clean, tests pass, then a distant subsystem breaks: the old code did something "incidental" (ordering, side effect, retry, cache warm) that nothing documented or tested.
- **Root cause:** Undocumented invariant. The behavior was load-bearing but invisible.
- **Evidence:** `git bisect` lands on the refactor commit; the removed lines contained the behavior (see agentic-proof-and-analysis-toolkit for bisection recipe).
- **Status:** open (structural)
- **Prevention:** Before deleting code you don't fully understand, run `git log -p --follow -- <file>` and `git log -S "<odd-looking line>"` — a line added by a bugfix commit is load-bearing. Record recovered invariants in agentic-architecture-contract.
- **Date:** 2026-07-02

## Duplicate implementation (agent re-implements an existing util)
- **Symptom:** Two implementations of the same helper (retry, slugify, date parsing) diverge over time; bugs get fixed in one copy only.
- **Root cause:** Agent could not find the existing util (search miss, unfamiliar naming) so it wrote a fresh one; nothing failed, so nothing flagged it.
- **Evidence:** git grep for the new function's key operation finds a pre-existing equivalent, e.g. `git grep -n "retry" -- '*.py' '*.ts' '*.go'`.
- **Status:** open (structural)
- **Prevention:** Before writing any generic helper, spend 2 minutes searching: `git grep -inE "<concept and synonyms>"` and list the project's util modules (discover: git ls-files | grep -iE "util|helper|common|shared"). See agentic-project-onboarding for the repo-map step that prevents this class.
- **Date:** 2026-07-02
```

---

## Provenance and maintenance

- **Authored:** 2026-07-02, from general agentic-engineering practice. The Part 2 catalog is field-observed but heuristic in its prevention advice: prevention lines are **defaults**, the mandatory-entry rule (§1.3) and check-first rule (§1.4) are **hard rules**, and the ~500-line split threshold (§1.1) is a **candidate practice**.
- **Volatile facts:** `gh` CLI flags and GitHub search qualifiers (`is:unmerged`) — as of 2026-07-02. Re-verify: `gh pr list --help`. All plain-git commands (`git log --grep`, `-i`, `--no-merged`, `--diff-filter=D`, `-S`, `for-each-ref`) verified against git in a scratch repo on 2026-07-02; these are decades-stable.
- **Re-verification one-liners:** `git log --help | grep -A2 "\-\-grep"`; `git branch --help | grep -A2 "no-merged"`; `gh pr list --help | grep -i search`.
- The Part 2 catalog will age as agent tooling improves; re-audit it yearly and add project-specific entries above the seeds, never instead of them.
