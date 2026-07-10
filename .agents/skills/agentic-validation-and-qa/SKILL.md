---
name: agentic-validation-and-qa
description: "Use when deciding whether work is actually done, what counts as evidence, or how to validate an agent-authored change: 'is this done', 'verify the fix', 'write the verification report', 'the tests pass but I'm not sure', 'can we trust this PR', 'this test is flaky', 'should I skip this test', 'set acceptance criteria'. Also when reviewing a diff that weakens or deletes tests, or when defining a golden/never-regress suite."
---

# agentic-validation-and-qa

The evidence bar for agent-driven work. One rule dominates everything else here:
**DONE MEANS DEMONSTRATED** — a change is complete when its intended behavior has
been *observed* (a test run, a command's output, a screenshot), never when the code
"looks right." Agent-generated code is uniquely good at looking right while being
wrong, so the burden of proof is on demonstration, and the demonstration goes into
the PR or report verbatim. This skill defines what counts as evidence, how to set
acceptance thresholds before you see results, the hard rules against gaming tests,
and the protocols for flaky tests and for validating changes another agent wrote.

## When to use / when NOT to use

| Situation | Use |
|---|---|
| Deciding whether a change is "done" and what proof to attach | THIS SKILL |
| Setting pass/fail criteria before running a validation | THIS SKILL |
| Reviewing a diff that touches, skips, or deletes tests | THIS SKILL |
| A test is flaky and someone wants to retry-until-green | THIS SKILL |
| Validating a change an agent authored | THIS SKILL |
| Claims leaving the repo (README, blog, announcement, benchmark claims to outsiders) | `agentic-external-positioning` |
| Research-grade evidence, hypothesis testing, predicting numbers before running | `agentic-research-methodology` |
| Whether a change needs review at all, one-way-door classification, PR hygiene | `agentic-change-control` |
| Finding *why* something fails (triage, discriminating experiments) | `agentic-debugging-playbook` |
| Minimal repro, bisection, differential testing recipes | `agentic-proof-and-analysis-toolkit` |
| Instrumentation and measurement tooling | `agentic-diagnostics-and-tooling` |

## 1. Done means demonstrated (hard rule)

A task is complete when ALL of these hold:

- [ ] The intended behavior was **observed**, not inferred from reading the code.
- [ ] The observation is **captured verbatim** (command + output, test log, screenshot) in the PR description, commit message, or report — not paraphrased as "tests pass."
- [ ] The observation would have **failed before the change** (for fixes: you saw red, then green — see §3).
- [ ] What was NOT verified is **stated explicitly** (see §5).

"It compiles," "the types check," "I reviewed the logic carefully" are not demonstrations. They are necessary preconditions at best.

### Evidence hierarchy (strongest first)

| Rank | Evidence | Notes |
|---|---|---|
| 1 | Automated test that fails without the change, passes with it | Permanent, re-runnable, regression-proof |
| 2 | Exact command + captured output showing the behavior | Re-runnable by a reviewer; paste verbatim |
| 3 | Screenshot / recording of the behavior | For UI work; pair with the steps to reproduce it |
| 4 | Log excerpt from a real run | Include enough context lines to locate it |
| 5 | Manual walkthrough description ("I clicked X, saw Y") | Weakest acceptable; only when 1–4 are impractical, and say so |
| — | "The code looks correct" | NOT evidence. Never sufficient. |

Default: use the highest rank that is practical. A fix without rank-1 evidence needs a stated reason (e.g., "requires production data; verified via rank 2 against staging").

### Finding the test command in an unfamiliar repo

```bash
# Look in these, in order — the CI config is the source of truth for what "passing" means:
ls .github/workflows/ 2>/dev/null && grep -rE "run:" .github/workflows/ | grep -iE "test|check"
cat package.json 2>/dev/null | grep -A5 '"scripts"'      # JS/TS
cat Makefile 2>/dev/null | grep -E "^[a-z-]+:" | head    # make targets
ls pyproject.toml setup.cfg tox.ini noxfile.py 2>/dev/null  # Python
cat CONTRIBUTING.md README.md 2>/dev/null | grep -iE "test|check" | head
```

Record the result as `<test-command>` and use it consistently. If CI runs more than tests (lint, typecheck, build), "done" means the full CI-equivalent set passes locally, not just the tests you touched.

## 2. Pre-registered acceptance thresholds (hard rule)

**Pre-registration**: writing down the pass/fail criterion BEFORE running the validation. A threshold chosen after seeing the results is a rationalization — you will unconsciously pick the number your result clears.

Procedure:

1. Before running anything, write in the PR/issue/worklog: the metric, the threshold, and the direction. Examples:
   - "Fix is accepted if all 3 previously-failing tests in `<test-file>` pass AND the full `<test-command>` suite passes."
   - "Perf change is accepted if p95 latency on the benchmark drops ≥ 10%; rejected if any correctness test regresses."
   - "Migration is accepted if row counts match source exactly and spot-check of 20 random rows is field-identical."
2. Run the validation.
3. Compare against the pre-registered threshold. Three outcomes only: **accept**, **reject**, or **pre-registration was wrong** — in which case you write down WHY the threshold was mis-set, set a new one, and re-run. You do not quietly move the goalposts.

Timestamped pre-registration for anything contested:

```bash
git notes add -m "PRE-REG $(date -u +%Y-%m-%dT%H:%M:%SZ): accept if <criterion>" HEAD
# or simply commit the criterion to the worklog/issue BEFORE the validation commit —
# the git history ordering is the timestamp.
```

Default thresholds when nobody has set one (candidate practice, adjust per repo):
zero new test failures; zero new lint/typecheck errors; no unexplained output diff
in anything the change should not have touched.

## 3. Test discipline

### Every bug fix adds the test that would have caught it (hard rule)

Order matters — **red first, then green**:

```bash
# 1. Write the test for the buggy behavior. Run it. CONFIRM IT FAILS.
<test-command> <path-to-new-test>        # must be RED — capture this output
# 2. Apply the fix.
# 3. Run again. CONFIRM IT PASSES.
<test-command> <path-to-new-test>        # must be GREEN — capture this output
# 4. Run the whole suite.
<test-command>
```

If you wrote the fix first, verify red anyway: `git stash` the fix, run the test (must fail), `git stash pop`, run again (must pass). A test you never saw fail proves nothing — it may pass vacuously (wrong assertion, wrong code path, test not even collected).

### Tests assert behavior, not implementation (default)

- Assert on outputs, state transitions, and observable effects — not on internal call sequences, private field values, or exact log strings.
- Heuristic: if a pure refactor (same behavior, different structure) would break the test, the test is asserting implementation.
- Exception: contract tests for a deliberately-frozen interface may assert structure. Label them as such.

### The golden set

**Golden set** (also: certified suite): a small, named subset of tests that must NEVER regress — the executable definition of "the product still works." Characteristics:

- Small enough to run on every change (minutes, not hours).
- Each test maps to a user-visible or contract-level behavior.
- **Changing or deleting a golden test is a one-way-door-class change**: it requires the elevated review process defined in `agentic-change-control`, because loosening the golden set silently lowers the definition of "working" for every future change.

Discover whether a repo already has one:

```bash
grep -riE "golden|smoke|certif|critical|must.pass" --include="*.md" --include="*.yml" --include="*.yaml" -l . | head
# also check CI for a required/blocking job vs optional jobs
```

If none exists and you are doing sustained work in the repo, propose one (5–20 tests) and record it in the docs of record (`agentic-docs-and-writing`).

## 4. Anti-test-gaming rules (hard rules — no exceptions without human sign-off)

These exist because the cheapest way to make a red suite green is to lower the bar, and agents under "make tests pass" pressure will find that path.

| # | Rule | The violation it blocks |
|---|---|---|
| 1 | **Never weaken an assertion to make a test pass.** Changing `assertEqual(x, 5)` to `assertTrue(x > 0)`, widening a tolerance, or asserting on less of the output is changing the spec, not fixing the code. If the spec genuinely changed, say so in the PR and get the same review the spec change itself requires. | Silent spec erosion |
| 2 | **Never add skip/xfail/`.skip`/`@pytest.mark.skip`/`it.skip` without a linked issue and a reason string.** The issue tracks un-skipping. A skip without an issue is a deletion with extra steps. | Quiet test-suite decay |
| 3 | **Never special-case test inputs in product code.** No `if input == "test_user"`, no environment sniffing that changes behavior under test (test *seams* like dependency injection are fine; behavior *forks* keyed on test-detection are not). | Passing tests that validate nothing |
| 4 | **Deleting a failing test requires the same review as the change that broke it.** The test is a claim about behavior; deleting it is retracting the claim, which is at least as significant as the code change. | Evidence destruction |
| 5 | **Never hard-code an expected output captured from the current (possibly broken) implementation just to go green.** Snapshot/golden-file updates must be reviewed as spec changes: the diff of the snapshot IS the diff to review. | Locking in bugs |

Reviewer's quick scan for gaming in any diff that touches tests:

```bash
git diff <base>...HEAD -- '*test*' '*spec*' | grep -nE "skip|xfail|todo|\.only|tolerance|approx|sleep|retry" -i
git diff --stat <base>...HEAD -- '*test*' '*spec*'   # deletions in test files are a flag
```

`.only` (Jest/Mocha `it.only`/`describe.only`) is its own trap: it makes the suite report green while running one test. Grep for it before trusting any local "all green" claim.

## 5. Verification report template

Attach this to every non-trivial PR / task report. Honesty about non-coverage is **mandatory**, not optional politeness — a report that omits what wasn't tested is the primary way plausible-but-wrong changes get merged.

```markdown
## Verification

**Pre-registered criterion:** <what was written down before running — link/quote it>

**What was run:**
| Check | Exact command | Result |
|---|---|---|
| Unit tests | `<test-command>` | 142 passed, 0 failed (output below) |
| New regression test red→green | `<test-command> <new-test>` | red at <commit>, green at HEAD |
| Lint/typecheck | `<lint-command>` | clean |

**Verbatim output (key excerpts):**
<paste the actual terminal output — not a summary of it>

**What was NOT covered:**
- <e.g., "not tested against real S3, only the local stub">
- <e.g., "Windows path handling untested; developed on Linux">
- <e.g., "no load testing; correctness only">

**Environment:** <OS, runtime version — `git rev-parse HEAD` + tool versions>
```

If the "NOT covered" section is empty, that is a claim of exhaustive verification — which is almost never true. An empty section should draw reviewer suspicion, not comfort.

## 6. Flaky-test protocol

**Flaky test**: a test whose outcome varies across runs with no code change. Hard rules:

1. **Never silently retry-until-green.** A blanket retry annotation or a CI re-run button-mash converts a real signal (race condition, order dependence, resource leak) into noise, permanently.
2. **Quarantine with an issue.** Move the test to an explicitly-named quarantine group (or skip WITH a linked issue per §4 rule 2). The issue records: failure rate, first-seen date, suspected cause, and the reproduction attempt.
3. Confirm flakiness before quarantining — same commit, multiple runs:

```bash
# bash: run the single test 20 times, count failures
fails=0; for i in $(seq 1 20); do <test-command> <single-test> >/dev/null 2>&1 || fails=$((fails+1)); done; echo "failures: $fails/20"
```
```powershell
# PowerShell equivalent
$fails=0; 1..20 | ForEach-Object { <test-command> <single-test> *> $null; if ($LASTEXITCODE -ne 0) { $fails++ } }; "failures: $fails/20"
```

   0/20 failures → it is probably environment- or order-dependent: try running the full suite, or the suite in a different order, to reproduce.
4. A quarantined test that stays quarantined > <quarantine-ttl> (default candidate: 30 days) gets escalated: fix it or formally delete it under §4 rule 4. Quarantine is a waiting room, not a graveyard.
5. Flaky tests in the golden set (§3) are emergencies — the never-regress suite cannot contain dice rolls.

Root-causing the flake itself is `agentic-debugging-playbook` territory.

## 7. Validating agent-authored changes

Agent output has a specific failure signature: **plausible-but-wrong** — idiomatic, well-commented, confidently described, and subtly incorrect. Adjust review posture accordingly.

Checklist for reviewing a change authored by an agent (yours or another's):

- [ ] **Assume unproven until demonstrated.** The agent's claim "tests pass" is rank-nothing evidence until you see the output (§1 hierarchy). Verbatim pasted output in the PR is the minimum.
- [ ] **Re-run the claimed verification yourself when stakes are high** (touches golden set, security-adjacent, data-mutating, or a one-way door per `agentic-change-control`): check out the branch, run the exact commands from the verification report, diff your output against the claimed output.
- [ ] **Review the diff for scope creep**: `git diff --stat <base>...HEAD` — every touched file needs a reason traceable to the task. Agents drift into "while I was here" edits; unrequested changes are unreviewed changes.
- [ ] **Scan test changes for gaming** (§4 grep). Do this even when — especially when — the suite is green.
- [ ] **Check the test actually exercises the fix**: revert the product-code change (`git stash` or `git revert -n`), run the new test, confirm red.
- [ ] **Read the "NOT covered" section first.** If it's missing or empty, request it before reviewing anything else.
- [ ] **Verify claimed commands are real**: agents sometimes report flags or subcommands that don't exist. If a command in the report looks unfamiliar, run it with `--help` before trusting the narrative built on it.

Stakes-based depth (default tiers; align with `agentic-change-control` risk tiers):

| Change class | Minimum validation |
|---|---|
| Docs / comments only | Read the diff; render if markup |
| Reversible code change, tests included | Verify red→green claim + suite green + gaming scan |
| Golden-set, schema, API-contract, data-mutating | All of the above + re-run verification yourself + second reviewer |

## Provenance and maintenance

- **Authored:** 2026-07-02, from cross-project agent-workflow practice. The hard rules (§1, §2, §4, §6.1) are position statements adopted deliberately — stable by design. Tiering defaults in §7 and the 30-day quarantine TTL are candidate practice: tune per repo.
- **Volatile facts:** almost none by construction; the skill avoids tool-version-specific flags. As of 2026-07-02, skip-marker names referenced (`@pytest.mark.skip`, `it.skip`, `.only`, `xfail`) match pytest and Jest/Mocha conventions — re-verify with `pytest --help | grep -i skip` and the Jest docs if a grep in §4 stops matching.
- **Re-verification one-liners:**
  - Test-command discovery still valid for a given repo: re-run the §1 discovery block.
  - Golden-set existence/location: re-run the §3 grep.
  - Sibling-skill names referenced here (`agentic-change-control`, `agentic-external-positioning`, `agentic-research-methodology`, `agentic-debugging-playbook`, `agentic-proof-and-analysis-toolkit`, `agentic-diagnostics-and-tooling`, `agentic-docs-and-writing`): `ls ~/.claude/skills/ | grep agentic-`
