---
name: agentic-proof-and-analysis-toolkit
description: "Use when a belief needs converting into a demonstration: 'prove which commit broke it' (bisection), 'boil this down to a minimal repro', 'are these two implementations equivalent' (differential testing), 'does this invariant actually hold', 'is this optimization worth it' (Fermi estimate), 'is this timing difference real' (statistical minimums), or when asked to root-cause with evidence rather than plausibility. The first-principles recipes behind 'prove it, don't just believe it'."
---

# Agentic Proof and Analysis Toolkit

The analysis methods that turn "I think" into "I showed". Each recipe below states when to use it, the steps, a worked micro-example, and — critically — **what the result does and does not prove**, because over-reading a result is how plausible-but-wrong conclusions get laundered into fact. `agentic-debugging-playbook` decides _what_ to investigate; this skill supplies the _instruments of proof_; `agentic-research-methodology` governs the full lifecycle when the question is bigger than one session.

**Jargon:** an _oracle_ is anything that can tell you whether an output is correct. A _repro_ is a reliable failure trigger. _n=1_ means a conclusion drawn from a single run.

## When to use / when NOT to use

**Use when:** any load-bearing claim rests on belief, memory, or plausibility instead of a demonstration you can paste.

**Do NOT use for:**

- Choosing hypotheses and triaging symptoms → `agentic-debugging-playbook`.
- Measurement mechanics (timing methodology, env snapshots, log mining) → `agentic-diagnostics-and-tooling`.
- Whether the evidence clears the bar to ship → `agentic-validation-and-qa`.
- Multi-experiment research programs → `agentic-research-methodology`.

## 1. Minimal reproduction (the halving method)

**When:** any failure whose trigger conditions are unclear; mandatory before reporting a bug upstream.

**Steps:** (1) Capture a full failing case. (2) Delete/stub half of it — half the input, half the config, half the code path. (3) Still fails → keep the half, recurse. Recovers → restore, halve the _other_ dimension. (4) Stop when removing anything makes the failure vanish. That object — often shockingly small — is the minimal repro.

**Micro-example:** a 400-line config crashes the loader. Halve to lines 1–200: still crashes. Halve again: 1–100 passes, 101–200 crashes. Three more halvings: a single duplicate key on line 137. Total: ~8 runs instead of reading 400 lines.

**Proves / doesn't:** the repro IS the specification of the bug — the set of conditions actually required. It does _not_ prove the mechanism; it hands you a small enough object that the mechanism becomes readable. Automatable for input files with `git bisect`-style scripting or delta-debugging tools where available.

## 2. Bisection

**When:** something worked at commit A, fails at commit B, and the cause is unknown.

```sh
git bisect start
git bisect bad                    # current commit is broken
git bisect good <sha-known-good>  # e.g. the last release tag
# git checks out the midpoint; test it, then:
git bisect good   # or: git bisect bad
# repeat until "X is the first bad commit"
git bisect reset                  # ALWAYS — returns you to where you started
```

**Automate it** when the test is a command with a truthful exit code (0 = good, 1–127 = bad, **125 = skip this commit**, e.g. build broken):

```sh
git bisect start HEAD <good-sha>
git bisect run sh -c '<build-cmd> || exit 125; <test-cmd>'
git bisect reset
```

**Micro-example:** suite green at `v2.1`, red on `main`, 160 commits between. `git bisect run npm test` → 8 automated checkouts → first bad commit is a dependency bump. Now diff the lockfile at that commit, per `agentic-debugging-playbook`.

**Proves / doesn't:** identifies the commit that _first exposes_ the failure — which is not always the commit that _contains_ the defect (a latent bug can be exposed by an innocent change). Requires: the failure is deterministic under your test command (flaky failures bisect to random commits — stabilize first), and each bisected commit builds (use exit 125 to skip). Bisect non-git spaces the same way: binary-search a config value, an input size, a dependency version list.

## 3. Differential testing

**When:** you have two things that _should_ agree — old vs new implementation, v1 vs v2 of a dependency, this machine vs CI, the optimized vs naive path. The cheapest oracle that exists: you don't need to know the _right_ answer, only that the two answers must match.

**Steps:** (1) Fix identical inputs (same seed, same fixtures). (2) Run both sides, capture to files. (3) `diff` (strip timestamps/ids first). (4) Any mismatch: minimize it with §1, then decide which side is wrong — do not assume the new side.

**Micro-example:** refactoring a date parser. Feed both parsers the same 10k lines: `old < cases.txt > old.out; new < cases.txt > new.out; diff old.out new.out`. Three mismatches; two are bugs in the _old_ parser (document them — behavior change!), one in the new. Ship with all three recorded.

**Proves / doesn't:** agreement on the tested inputs only — coverage is everything. It cannot catch a bug both sides share. Property-based extension: instead of fixed cases, state an invariant ("decode(encode(x)) == x") and generate inputs; a generator finds cases you wouldn't write.

## 4. Invariant checking

**When:** you believe "X is always true here" and anything load-bearing rests on that belief.

**Steps:** (1) Write the invariant as an executable assertion at the place it should hold. (2) Run the full suite / a realistic workload with it in place. (3) No trip = belief is now a measurement (over that workload). Trip = you just found the real bug's address. (4) Then either promote it to a permanent test/assertion via normal change control, or remove it (never leave undocumented asserts scattered — `agentic-diagnostics-and-tooling` §2.1 sweep rule applies).

**Micro-example:** "IDs in this table are unique." Add a temporary assert (or one SQL check: `SELECT id, COUNT(*) FROM t GROUP BY id HAVING COUNT(*) > 1;`). It returns rows. The "impossible" duplicate — not the downstream symptom you were chasing — is the bug.

**Proves / doesn't:** holds _over the workload you ran_, nothing stronger. An invariant worth checking twice is worth encoding permanently (golden suite candidate → `agentic-validation-and-qa`).

## 5. Back-of-envelope (Fermi) analysis

**When:** before optimizing, before architecting, before believing a surprising number.

**Steps:** (1) Decompose the quantity: requests/day × work/request × cost/work. (2) Estimate each factor to the nearest order of magnitude, citing the source of each guess. (3) Multiply. (4) Compare against the measured value.

**The rule that makes this a proof tool:** if measurement and estimate disagree by ~10× or more, **the model is wrong, and that is the finding** — either your understanding of the system is broken (common: something runs N times more often than you think) or the measurement is (also common). Do not "fix" anything until the estimate and the measurement reconcile.

**Micro-example:** "the nightly job is slow because of the API calls." Estimate: 5k records × 1 call × ~100 ms ≈ 8 min. Measured: 4 hours — 30× off. The model is wrong: instrument (per `agentic-diagnostics-and-tooling`) and find the call count is 5k × 40 due to an N+1 pattern. The fix is batching, and the _proof_ is that the reconciled model now predicts the measured time.

**Proves / doesn't:** magnitude sanity only — never fine differences. Its power is vetoing wrong mechanisms cheaply and catching miscounts.

## 6. Five whys, evidenced

**When:** post-incident or post-fix, to find the causal depth worth fixing.

**The discipline:** each "why" must cite an observation (command + output, log line, diff) — not a plausibility. The chain stops where you stop having evidence; a plausible-but-unevidenced "why" ends the chain honestly at "unknown — open question", it does not get asserted. Wrong five-whys chains are worse than none: they install a false root cause into the project's memory (`agentic-failure-archaeology` inherits whatever you conclude).

**Micro-example:** Deploy failed (CI log) → why: migration timed out (deploy log, line 214) → why: table lock held (DB slow-query log) → why: analytics job runs at deploy hour (cron config) → why: deploy time moved last month, job didn't (git log of the schedule file). Each arrow has an artifact. Fix options now rank themselves.

## 7. Refutation-first (the habit that keeps the rest honest)

Given any hypothesis you _like_, design the experiment that would **disprove** it, and run that first. Confirmation is what's left standing after a sincere attempt to kill. Agents (and humans) drift toward running the experiment their favorite hypothesis predicts it will pass — the two dead-hypothesis escalation rule in `agentic-debugging-playbook` and the assigned-adversary protocol in `agentic-research-methodology` are institutionalized versions of this habit. Practical form: before running any confirming experiment, write one sentence — "if <hypothesis> is false, the cheapest way to expose that is <experiment>" — and run that instead.

## 8. Statistical minimums (hard rules for agents)

- **Never conclude from n=1** for anything with variance (timing, flake rates, sizes under concurrency).
- Report **median + range** over ≥5 runs (timing methodology: `agentic-diagnostics-and-tooling` §2.4).
- **Effect < spread ⇒ no effect shown.** If your claimed improvement is smaller than the run-to-run variation, you have measured noise.
- Rates need denominators: "failed twice" means nothing without "out of how many runs" — for flake rates, run ≥20 iterations before quoting a number.
- Distrust round numbers arriving exactly at a threshold; re-run before celebrating.

## Provenance and maintenance

Authored 2026-07-02. Recipes are standard first-principles methods stated in their cross-project form; micro-examples are archetypes, not citations to a specific repo. Labels: **hard rule** where marked; everything else is a default recipe — adapt steps, never skip the "what it doesn't prove" caveat.

**Volatile facts, re-verify if this file is old:**

- `git bisect run` exit-code contract (0 good / 125 skip / 1–127 bad): `git bisect --help`, section "bisect run".
- The SQL duplicate-check syntax is ANSI and portable; verify against your dialect anyway.
- Sibling skills referenced: `agentic-debugging-playbook`, `agentic-diagnostics-and-tooling`, `agentic-validation-and-qa`, `agentic-research-methodology`, `agentic-failure-archaeology` — re-verify against the library index.
