---
name: agentic-change-control
description: "Use when deciding whether an agent may make, merge, or ship a change: classifying a change as reversible vs irreversible (one-way door), deciding if human approval is needed, force-push/--no-verify/skip-hooks questions, deleting or publishing anything, red CI, editing generated files, scope creep mid-task, or writing an agent-authored PR. Also when someone asks 'can I just push this?', 'is this safe to automate?', or 'does this need review?'."
---

# Agentic Change Control

How changes get classified and gated in an agent-driven project. The core discipline: classify every change as a two-way or one-way door BEFORE making it, run every change class through a gating ladder (propose -> human approve -> auto-execute) that only relaxes on accumulated evidence, and hold a short list of non-negotiables that no deadline overrides. This skill exists because the expensive failures in agent-driven work are almost never "the agent wrote bad code" — they are "the agent did an irreversible thing without asking."

## When to use / when NOT to use

**Use when:**
- You are about to make ANY change and have not classified its reversibility.
- You are deciding whether an action needs human approval before executing.
- You are about to run something destructive or external: delete, force-push, publish, deploy, send.
- You are authoring or reviewing an agent-generated PR.
- A check/hook/test is failing and you feel the pull to bypass it.

**Do NOT use for:**
- How to diagnose WHY a test or check is failing -> `agentic-debugging-playbook`.
- What counts as evidence that a change works, acceptance thresholds -> `agentic-validation-and-qa`.
- Pre-change reconnaissance of an unfamiliar repo -> `agentic-project-onboarding`.
- Deploy/rollback mechanics and operational runbooks -> `agentic-run-and-operate`.
- Recording incidents so they aren't repeated -> `agentic-failure-archaeology`.

## 1. Door classification (do this BEFORE the change)

**Definitions:**
- **Two-way door**: reversible, cheap to undo, blast radius contained to the repo/branch. Wrong? `git revert` or delete the branch, nobody outside noticed.
- **One-way door**: destructive, external, or expensive to revert. Wrong? You are writing an incident report, apologizing to someone, or restoring from backup.

The test is not "can it theoretically be undone" — it is "what does undo actually cost, and who outside this working tree is affected."

| Change | Door | Why |
|---|---|---|
| Edit source on a feature branch | Two-way | `git revert` / branch delete |
| Add a test, refactor, rename within repo | Two-way | Same |
| Commit to a local branch | Two-way | `git reset`, reflog keeps ~90 days |
| Merge to the default branch | Boundary | Revertable, but others build on it immediately |
| Schema migration on a shared DB | One-way | Data loss on rollback; others depend on schema |
| `rm -rf` / deleting files outside git tracking | One-way | No reflog for untracked files |
| Force-push to a shared branch | One-way | Rewrites history others have pulled |
| Publishing a package (npm/PyPI/crates) | One-way | Registries forbid or restrict unpublish |
| Prod deploy | One-way | External users see it; rollback is an operation, not an undo |
| Sending anything outside the repo (email, Slack, API call with side effects, GitHub comment) | One-way | Cannot unsend |
| Deleting branches/tags on the remote | One-way | Others may reference them |
| Rotating/revoking credentials | One-way | Breaks consumers instantly |

**Hard rule:** if you cannot confidently classify a change, treat it as one-way and escalate. Misclassifying one-way as two-way is the expensive error; the reverse just costs a question.

**Pre-flight for anything near the boundary** (copy-paste):

```sh
# Which branch am I on, and is it shared?
git branch --show-current
git remote show origin   # look at HEAD branch and tracked branches

# Is this branch protected? (GitHub, requires gh CLI)
gh api "repos/{owner}/{repo}/branches/$(git branch --show-current)/protection" 2>&1 | head -5
# 404 = unprotected; JSON = protected; treat protected as shared

# Does anyone else have commits on this branch?
git log --format='%an' origin/$(git branch --show-current) 2>/dev/null | sort -u
```

PowerShell variant of the last line: `git log --format='%an' "origin/$(git branch --show-current)" 2>$null | Sort-Object -Unique`

## 2. The gating ladder

Every CLASS of change (not every individual change) sits at one rung:

| Rung | Meaning | Example classes typically here |
|---|---|---|
| 1. Propose only | Agent describes the change; human executes it | Prod deploys, migrations, anything external |
| 2. Human approve | Agent prepares the change fully; human says go | Merges, dependency upgrades, config changes |
| 3. Auto-execute | Agent does it and reports after | Feature-branch commits, test additions, docs |

**Graduation rule (hard rule):** a change class moves DOWN the ladder (toward auto-execute) only on accumulated evidence — a run of N consecutive instances with near-zero human overrides and zero resulting defects, where N and the window are agreed in advance (default candidate: 20 instances or 4 weeks, whichever is longer). It never graduates because approval is annoying, the human is busy, or a deadline looms. Convenience-driven graduation is how automation eats a gate.

**De-graduation rule:** one defect or one near-miss caused by an auto-executed change moves the whole class back UP one rung immediately. Re-graduation requires a fresh evidence run. Record the incident per `agentic-failure-archaeology`.

**Permanently gated (hard rule):** the following stay at rung 1 or 2 forever unless a human explicitly delegates them IN WRITING (in the repo — e.g. your agent tool's memory file: CLAUDE.md / AGENTS.md / .cursor/rules — naming the specific action and scope):

- Deleting anything not recoverable from git history
- Force-pushing to any branch another person or agent tracks
- Publishing packages, releases, or artifacts to any registry
- Deploying to production or any shared environment
- Sending anything outside the repo: emails, messages, comments on external issues/PRs, API calls with side effects
- Modifying CI/CD configuration that controls the gates themselves
- Rotating, creating, or revoking credentials

"The user seemed to want this" and "it was implied by the task" are not written delegation. When in doubt, propose and wait.

**Where the ladder state lives:** in the repo, in your agent tool's memory file or a `docs/` policy file — not in anyone's head. Discovery: `ls CLAUDE.md AGENTS.md .cursor/rules docs/ 2>/dev/null` (PowerShell: `Get-ChildItem CLAUDE.md, AGENTS.md, .cursor -ErrorAction SilentlyContinue`).

## 3. The non-negotiables

Each row is a hard rule. The incident column is the archetype — the generic shape of the disaster that made the rule, seen across many projects.

| Never | Rationale | Archetypal incident |
|---|---|---|
| Force-push a shared branch | Rewrites history others have based work on; their next pull silently orphans commits | Agent "cleans up" main after a botched merge; three collaborators lose a day reconciling; one lost commit is only found via someone's local reflog |
| Skip hooks (`--no-verify`, `SKIP=...`, disabling pre-commit) | Hooks are a gate someone installed on purpose; bypassing converts their guarantee into a lie | Agent bypasses a lint hook "just to commit WIP"; the hook was also the secret-scanner; a credential lands in history and must be rotated + history rewritten |
| Bypass or silence a failing check to merge | The check is red because something is wrong or the check is wrong — both need a human decision, not suppression | Flaky test gets `skip`ped to unblock a release; it was flaking because of a real race; the race ships |
| Edit generated files | The generator wins the next run; your edit silently vanishes, or worse, half-persists | Agent hand-patches a generated API client; next codegen run reverts it; the bug "comes back from the dead" two weeks later and burns a full re-debugging session |
| Widen scope silently mid-task | Reviewer approved task X; unrequested Y rides in under X's review; accountability breaks | "While fixing the typo I also refactored the auth module" — the refactor had a bug, the reviewer never really looked, and the PR title said "fix typo" |
| Merge red CI | Red means unknown state; merging converts your unknown into everyone's unknown | "It's just the flaky suite" merged on a Friday; it was not the flaky suite |
| "Fix" a test to pass without understanding why it failed | The test encoded an intention; changing the assertion to match observed behavior deletes the intention | Agent updates an expected value to whatever the code now returns; the code was wrong; the test now certifies the bug (see `agentic-validation-and-qa` for anti-test-gaming) |
| Automate past a designated human gate | The gate exists because someone decided this action needs judgment; speed is not a counter-argument | Agent scripts around an approval step "since it always gets approved anyway"; the one time it mattered, nobody was looking |

**Finding the gates and generated files in an unfamiliar repo:**

```sh
# What hooks exist?
ls .husky/ .git/hooks/ 2>/dev/null; cat .pre-commit-config.yaml 2>/dev/null

# Which files are generated? (do-not-edit markers)
git grep -l -i -E "do not edit|autogenerated|auto-generated|@generated" -- . | head -20

# Also check for generator configs / lockfiles that imply generation
ls *.lock package-lock.json pnpm-lock.yaml Cargo.lock poetry.lock 2>/dev/null
```

If you must change a generated file's content: find the generator (`git grep -l <distinctive-string-from-file> -- ':!<the-generated-file>'`), change its input, re-run it, commit both.

**The one blessed force-push** (default, not hard rule): on YOUR OWN unshared feature branch, after a local rebase, use `git push --force-with-lease` — never bare `--force`. `--force-with-lease` refuses if the remote moved since you last fetched, which catches the "someone else pushed to my branch" case.

## 4. Agent PR hygiene

Agent-authored PRs get skimmed, not read, unless you force reviewability. Defaults, enforced as if hard rules:

**Small diffs.** One logical change per PR. Candidate ceiling: ~400 changed lines; past that, reviewers approve on vibes. Check yourself: `git diff --stat <base>...HEAD | tail -1` (find the base: `git remote show origin | grep "HEAD branch"`; PowerShell: `git remote show origin | Select-String "HEAD branch"`). If the diff mixes a refactor with a behavior change, split it — refactor PR first, behavior PR on top.

**PR body states what was verified and HOW.** Not "tests pass" but the literal command and its observed result. The PR description *template* has one home: `agentic-docs-and-writing` §5 — use it. This skill adds two mandatory policy requirements on top of that template:

1. A **"NOT verified:"** line — what you did not check, stated plainly. An agent that never states what it didn't check is either omniscient or hiding something, and reviewers know which.
2. A **reversibility classification** in the Risk & rollback section — two-way or one-way door per §1 of this skill, with the revert procedure.

Example of the two additions: `NOT verified: behavior under concurrent writes (out of scope, noted in #<issue>)` and `Two-way door. Revert = git revert <sha>, no migration, no external effects.` What counts as adequate verification is owned by `agentic-validation-and-qa`.

**Self-review pass before requesting review** (checklist, run every time):

1. `git diff <base>...HEAD` — read the WHOLE diff as if you didn't write it.
2. Every changed file: is it in scope for the stated task? Remove drive-by edits (see non-negotiables: no silent scope widening).
3. Any debugging residue? (`git grep -n -E "console\.log|TODO.?remove|XXX|dbg!|breakpoint\(\)" -- $(git diff --name-only <base>...HEAD)` — bash; adapt patterns to the language)
4. Any secrets/paths/hostnames that shouldn't be in a public diff?
5. Does CI pass? `gh pr checks` (after opening) or `gh run list --limit 3`. Red CI = do not request review.
6. Does the PR body's "Verified" section match what you actually ran this session, not what you intended to run?

**Commit messages** (default): imperative subject <= 72 chars, body says why not what. The diff already says what.

## Provenance and maintenance

Authored 2026-07-02, from cross-project experience running agent-driven development; the door/ladder model and non-negotiables are distilled practice, not standards documents. Labels used throughout: **hard rule** (violation is an incident), **default** (deviate with stated reason), **candidate practice** (plausible, not yet evidence-backed — e.g. the N=20 graduation window and the ~400-line PR ceiling).

**Volatile facts, re-verify if this file is old:**
- `gh` CLI subcommand shapes (`gh pr checks`, `gh api`, `gh run list`) — as of 2026-07-02. Re-verify: `gh pr checks --help; gh run list --help`.
- Git reflog retention default (~90 days) — re-verify: `git config --get gc.reflogExpire` (empty = default 90 days).
- `--force-with-lease` semantics — re-verify: `git push --help` (search "force-with-lease").
- Registry unpublish policies (npm's 72-hour window etc.) change; re-verify on the registry's docs before relying on "publishing is one-way" being literally absolute — treat it as one-way regardless.
- Sibling skill names referenced here: `agentic-debugging-playbook`, `agentic-validation-and-qa`, `agentic-project-onboarding`, `agentic-run-and-operate`, `agentic-failure-archaeology` — re-verify they still exist in the library index.
