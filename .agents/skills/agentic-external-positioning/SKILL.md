---
name: agentic-external-positioning
description: "Use when anything is about to leave the repo: writing release notes, a changelog entry, a README badge or feature list, a benchmark claim, a paper, a blog post, a demo, or any sentence of the form 'we support X' / 'faster than Y' / 'novel technique'. Also when asked to 'announce', 'publish', 'ship the release', 'write the launch post', or verify that a public claim is actually true. Covers the claims ladder, the fresh-clone release gate, benchmark honesty, and demo scripting."
---

# agentic-external-positioning

Claims discipline for anything that leaves the repo. An external claim (release note, README line, benchmark number, demo, paper sentence) is a promise to a stranger who has none of your context. The rule that generates everything else here: **a claim may state only what has been demonstrated, and the demonstration must survive a fresh clone by someone with only the public docs.** This skill defines the tiers of claims, the proof each tier requires, and the pre-publication runbook.

## When to use / when NOT to use

| Situation | Verdict |
|---|---|
| Writing release notes, changelog entries, README feature lists, badges | USE |
| Making or reviewing a benchmark / "faster than Y" / "supports X" claim | USE |
| Preparing a demo, tutorial, quickstart, paper, or blog post | USE |
| Deciding whether something is "novel" vs "known technique applied here" | USE |
| Setting internal evidence standards, acceptance thresholds, test quality | NOT — use **agentic-validation-and-qa** (this skill only governs the public-facing statement built on that evidence) |
| Gating whether a risky change may ship at all, PR hygiene, one-way-door process | NOT — use **agentic-change-control** (this skill applies its one-way-door rule to publishing; the general framework lives there) |
| Writing internal docs, doc templates, house style | NOT — use **agentic-docs-and-writing** |
| Designing the benchmark/experiment itself (predictions, refutation) | NOT — use **agentic-research-methodology**; this skill governs how results are *reported* |

## The claims ladder (hard rule)

Every external sentence maps to a tier. You may publish a claim only at or below the tier you have demonstrated. When in doubt, claim one tier lower.

| Tier | Claim you may make | Proof required | Typical wording |
|---|---|---|---|
| 0 | "exists / experimental" | Code is in the repo | "experimental", "candidate", "work in progress" |
| 1 | "compiles / installs" | Clean build from a fresh checkout | "builds on <platforms>" |
| 2 | "tests pass" | Full test suite green on CI, link to the run | "CI passing" (badge must point at the real pipeline) |
| 3 | "works on our golden set" | Documented input set + recorded outputs, rerunnable | "handles the cases in `examples/` / our test corpus" |
| 4 | "works for you" | **Fresh-clone reproduction** (see below) by someone/something with only public docs | "quickstart", "getting started", any imperative 'run this' doc |
| 5 | "faster/better than Y" | Comparison run with pinned versions of BOTH sides, published harness, variance reported, limitations stated | benchmark tables, "N× speedup", "outperforms" |

Ladder violations to reject on sight:

- README says "supports X" when X is tier 0–2. Fix: label it "experimental" or delete the line.
- A quickstart (tier-4 claim by its nature) that has never been run outside the author's machine.
- A speedup number (tier 5) backed by a single lucky run against an unpinned, possibly stale competitor.
- A CI badge pointing at a pipeline that skips the slow tests the claim depends on.

Discovery — audit the current public surface for claims:

```bash
# bash: find claim-shaped language in public docs
grep -rinE 'faster|speedup|state.of.the.art|novel|outperform|supports|production.ready|blazing' \
  README* docs/ CHANGELOG* 2>/dev/null
```

```powershell
# PowerShell
Get-ChildItem README*,CHANGELOG*,docs -Recurse -File -ErrorAction SilentlyContinue |
  Select-String -Pattern 'faster|speedup|state.of.the.art|novel|outperform|supports|production.ready|blazing'
```

For each hit, ask: what tier is this claim, and where is the artifact proving that tier? No artifact → downgrade the wording or produce the artifact.

## The fresh-clone test IS the release gate (hard rule)

Reproducibility standard: any tier-4+ claim must survive a fresh clone by someone with only the public docs. Not "works in my checkout" — your checkout has untracked files, globally installed tools, env vars, and warm caches that a stranger does not.

Runbook — run this before every release that changes the quickstart, install steps, or any tier-4+ claim:

```bash
# bash
tmp=$(mktemp -d)
git clone <public-repo-url> "$tmp/fresh"     # the PUBLIC url, not your local path
cd "$tmp/fresh"
# Now follow the public README verbatim, top to bottom. Copy-paste only.
# You may not: export undocumented env vars, install undocumented tools,
# copy files from your working checkout, or "just quickly fix" anything.
```

```powershell
# PowerShell
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("fresh-" + [guid]::NewGuid())
git clone <public-repo-url> $tmp
Set-Location $tmp
# Same rules: follow the public README verbatim, copy-paste only.
```

Rules of the game:

1. **Clone the public URL**, not the local directory — local clones can carry refs and hooks the public cannot see. Find the URL: `git remote get-url origin`.
2. **Follow only public docs.** If you needed a step the README doesn't state, the release is blocked until the README states it.
3. **Log every deviation.** Each deviation is either a doc bug (fix the doc) or a claim bug (downgrade the claim). There is no third category.
4. **Prefer a colder environment when stakes are high** (default, not hard rule): a container or clean VM catches globally-installed dependencies that a fresh clone on your machine does not. `docker run --rm -it <base-image>` then clone inside it.
5. **Ideal executor is not the author.** A teammate, or an agent session started with zero project context and only the README, is a better proxy for the real user. An agent is a cheap, repeatable fresh-clone tester — use it.
6. Undocumented prerequisites (compiler, system library, API key) must be listed in the README with a version floor, or the install claim drops to tier 0.

If the fresh-clone test fails, the release does not go out. That is the entire gate. Fix, re-clone (a genuinely new temp dir — never reuse), re-run.

## Benchmark honesty (tier-5 claims)

A published number is the longest-lived artifact you will produce; people quote it years later stripped of every caveat. Requirements, all hard rules:

| Requirement | How |
|---|---|
| Pin both sides | Record exact versions: your side `git rev-parse HEAD`; theirs: release tag or commit hash, plus runtime versions (`python --version`, `node --version`, etc.). "Latest" is not a version. |
| Publish the harness | The benchmark script, input data (or generator + seed), and hardware description live in the repo (e.g. `bench/`). A number without a rerunnable harness is an anecdote. |
| Report variance, not the best run | ≥5 runs after warm-up; report median plus min/max or stddev. Publishing your single best run is selection bias with extra steps. |
| Same-machine, same-session | Both sides on the same hardware in the same session. Numbers from different machines or different days do not compose. |
| State what was NOT measured | Explicitly: workloads not tested, sizes not tested, the competitor's tuning effort (did you tune yours and run theirs on defaults?), cold-start vs warm. The "not measured" paragraph is mandatory, not optional humility. |
| Absolute numbers alongside ratios | "3× faster" must appear with the raw values (e.g. "12 ms vs 36 ms, median of 7 runs"). Ratios without absolutes hide whether anyone should care. |

Environment capture for the methodology appendix:

```bash
# bash — snapshot the benchmark environment
uname -a; git rev-parse HEAD; git describe --tags --always
```

```powershell
# PowerShell
[System.Environment]::OSVersion; git rev-parse HEAD; git describe --tags --always
```

Plus the language-ecosystem lockfile (`pip freeze`, `npm ls --depth=0`, `cargo tree --depth 1`, or equivalent) committed next to the results. How to *design* the experiment (pre-registered predictions, adversarial refutation) is owned by **agentic-research-methodology**.

## Novelty honesty (agentic projects especially)

Default label is "known technique applied here." "Novel" requires a real search: you looked for prior art (papers, existing tools, blog posts) and can name the closest prior work and state the delta. Agentic projects are especially prone to novelty inflation because recombining known pieces (retrieval + tool use + a loop) *feels* new.

Hard rules:

- Unproven things stay labeled **candidate/experimental in ALL public surfaces** — README, docs site, package description, demo captions — not just internal notes. A technique that is "candidate" in `docs/internal.md` but headlined in the README is a lie by layout.
- "Novel" in a public artifact must be accompanied by the closest-prior-work sentence: "unlike <closest thing>, this does <delta>." If you cannot write that sentence, write "we apply <known technique> to <context>."
- Internal status labels are owned by **agentic-architecture-contract** (decisions/invariants) and **agentic-research-methodology** (idea lifecycle); this skill's rule is only that the public label may never be more confident than the internal one.

## Demo discipline

A demo that works only on the author's machine with unstated setup is a liability: it converts one bad first impression per viewer into distrust of every other claim you make.

Hard rules:

1. **Script the demo path.** The exact commands live in the repo (e.g. `demo/run.sh` / `demo/run.ps1` or a documented sequence). "I'll just drive it live from my checkout" is not a demo, it is a performance.
2. The demo script passes the fresh-clone test like any other tier-4 claim.
3. Pin the demo's inputs. Live external dependencies (APIs, current websites, LLM endpoints) fail at demo time; prefer recorded/cached inputs, or state the live dependency in the demo doc.
4. For agentic demos (default, not hard rule): agent output is nondeterministic, so record a known-good run (terminal recording, transcript, or video) and publish it alongside the live path. Label it as a recorded run — passing a recording off as live is a claims violation.
5. Anything the demo skips or fakes is written down where the presenter will see it. A stub that the audience believes is real is an unpublished tier-5 claim.

## Changelog / release-note house rules

| Rule | Detail |
|---|---|
| User-visible changes only | Refactors, internal renames, CI tweaks: out. If a user cannot observe it, it is noise in this document. (Internal history lives in git log.) |
| Breaking changes flagged loudly | Separate **BREAKING** section at the top, each entry with the migration step. Never bury a breaking change mid-list. |
| Dates absolute | `2026-07-02`, never "last week" / "recently". Release notes are read years later. |
| Claims ladder applies | "Added support for X" in a release note is a public claim; it needs the same tier evidence as a README line. |
| Every entry answers "what do I do about it?" | Upgrade command, migration step, or "no action needed". |

Find the file of record: `ls CHANGELOG* CHANGES* HISTORY* NEWS* 2>/dev/null` (bash) / `Get-ChildItem CHANGELOG*,CHANGES*,HISTORY*,NEWS* -ErrorAction SilentlyContinue` (PowerShell). If none exists and you are releasing, create `CHANGELOG.md` — format conventions are owned by **agentic-docs-and-writing**.

## Publishing is a one-way door (hard rule)

Per **agentic-change-control**'s one-way-door framework: external artifacts — package registry releases, tagged GitHub releases, blog posts, papers, announcement threads — are cached, mirrored, and indexed the moment they go out. Deleting them later does not unpublish them (registry mirrors, web archives, screenshots, other people's lockfiles).

Consequences:

- **The human gate on publishing stays forever.** No matter how much autonomy the agent has earned inside the repo, "send it outside the repo" requires explicit human sign-off, every time. An agent may draft the release notes, run the fresh-clone gate, and stage the tag — a human pushes the button.
- Version numbers and tags, once pushed, are burned. Never reuse or force-move a public tag; publish a new patch version instead.
- Retractions don't erase, they append. Plan wording as if it is permanent, because it is.

## Pre-publication checklist

Run top to bottom before any external artifact ships:

- [ ] Every claim assigned a ladder tier; evidence artifact exists for each; wording downgraded where evidence is missing
- [ ] Fresh-clone test passed from the public URL, public docs only, zero undocumented deviations
- [ ] Tier-5 numbers: both sides pinned, harness in repo, ≥5 runs with variance, "not measured" paragraph written, absolutes next to ratios
- [ ] Nothing experimental is presented as supported on ANY public surface
- [ ] "Novel" appears only with a closest-prior-work sentence
- [ ] Demo path is scripted, in the repo, fresh-clone-tested; recorded runs labeled as recorded
- [ ] Changelog: user-visible only, BREAKING section on top, absolute dates
- [ ] Human sign-off obtained for the actual publish step
- [ ] Working tree clean and tagged commit is the tested commit: `git status --porcelain` is empty, `git rev-parse HEAD` matches what the fresh-clone test ran

## Provenance and maintenance

- Authored 2026-07-02 as part of the agentic-engineering skill library. The claims ladder, fresh-clone gate, and one-way-door rule are distilled practice (hard rules); items marked "default" or "candidate" are heuristics, not proven standards.
- Volatile facts: none load-bearing — this skill states process, not tool versions. The example grep/Get-ChildItem patterns for claim language are heuristic starting points; extend per project.
- Re-verification one-liners:
  - Public URL still correct: `git remote get-url origin`
  - Public claim surface drift: rerun the claim-language grep in "The claims ladder" against README/docs/CHANGELOG
  - Fresh-clone gate still green: rerun the fresh-clone runbook before each release (it is the gate, not a periodic audit)
- Sibling ownership map (as of 2026-07-02): evidence standards → agentic-validation-and-qa; one-way-door framework and publish gating process → agentic-change-control; experiment design → agentic-research-methodology; doc templates/style → agentic-docs-and-writing.
