---
name: agentic-debugging-playbook
description: "Use when any bug, test failure, or unexpected behavior needs diagnosing: 'why is this failing', 'works locally but fails in CI', 'this test is flaky', 'it broke after the merge/update', 'it worked a minute ago', a stack trace with no obvious cause, or when you notice you are editing code hoping the failure goes away. Also use when a debugging session has burned more than two failed fix attempts."
---

# Agentic Debugging Playbook

Debugging discipline for agents. The failure mode this skill prevents is not "can't find the bug" — it is _motion that looks like debugging but isn't_: editing plausible code, re-running, editing again, until something passes for reasons nobody can state. The discipline: reproduce before theorizing, predict before running, change one variable per experiment, and treat a fix you cannot explain as a coincidence still waiting to fail.

**Jargon:** a _repro_ is a reliable procedure that triggers the failure. A _discriminating experiment_ is one whose outcome differs depending on which hypothesis is true. _Bisection_ is binary-searching history for the commit that introduced a failure.

## When to use / when NOT to use

**Use when:**

- Anything is failing or behaving unexpectedly and the cause is not already known.
- You are about to "try a fix" without being able to state why it should work.
- A previous session claims something was fixed but the symptom is back.

**Do NOT use for:**

- Recording the outcome of an investigation, or checking whether this battle was already fought → `agentic-failure-archaeology` (check its chronicle FIRST — hard rule, see step 0).
- Deep technique recipes (minimal repro by halving, `git bisect run`, differential testing) → `agentic-proof-and-analysis-toolkit`.
- Building measurement tooling, timing methodology, log mining → `agentic-diagnostics-and-tooling`.
- Deciding whether a fix is adequately verified before shipping → `agentic-validation-and-qa`.
- Environment/toolchain setup problems on a machine that has never worked → `agentic-config-and-environment`.

## 0. Before anything: check the record

```sh
# Has this been fought before? (chronicle, if the project keeps one)
ls FAILURES.md docs/failures 2>/dev/null
git log --oneline -i --grep="<distinctive-error-phrase>" | head -10
git log -S "<distinctive-error-phrase>" --oneline | head -10   # commits that added/removed the string
```

PowerShell: `Get-ChildItem FAILURES.md, docs/failures -ErrorAction SilentlyContinue`; the git commands are identical.

If the chronicle has an entry for this symptom: read it, follow its status. Re-deriving a settled root cause is the single largest avoidable waste in multi-session agent work.

## 1. The loop (hard rule)

Every iteration has five steps. Skipping one is how sessions get burned.

1. **Reproduce.** Get a command that fails deterministically (or a measured failure rate if flaky). No repro → no debugging; go build the repro first. The repro command goes in your notes verbatim.
2. **Observe.** Collect what IS true: exact error text, exit code, versions, which environments fail and which don't. An observation is (command, output) — not an impression. Record negatives too ("does NOT fail with cache cleared").
3. **Hypothesize.** One sentence naming a _mechanism_, not a location: "the config loader reads the file before the env override is applied", not "something in config".
4. **Predict, THEN run.** Write down what the next experiment will show _if the hypothesis is true_ — before running it. A prediction written after seeing the output is a rationalization.
5. **Conclude.** Prediction matched → strengthen, refine, or fix. Didn't match → the hypothesis is dead; record it as dead (do not resurrect it in two hours because you forgot). Either way, back to 3 — changing only ONE variable since the last run.

**Hard rule — the explanation test:** before applying any fix, state the mechanism in one sentence: "X caused Y because Z; the fix breaks the causation at Z." If you cannot, you do not have a fix, you have a perturbation that happened to pass. Perturbations return.

## 2. Symptom → triage table

Start at the row matching your symptom; run the discriminating checks in order. Commands are bash unless marked; most are identical in PowerShell.

| Symptom                                                             | Most likely causes, in order                                                                                          | First discriminating checks                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Passes locally, fails in CI                                         | env/toolchain drift; missing service or secret; parallelism; timezone/locale; case-sensitive FS (CI is usually Linux) | Diff versions: run the env-snapshot script from `agentic-diagnostics-and-tooling` locally, compare against versions printed in the CI log. Read the CI config for services/env the README never mentions. Run the suite locally with CI's flags (esp. parallel/workers flags). Try `TZ=UTC <test-cmd>` |
| Fails locally, passes in CI                                         | stale local state: build artifacts, caches, dirty tree, local config overrides                                        | `git status --short` (dirty files?); `git stash list`; clean build (see §2.1); `git clean -ndx` to _list_ ignored files that could interfere — review before ever cleaning for real                                                                                                                    |
| Flaky (intermittent) test                                           | timing/race; shared state between tests; test-order dependence; external dependency                                   | Run it alone N times: `for i in $(seq 20); do <one-test-cmd>                                                                                                                                                                                                                                           |     | echo "FAIL $i"; done`(PowerShell:`1..20 | ForEach-Object { <one-test-cmd>; if ($LASTEXITCODE -ne 0) { "FAIL $\_" } }`). Alone-green + suite-red = shared state or ordering. Alone-sometimes-red = timing or external dep. Then → flaky-test protocol in `agentic-validation-and-qa` |
| Regression after a merge/update                                     | one specific commit introduced it                                                                                     | Bisect. `git bisect start; git bisect bad; git bisect good <last-known-good-sha>` then test each checkout, `git bisect good`/`bad` accordingly; `git bisect reset` when done. Automate with `git bisect run <cmd>` — full recipe in `agentic-proof-and-analysis-toolkit`                               |
| Broke after dependency update                                       | breaking change or transitive bump in the update                                                                      | Diff the lockfile first, not the code: `git diff HEAD~1 -- package-lock.json pnpm-lock.yaml yarn.lock Cargo.lock poetry.lock uv.lock go.sum 2>/dev/null`. Read the changelog of the majors that moved. Pin back ONE package to confirm the culprit before fixing forward                               |
| Works, then breaks on re-run                                        | caching; state leak (files, DB rows, ports, global vars) written by the first run                                     | `git status --short` after the first run — did it dirty the tree? Clean build; fresh temp dir; check for a port/process left behind (see `agentic-run-and-operate` for process hygiene)                                                                                                                |
| Same code, different machine                                        | environment, not code                                                                                                 | env-snapshot both machines, `diff` the outputs → `agentic-config-and-environment` for the fix                                                                                                                                                                                                          |
| "Impossible" behavior (change has no effect; log line never prints) | you are not running the code you are editing: stale artifact, wrong install, wrong process, wrong file                | §2.1 clean build; `git grep -n "<the-log-line-text>"` — is the string even in the running artifact? Add a deliberate syntax error to the file you're editing: if nothing breaks, you found it                                                                                                          |

### 2.1 The clean-build check (run early, it's cheap)

A large fraction of "impossible" symptoms are stale build artifacts. Before deep theorizing:

```sh
git status --short          # dirty files you forgot about
git stash list              # changes hiding in stashes
git clean -ndx              # DRY RUN: lists untracked+ignored files (build outputs, caches)
# then rebuild with the project's clean path — discover it:
#   package.json "scripts", Makefile "clean" target, or the CI config's build steps
```

**Hard rule:** `git clean` only ever with `-n` first, and never convert to `-f` without reading the list — untracked files have no reflog (see `agentic-change-control`).

## 3. Designing discriminating experiments

When two hypotheses both fit the observations, do not test either in isolation — design the run whose outcome _differs_ between them.

- State A: "cache corruption". State B: "race between writers". Discriminator: run single-threaded with the cache intact. A predicts still-broken; B predicts green.
- If a candidate experiment would produce the same output under both hypotheses, it is not worth running. Ask of every experiment: _which branch does each outcome kill?_
- Cheapest discriminators, in rough order: toggle one env var/flag; run one test in isolation; pin one dependency; stub one boundary; bisect.
- Binary-search in _space_ when history doesn't help: delete/stub half the input or half the pipeline, keep the failure alive, repeat. (Full halving recipe: `agentic-proof-and-analysis-toolkit`.)

## 4. The traps

Each cost real sessions across many projects. The story column is the archetype.

| Trap                                           | Archetypal story                                                                                                                                                                          | Countermeasure                                                                                                                                                                                                      |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shotgun editing                                | Five files changed across three hypotheses; the suite goes green; nobody — including the agent — can say which edit mattered. Three of the five edits were noise and one hid a second bug | One variable per run (hard rule). Revert dead-hypothesis edits _immediately_: `git checkout -- <file>` or commit each experiment to a scratch branch so attribution survives                                        |
| Fixing the symptom at the wrong layer          | Null crash "fixed" with a null-check at the crash site; the real bug is the upstream writer that produced the null; it corrupts something else a week later                               | Ask "who produced the bad value?" and walk up until you find the first place the data is wrong. Fix there; the downstream check is optional armor, not the fix                                                      |
| Trusting your own earlier claim                | Session context says "confirmed: config loads correctly" from two hours ago; it was true before the refactor you did since. An hour is lost downstream of a stale fact                    | Claims decay. Re-verify any load-bearing claim before building on it — one command now beats an hour later. After context compaction, re-verify ALL of them (see `agentic-long-horizon-campaign` re-entry protocol) |
| "Fixing" the test                              | Assertion updated to expect the observed (wrong) value; suite green; the test now certifies the bug                                                                                       | Hard rule: a failing test is evidence, not an obstacle. Understand why it failed before touching it — anti-test-gaming rules in `agentic-validation-and-qa`                                                         |
| Assuming the bug is in the code you just wrote | It usually is — but when it isn't (stale artifact, dep bump, pre-existing latent bug your change exposed), this prior burns hours                                                         | `git stash` your change and re-run: still broken = not (only) your change. Cheapest experiment there is; run it in the first ten minutes                                                                            |
| Debugging the wrong environment                | Twenty minutes editing a file while the failure comes from the installed copy of the package, a different worktree, or a server started yesterday                                         | "Impossible behavior" row in §2. Deliberate-syntax-error trick. Check what's actually running: `agentic-run-and-operate`                                                                                            |
| Fix-by-upgrade                                 | "Bumped the framework and it went away." Nobody knows why. It comes back in the next minor version, now with a migration in between                                                       | An upgrade that clears a symptom without an identified mechanism is a data point, not a fix. Diff changelogs for the plausible cause; if none found, log it as open in the chronicle                                |

## 5. Escalation rule (hard rule)

After **two consecutive dead hypotheses** (three for genuinely gnarly domains), STOP mutating. The next action is a write-up, not another edit:

1. Write down: the repro command; every observation, _including negatives_; every dead hypothesis and the experiment that killed it.
2. Re-read the list cold. The mechanism that explains ALL observations — including the negatives — is usually not the one you've been chasing. One mechanism must explain everything; two half-fitting mechanisms means keep looking (`agentic-research-methodology` owns this evidence bar).
3. Still stuck → this is becoming a campaign: open a `CAMPAIGN.md` per `agentic-long-horizon-campaign` rather than losing the state at the next context boundary, and consider a fresh-context session or second agent given ONLY the write-up (a cold reader with clean priors regularly spots what the invested one cannot).

When the investigation ends — fixed, abandoned, or root-caused-but-deferred — file the chronicle entry per `agentic-failure-archaeology`. Multi-hour investigations that leave no record get re-fought.

## Provenance and maintenance

Authored 2026-07-02. The loop, triage table, traps, and escalation threshold are distilled cross-project practice: **hard rule** = violation predictably burns sessions; **default** = deviate with stated reason. The two-dead-hypotheses threshold is a default, not a law of nature.

**Volatile facts, re-verify if this file is old:**

- Lockfile filenames (`package-lock.json`, `pnpm-lock.yaml`, `uv.lock`, ...) track ecosystem churn — extend the list as ecosystems evolve.
- `git bisect` / `git clean` / `git log -S` (pickaxe) flag semantics — re-verify: `git bisect -h; git clean -h; git log --help` (search `-S`).
- Sibling skills referenced: `agentic-failure-archaeology`, `agentic-proof-and-analysis-toolkit`, `agentic-diagnostics-and-tooling`, `agentic-validation-and-qa`, `agentic-config-and-environment`, `agentic-run-and-operate`, `agentic-change-control`, `agentic-long-horizon-campaign`, `agentic-research-methodology` — re-verify against the library index (`README.md` in the skills root).
