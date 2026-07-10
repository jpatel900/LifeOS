---
name: agentic-docs-and-writing
description: "Use when writing or restructuring project documentation - READMEs, runbooks, ADRs, postmortems, PR descriptions, agent memory files (CLAUDE.md / AGENTS.md / .cursor/rules), or skill files; also when docs contradict each other or CI, when an entry file has grown too long to be read, when deciding where a new fact should live, or when asked to 'document this', 'update the README', or 'write a runbook'."
---

# agentic-docs-and-writing

Documentation for an agent-heavy project is not prose - it is context, and context is a budget. Every line an agent must read before acting costs tokens, attention, and correctness. This skill defines the docs-of-record model (one home per fact), line budgets for entry files, a house style that both a zero-context engineer and a Sonnet-class model can execute from, freshness discipline so docs do not silently rot, and the standard templates (README, runbook, ADR-lite, postmortem, PR description) plus how to author skill files themselves.

## When to use / when NOT to use

**Use when:**

- Creating or restructuring any project doc: README, runbook, ADR, postmortem, contributing guide, agent memory file.
- Two docs disagree, or a doc disagrees with CI or with observed behavior.
- An entry file (README, CLAUDE.md, AGENTS.md) has bloated past its budget.
- Writing a PR description or authoring a skill file.
- Deciding where a new fact belongs ("which doc owns this?").

**Do NOT use when:**

- The content will leave the repo - marketing copy, release announcements, benchmark claims, anything external-facing. Use **agentic-external-positioning** (claims discipline, prove-before-claiming).
- Recording an architectural decision's _substance_ (invariants, load-bearing choices, known-weak points). The ADR-lite _template_ lives here; what belongs in the architecture record and why is **agentic-architecture-contract**.
- Recording failures and dead ends so they are not re-fought. Template discipline is here; the failure chronicle's content and maintenance is **agentic-failure-archaeology**.
- Writing operational procedures' _content_ (deploy, rollback, process hygiene). Runbook _format_ is here; what to run and operate is **agentic-run-and-operate**.
- Structuring PR risk gating and change approval - **agentic-change-control** owns PR hygiene policy; this skill only owns the description template.

## 1. Docs of record: one home per fact

**Hard rule:** for each concern there is exactly ONE authoritative doc (the _doc of record_). Every other mention of that concern is a link to it, never a copy. Duplicated facts fork; forked facts diverge; diverged facts burn agent sessions.

| Concern                     | Typical doc of record                                         |
| --------------------------- | ------------------------------------------------------------- |
| How to build/run/test       | README (or a doc README links to in its first screen)         |
| Operational procedures      | `docs/runbooks/<task>.md`, one file per task                  |
| Why a decision was made     | `docs/adr/NNNN-<slug>.md`, append-only                        |
| What went wrong and lessons | `docs/postmortems/YYYY-MM-DD-<slug>.md`                       |
| Agent standing instructions | The agent memory file (CLAUDE.md / AGENTS.md / .cursor/rules) |
| Config axes and env setup   | See **agentic-config-and-environment**                        |

Discovery - find where docs already live before adding any:

```bash
# bash
find . -name "*.md" -not -path "*/node_modules/*" -not -path "*/.git/*" | head -50
git log --format='%ad %s' --date=short -5 -- docs/   # is docs/ maintained or abandoned?
```

```powershell
# PowerShell
Get-ChildItem -Recurse -Filter *.md | Where-Object FullName -NotMatch 'node_modules|\.git' | Select-Object -First 50 FullName
```

**The registry.** Keep one index (commonly `docs/README.md` or a "Documentation" table in the root README) listing every doc of record: path, one-line scope, owner if known. Rules:

- The registry may **shrink freely** (deleting a stale doc is always safe if its facts have a new home or are dead).
- It **grows only deliberately**: adding a doc means declaring what concern it owns and confirming no existing doc already owns it. If one does, extend that doc instead.
- A doc not in the registry is a candidate for deletion, not a hidden second source of truth.

**Duplication check** before writing a fact into a second place:

```bash
grep -ri "<distinctive phrase from the fact>" --include="*.md" .
```

If it hits, link to the hit; do not restate.

## 2. Entry-file line budgets

An entry file is what a human or agent reads _first_: root README, CLAUDE.md / AGENTS.md / .cursor/rules. These are loaded into context on nearly every session, so their length is a per-session tax.

| File               | Budget (default, not hard rule) | Rationale                                                                          |
| ------------------ | ------------------------------- | ---------------------------------------------------------------------------------- |
| Agent memory file  | ≤ 150 lines                     | Loaded every session; every line is a standing instruction competing for attention |
| Root README        | ≤ 300 lines                     | First screen must answer: what is this, how do I run it, where is everything else  |
| Any single runbook | ≤ 200 lines                     | Longer means it is two runbooks                                                    |
| Registry/index     | ≤ 100 lines                     | It is a table of links, not a document                                             |

A CLAUDE.md or README past a few hundred lines stops being read - by humans who skim and by agents whose attention degrades over long low-density context. Measure:

```bash
wc -l README.md CLAUDE.md AGENTS.md 2>/dev/null
```

```powershell
Get-Item README.md, CLAUDE.md, AGENTS.md -ErrorAction SilentlyContinue | ForEach-Object { "$($_.Name): $((Get-Content $_ | Measure-Object -Line).Lines)" }
```

**When over budget, do not summarize harder - relocate.** Move detail to a linked doc of record and leave a one-line pointer. The entry file keeps: identity, the 3-5 commands used daily, the registry link, and standing constraints. Everything else is a link.

## 3. Agent-readable house style

Written for a zero-context engineer or an agent dropped in cold. Every rule below is a hard rule unless marked otherwise.

1. **Imperative voice.** "Run X. Then check Y." Not "one might consider running X." Agents execute instructions; hedged prose produces hedged action.
2. **Copy-pasteable commands in fenced blocks, with expected output.** A command whose success state is unstated cannot be verified:

   ````markdown
   ```bash
   <test-command>            # discover: check "scripts" in package.json, or Makefile targets
   # Expected: exit 0, last line like "N passed, 0 failed"
   ```
   ````

3. **Define every jargon term at first use** - project codenames, internal acronyms, service nicknames. One parenthetical suffices: "push to `hermes` (the internal artifact mirror)". An agent cannot infer what your team calls things.
4. **Tables for enumerable facts.** Ports, env vars, service names, error codes, owners: table, not paragraph. Tables are diffable, greppable, and hard to write ambiguously.
5. **Date-stamp volatile facts.** "As of 2026-07-02, the staging cluster runs version X." Undated volatile facts are indistinguishable from current facts, which is how agents act on 2023 information.
6. **State the negative space.** Every doc of record says what it does NOT cover (with a link to what does) and what is NOT allowed. "This runbook does not cover restores - see `runbooks/restore.md`. Never run this against production without the gate in **agentic-change-control**." Absence of a prohibition reads as permission to an agent.
7. **Front-load the punchline.** First paragraph answers "what is this and when do I need it." Background goes last or gets cut.
8. **One doc, one audience.** Do not interleave "for operators" and "for contributors" sections; split the doc.
9. _(Default, not hard rule)_ Prefer relative repo links (`docs/adr/0004-...md`) over absolute URLs so links survive forks and mirrors.

## 4. Freshness discipline

Docs drift. Assume every doc is stale until re-verified.

**Rule 1 - runbooks end with re-verification one-liners.** The last section of every runbook is a fenced block of cheap commands that confirm the runbook's core facts are still true (the tool exists, the path exists, the target responds). If those fail, the runbook is stale - fix it before executing it.

**Rule 2 - CI is ground truth (this is the rule's one home; siblings reference it).** When sources disagree, trust in this precedence order: **CI config > lockfiles/build scripts > code comments > README > wiki** - the higher source wins because it executes. Fix the losing doc the same day, as its own commit (or its own PR): riding the fix into an unrelated open PR is silent scope widening (see `agentic-change-control`) unless the PR body explicitly declares the added doc fix. Discover what CI actually runs:

```bash
ls .github/workflows/ .gitlab-ci.yml .circleci/ azure-pipelines.yml 2>/dev/null
grep -rn "run:" .github/workflows/ 2>/dev/null | head -30
```

**Rule 3 - stale-doc triage.** Cheap signal for what has rotted:

```bash
# Last-modified date per doc; anything untouched for a year in an active repo is suspect
git log --format='%ad' --date=short -1 -- <doc-path>
```

```bash
# All docs sorted oldest-first (bash)
for f in $(git ls-files '*.md'); do echo "$(git log --format='%ad' --date=short -1 -- "$f") $f"; done | sort | head -20
```

Stale doc found mid-task: fix it if under ~5 minutes, otherwise leave a dated `<!-- STALE as of 2026-07-02: <what is wrong> -->` comment at the top and file it. A silently wrong doc is worse than a flagged one.

## 5. Templates

Copy verbatim; delete sections that do not apply rather than leaving them empty.

### README skeleton

````markdown
# <project-name>

<One sentence: what this is and who it is for.>

## Quick start

```<shell>
<install command>     # discover: look for package.json / pyproject.toml / go.mod / Cargo.toml
<run command>
<test command>
# Expected: <what success looks like>
```

## Documentation

| Doc                 | Scope                       |
| ------------------- | --------------------------- |
| docs/runbooks/      | Operational procedures      |
| docs/adr/           | Decision records            |
| <agent memory file> | Agent standing instructions |

## Does NOT cover

<What lives elsewhere, with links. What is out of scope entirely.>
````

### Runbook

````markdown
# Runbook: <task name>

**Purpose:** <one line>. **Last verified:** 2026-07-02 by <who/what>.
**Preconditions:** <access, tools, state required>
**Does NOT cover:** <adjacent task> - see <link>.

## Steps

1. ```<shell>
   <command>
   # Expected: <output / exit code>
   ```
2. <next step. One command per step. No step may require unstated judgment.>

## If it fails

| Symptom      | Meaning | Action              |
| ------------ | ------- | ------------------- |
| <error text> | <cause> | <fix or escalation> |

## Rollback

<Exact commands, or "none possible - see agentic-change-control before running.">

## Re-verify this runbook

```<shell>
<one-liners proving the tools/paths/targets above still exist>
```
````

### ADR-lite

This is the template's ONLY home (`agentic-architecture-contract` owns when an ADR is mandatory; it links here for the format). Canonical path: `docs/adr/NNNN-<slug>.md`.

```markdown
# ADR-NNNN: <decision as a verb phrase>

**Date:** 2026-07-02 | **Status:** accepted | superseded-by ADR-MMMM

**Context:** <the forces, in 2-4 sentences>
**Decision:** <what was decided, one sentence, imperative>
**Rationale:** <the one killer argument that beat the alternatives>
**Alternatives rejected:** <name each + one-line reason - this is the valuable part>
**Consequences:** <what gets harder/easier; what invariant this creates; what would have to be true to revisit (the reversal trigger)>
```

Append-only: never edit an accepted ADR's decision - supersede it with a new one. (What belongs in ADRs at all: **agentic-architecture-contract**.)

### Postmortem (blameless)

```markdown
# Postmortem: <incident> - YYYY-MM-DD

**Impact:** <who/what, for how long> | **Detected by:** <alert/human/luck>

## Timeline (UTC)

| Time | Event |
| ---- | ----- |

## Root cause

<Mechanism, not blame. "The deploy script assumed X" not "engineer forgot X.">

## What went well / what went badly

## Action items

| Action | Owner | Verifiable done-condition |
| ------ | ----- | ------------------------- |
```

Cross-file the lesson into the failure chronicle - **agentic-failure-archaeology** owns that.

### PR description

````markdown
## What

<One-paragraph summary of the change.>

## Why

<Problem or link to issue. If reverting/superseding, link the prior change.>

## How verified

```<shell>
<exact commands run>
# <actual observed output, pasted - not "tests pass"; see agentic-validation-and-qa>
```
````

## Risk & rollback

<Blast radius if wrong. How to revert. One-way-door? See agentic-change-control.>

````

## 6. Authoring skill files

Skill files (this file's own format) follow the portable Agent Skills convention: a directory containing `SKILL.md` with YAML frontmatter of exactly two keys, `name` and `description`.

- **The description is written for the retriever, not the reader.** It is matched against the user's request to decide whether to load the skill. Write "Use when <situation>; also when <situation>; trigger phrases: '<literal thing a user says>'" - not a title, not a summary. A beautiful skill with a title-shaped description never fires.
- **"When NOT to use" with a sibling redirect is mandatory.** Skills overlap; without explicit boundaries the retriever or the agent loads the wrong one and the right one's content is never seen. Name the exact sibling skill for each excluded case.
- Body follows the house style in section 3: imperative, fenced commands with expected output, tables, negative space, date-stamped volatile facts.
- Keep skills tool-agnostic: no load-bearing references to any one agent product's features; plain shell commands; "the agent", not a product name.
- Every skill ends with provenance and re-verification (section 7 of this file is the pattern).

## 7. Provenance and maintenance

- **Authored:** 2026-07-02, from cross-project practice. Line budgets in section 2 are defaults calibrated to 2026-era model context behavior, not hard rules; re-calibrate if entry files are demonstrably read in full at larger sizes. The "one home per fact" rule and "CI wins" rule are hard rules. The relative-links preference is a default.
- **Volatile facts:** the frontmatter convention (two-key `name`/`description` SKILL.md) is the portable convention as of 2026-07-02; agent tools may extend it. Agent memory file names (CLAUDE.md / AGENTS.md / .cursor/rules) are tool-specific and change as tools evolve.
- **Re-verify:**
  ```bash
  wc -l README.md CLAUDE.md AGENTS.md 2>/dev/null        # budgets still respected?
  ls docs/ 2>/dev/null                                    # registry location still true?
  head -5 "$(dirname "$0")/SKILL.md" 2>/dev/null          # frontmatter still two keys?
  git log --format='%ad' --date=short -1 -- docs/         # is docs/ still alive?
````

```

```
