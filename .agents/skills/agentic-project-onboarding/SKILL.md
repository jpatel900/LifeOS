---
name: agentic-project-onboarding
description: "Use when entering a repo you (or this session) have not worked in before, before making the first change: 'get familiar with this codebase', 'take over this project', 'fix X' in an unfamiliar repo, or any task where you cannot yet name the build command, test command, and danger zones from evidence. Also use after a long absence from a repo, or when a fresh session inherits work with no handoff."
---

# Agentic Project Onboarding

The Phase-0 reconnaissance discipline for entering any unfamiliar repo. Agents fail in new repos in a specific way: they pattern-match from the framework ("this looks like a standard Next.js app") instead of reading what is actually there, then act on the pattern. Recon replaces the pattern with evidence. The output of onboarding is not a feeling of familiarity — it is a filled-in mental-model template (§3) and the ability to pass the "know enough to act" checklist (§4).

**Jargon:** *recon* = read-only investigation before any change. *Entry file* = the file an agent tool loads automatically (CLAUDE.md, AGENTS.md, .cursor/rules). *Churn* = how often a file changes in git history.

## When to use / when NOT to use

**Use when:**
- First session in a repo, or first session after significant time away.
- You inherited a task mid-flight with no handoff (also read `agentic-long-horizon-campaign` if a CAMPAIGN.md exists).
- You catch yourself about to run a build/test command you *assumed* rather than read.

**Do NOT use for:**
- Diagnosing a specific failure → `agentic-debugging-playbook`.
- Setting up or repairing the toolchain/environment → `agentic-config-and-environment`.
- Reverse-engineering the architecture in depth → `agentic-architecture-contract` (onboarding gets you the map; that skill gets you the load-bearing walls).
- Mining past failures in depth → `agentic-failure-archaeology` (onboarding just locates the chronicle).

## 1. Run the recon script first

This skill ships a read-only script that prints the layout, manifests, detected test commands, CI files, churn hotspots, recent reverts, and unmerged branches in one pass:

```sh
# bash / POSIX sh (run from anywhere; pass the repo path)
sh <library-root>/agentic-project-onboarding/scripts/repo-recon.sh /path/to/repo
```

```powershell
# PowerShell 5+
pwsh -File <library-root>/agentic-project-onboarding/scripts/repo-recon.ps1 -Repo C:\path\to\repo
# On stock Windows PowerShell 5.1 (no pwsh): powershell -File <same args>; the script is 5.1-compatible
```

`<library-root>` is wherever this library is installed (e.g. `~/.claude/skills`). The script is dependency-free (git + shell only) and makes no changes. Its output feeds the reading order below — but it is a summary, not a substitute for reading the files it points at.

## 2. The ordered reading list

Read in this order; each step can reorder what comes after. Stop at the depth your task's risk requires (§5).

| # | Read | You are looking for | Trap this prevents |
|---|---|---|---|
| 1 | Entry files: `CLAUDE.md`, `AGENTS.md`, `.cursor/rules/`, `CONTRIBUTING.md` | Standing instructions, forbidden actions, house rules | Violating a rule the project wrote down precisely so agents wouldn't violate it |
| 2 | `README.md` + any manifest/vision doc | What the project claims to be; documented commands (treat as *claims* until step 4) | — |
| 3 | Package manifests & lockfiles (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, ...) | Real dependency surface, scripts block, toolchain pins | Assuming the framework from the folder shape |
| 4 | **CI config** (`.github/workflows/`, `.gitlab-ci.yml`, ...) | The commands that ACTUALLY gate merges: build, test, lint, exactly as invoked, with env and services | **CI is ground truth.** When README and CI disagree, CI wins — the README drifted (hard rule; fix the doc per `agentic-docs-and-writing`) |
| 5 | Test suite layout + run one real test file's worth | How tests are organized, what fixtures exist, how fast the suite is | Writing tests in a style the project doesn't use; not knowing the feedback-loop cost |
| 6 | Git history: last 30 commits, churn top-20, recent reverts, unmerged branches (recon script prints all four) | What's hot, what got undone, what stalled | Re-attempting a reverted approach; "improving" a file that three abandoned branches also tried to improve |
| 7 | Docs dirs (`docs/`), ADRs, `FAILURES.md` / chronicle if present | Recorded decisions and settled battles | Re-litigating decided architecture (`agentic-architecture-contract`) or re-fighting logged failures (`agentic-failure-archaeology`) |
| 8 | TODO/FIXME hotspots (commands below) | Known-weak areas the team already knows about | Reporting known issues as discoveries |
| 9 | Generated-vs-source boundaries (commands below) | Files you must never hand-edit | The edit-a-generated-file incident (see `agentic-change-control` non-negotiables) |

Commands for steps 8-9 (kept out of the table so they copy-paste cleanly):

```sh
# Step 8 - TODO/FIXME hotspots (bash; PowerShell: replace '| head -40' with '| Select-Object -First 40')
git grep -n -E "TODO|FIXME|HACK|XXX" -- . | head -40

# Step 9 - generated files, byte-identical to the agentic-change-control version (one home per fact)
git grep -l -i -E "do not edit|autogenerated|auto-generated|@generated" -- . | head -20
```

The git invocations themselves are shell-independent; only the `| head -N` tail needs the PowerShell substitution shown above (`head` does not exist in PowerShell).

## 3. The mental-model template

Fill this in as you read — in a scratch note for small tasks; for anything multi-session, put it in the campaign doc. An empty cell is a known unknown; that's fine. A cell filled by assumption is a trap.

```markdown
## Repo model: <repo> (as of <date>, commit <sha: git rev-parse --short HEAD>)
- Purpose (one sentence, from evidence not vibes):
- Build:            <exact command, source: CI file X line Y>
- Test (full):      <exact command, source: CI>   Test (one file): <command>
- Lint/format:      <exact command>
- Entry points:     <main/bin/handlers — where execution starts>
- Data flow:        <input → transform → output, one line per major path>
- State/storage:    <DB? files? where?>
- Invariants/danger zones:  <from ADRs, "do not edit" markers, entry-file rules>
- Generated files:  <list or "none found">
- Chronicle/ADRs:   <paths, or "none — flag to owner">
- Hot files (churn top 5):   <from recon script>
- Recent reverts / dead branches worth knowing:
- Open unknowns:    <what you could not determine>
```

## 4. "You know enough to act when..." checklist

Do not start editing until every line relevant to your task is checked **from evidence** (you can cite the file/command that told you):

- [ ] You can state the build and test commands *as CI runs them*, and you have run the test suite (or the relevant slice) once, green, before touching anything — a pre-existing red baseline discovered *after* your edits is indistinguishable from damage you caused.
- [ ] You know which files near your task are generated, and where their generator lives.
- [ ] You checked the chronicle/ADRs for your task's area (or confirmed none exist).
- [ ] You know whether your intended change is a one-way or two-way door (`agentic-change-control` §1).
- [ ] You can name the danger zones adjacent to your change (invariants, load-bearing code) or have confirmed the area is unclaimed.
- [ ] Your task's scope is written down in one sentence you could show the repo owner.

## 5. Time-boxing (defaults, not hard rules)

Recon depth is proportional to change risk, not to curiosity:

| Task risk | Recon budget | Depth |
|---|---|---|
| Typo/docs/comment fix | ~5 min | Steps 1–2 + checklist items that apply |
| Contained bug fix or small feature | ~20–30 min | Steps 1–6, model template partially filled |
| Refactor, cross-cutting change, anything near invariants | ~1 hour+ | All 9 steps, full template, then `agentic-architecture-contract` |
| Taking over a project | Half a day | All of the above + read the last ~10 merged PRs end to end |

If recon keeps surfacing surprises after the budget, that IS the finding: the repo's self-description has drifted. Say so before proceeding, and route doc fixes per `agentic-docs-and-writing`.

## Provenance and maintenance

Authored 2026-07-02. Reading order and time-boxes are distilled cross-project defaults; the CI-is-ground-truth rule is a hard rule. Scripts `scripts/repo-recon.sh` and `scripts/repo-recon.ps1` were authored and syntax-verified 2026-07-02 (POSIX sh + git; PowerShell 5+ + git).

**Volatile facts, re-verify if this file is old:**
- Manifest/CI filename lists in §2 and in the recon script track ecosystem churn — extend as ecosystems evolve.
- Entry-file conventions (`CLAUDE.md`, `AGENTS.md`, `.cursor/rules/`) are tool-specific and moving; re-verify against your agent tools' current docs.
- Re-verify the recon script still runs clean: `sh scripts/repo-recon.sh .` in any git repo (expect eight `=====` sections — five if run outside a git repo — and no errors).
- Sibling skills referenced: `agentic-change-control`, `agentic-debugging-playbook`, `agentic-config-and-environment`, `agentic-architecture-contract`, `agentic-failure-archaeology`, `agentic-long-horizon-campaign`, `agentic-docs-and-writing` — re-verify against the library index.
