---
name: agentic-diagnostics-and-tooling
description: "Use when you need to MEASURE something instead of eyeballing it: 'is it actually faster', 'what changed between these two machines/commits/runs', 'which files are the hotspots', 'mine the logs', timing a change, comparing environments, or building a small diagnostic script. Also use when you catch yourself (or a PR) saying 'seems faster', 'looks fixed', or 'probably fine' without a number attached."
---

# Agentic Diagnostics and Tooling

How to measure instead of eyeball. The doctrine in one line: **an observation is (command, output, timestamp) — an impression is not evidence.** "It seems faster" and "it looks fixed" are hypotheses awaiting a measurement; this skill provides the measurement recipes and ships two scripts. Agents especially need this discipline because an agent's confident prose reads like evidence while containing none.

**Jargon:** _churn_ = how often a file changes in history. _Warm vs cold_ = with vs without caches populated. _Instrumentation_ = temporary code added solely to observe behavior.

## When to use / when NOT to use

**Use when:**

- Any claim of the form faster/slower/bigger/fixed/flaky is about to be made or believed.
- Two environments, commits, or runs behave differently and you need the delta.
- You are repeating a manual check for the third time (build a script instead).

**Do NOT use for:**

- The full debugging method (hypotheses, triage, traps) → `agentic-debugging-playbook`; this skill supplies its instruments.
- Whether the evidence is _sufficient to ship_ → `agentic-validation-and-qa`.
- Deep proof techniques (bisection recipe, differential testing, invariant checks) → `agentic-proof-and-analysis-toolkit`.

## 1. The shipped scripts

Both are dependency-free (git + shell only), read-only except for their own output file, in this skill's `scripts/` dir. `<library-root>` = wherever the library is installed (e.g. `~/.claude/skills`).

**env-snapshot** — dump OS, tool versions, and key env vars to a file so two machines (or before/after on one machine) can be diffed:

```sh
sh <library-root>/agentic-diagnostics-and-tooling/scripts/env-snapshot.sh my-machine.txt
# PowerShell:
pwsh -File <library-root>/agentic-diagnostics-and-tooling/scripts/env-snapshot.ps1 -OutFile my-machine.txt
# then, with a snapshot from each environment:
diff local.txt ci.txt          # PowerShell: Compare-Object (gc local.txt) (gc ci.txt)
```

Interpretation: any line in the diff is a candidate cause for "works here, not there" — toolchain versions first, then PATH order, then proxy/locale vars. Fixes live in `agentic-config-and-environment`.

**git-hotspots** — most-churned files, optionally windowed:

```sh
sh <library-root>/agentic-diagnostics-and-tooling/scripts/git-hotspots.sh 20 "90 days ago"
# PowerShell:
pwsh -File <library-root>/agentic-diagnostics-and-tooling/scripts/git-hotspots.ps1 -Top 20 -Since "90 days ago"
```

Interpretation guide (heuristics, not laws): high churn + large file = design stress point, prime bug habitat, handle per `agentic-architecture-contract`. High churn in a _config_ file = unstable process. A file churned by many different _fix_ commits (`git log --oneline --follow <file> | grep -c -i fix`) = the fixes aren't holding; suspect a wrong-layer fix (see `agentic-debugging-playbook` traps).

## 2. Technique recipes

### 2.1 Temporary instrumentation

Add the observation point, capture, **remove before commit** (hard rule — instrumentation left behind becomes noise that someone later debugs around).

1. Add the narrowest possible probe (log line, counter, timestamp) that answers ONE question. Tag every probe with a unique marker, e.g. `DIAG-1`:
2. Run the repro; capture output to a file, not your eyes: `<cmd> > run1.log 2>&1`.
3. Before commit, sweep: `git grep -n "DIAG-" -- .` must return nothing (identical in PowerShell).

### 2.2 Diffing as the universal instrument

The cheapest oracle for "what changed" is always a diff of captured outputs:

```sh
<cmd> > before.txt 2>&1        # on commit/config/machine A
<cmd> > after.txt  2>&1        # on B
diff before.txt after.txt      # PowerShell: Compare-Object (gc before.txt) (gc after.txt)
```

Works for program output, `--version` dumps, env snapshots, file listings (`git ls-files | sort`), dependency trees (`npm ls`, `pip freeze`, `cargo tree`). If outputs contain timestamps/ids, strip them first (`sed -E 's/[0-9]{4}-[0-9]{2}-[0-9]{2}[^ ]*//g'` or equivalent) — a diff full of noise measures nothing.

### 2.3 Localization by binary search

In **time**: `git bisect` (full recipe in `agentic-proof-and-analysis-toolkit`). In **space**: disable/stub half the candidates (tests, plugins, config blocks, input lines), keep the failure alive, recurse. Log which halves you eliminated — an unlogged search gets redone.

### 2.4 Timing properly (defaults)

- Never conclude from n=1. Run ≥5 iterations; report the **median** and the spread, not the best run.
- Separate warm from cold explicitly: first run after a clean is cold; state which you measured.
- Same machine, same power state, nothing heavy running concurrently; otherwise you measured the laptop, not the code.
- Bash: `time <cmd>` per run in a loop. PowerShell: `Measure-Command { <cmd> }` (prints TotalMilliseconds). Cross-platform and statistical: `hyperfine '<cmd>'` if installed — it does warmup and stats for you (`hyperfine --version` to check).
- A bimodal distribution (runs cluster at two distinct times) is a finding, not noise: usually cache hit vs miss, or a race — investigate before averaging it away.
- If the effect you're claiming is smaller than the spread between your own runs, you have measured nothing (`agentic-proof-and-analysis-toolkit` owns the statistical minimums).

### 2.5 Log mining one-liners

```sh
grep -c "ERROR" app.log                                  # how bad
grep -E "ERROR|WARN" app.log | sort | uniq -c | sort -rn | head -20   # what kinds, ranked
grep -n "ERROR" app.log | head -5                        # first occurrence — read AROUND it; the cause precedes the first error, not the loudest one
awk '{print $1}' access.log | sort | uniq -c | sort -rn | head       # top talkers (adjust field)
```

PowerShell equivalents: `(Select-String "ERROR" app.log).Count`; `Select-String "ERROR|WARN" app.log | Group-Object Line | Sort-Object Count -Descending | Select-Object -First 20`.

## 3. Repo forensics recipes

Beyond the hotspots script. These recipes are POSIX pipelines (`sed`, `sort | uniq -c`, `comm`, `xargs` do not exist in PowerShell) — on Windows run them in **Git Bash**, which ships with Git for Windows (`"C:\Program Files\Git\bin\bash.exe" -c '<recipe>'`), or use the PowerShell equivalents noted per recipe:

```sh
# Files most often touched by fix-shaped commits (bug attractors)
# PowerShell: git log -i --grep="fix" --format= --name-only | Where-Object { $_ } | Group-Object | Sort-Object Count -Descending | Select-Object -First 15
git log --oneline -i --grep="fix" --format= --name-only | sed '/^$/d' | sort | uniq -c | sort -rn | head -15

# Largest tracked files (review cost, hidden blobs)
git ls-files | xargs -I{} du -k "{}" 2>/dev/null | sort -rn | head -15
#   PowerShell: git ls-files | ForEach-Object { Get-Item $_ -ErrorAction SilentlyContinue } | Sort-Object Length -Descending | Select-Object -First 15 FullName, Length

# Dead-code candidates: tracked files untouched in 2+ years (verify before believing — stable ≠ dead)
git log --since="2 years ago" --format= --name-only | sed '/^$/d' | sort -u > touched.txt
git ls-files | sort > all.txt && comm -23 all.txt touched.txt | head -30
```

## 4. Build the instrument (default rule)

The third time you run a manual check, script it. House rules for diagnostic scripts:

- Dependency-free (shell + git + the project's own toolchain); read-only, or writes only its own clearly-named output file.
- A `# Usage:` comment at the top — the shipped scripts are the template.
- Lives in the project's `scripts/` (or `tools/`) if project-specific and committed via normal change control; in this skill's `scripts/` only if genuinely universal.
- Sanity-check in a scratch dir before running against a real repo; syntax check with `sh -n script.sh` (bash) — for PowerShell, running with `-WhatIf`-safe read-only content in scratch is the practical check.

## Provenance and maintenance

Authored 2026-07-02. Doctrine line and recipes are distilled cross-project practice; interpretation guides in §1 are labeled heuristics. Scripts `env-snapshot.{sh,ps1}` and `git-hotspots.{sh,ps1}` authored and syntax-verified 2026-07-02.

**Volatile facts, re-verify if this file is old:**

- Tool lists inside `env-snapshot` scripts track ecosystem churn — extend as needed.
- `hyperfine` availability/flags: `hyperfine --help`.
- Script self-test: `sh scripts/git-hotspots.sh 5` inside any git repo (expect 5 count-prefixed lines); `sh scripts/env-snapshot.sh /tmp/t.txt && head -3 /tmp/t.txt`.
- Sibling skills referenced: `agentic-debugging-playbook`, `agentic-validation-and-qa`, `agentic-proof-and-analysis-toolkit`, `agentic-config-and-environment`, `agentic-architecture-contract` — re-verify against the library index.
