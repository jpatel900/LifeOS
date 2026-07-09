---
name: agentic-architecture-contract
description: "Use when you need to document, defend, or discover a project's load-bearing architecture: writing an ADR (architecture decision record), recording invariants, marking code as do-not-change, listing known weak points, or judging whether a proposed integration widens the spine. Also when a session asks 'why is it built this way', 'can I refactor this', 'is this decision recorded anywhere', or a repo has no architecture docs and you must reverse-engineer the implicit contract."
---

# Agentic Architecture Contract

An architecture contract is the small set of documents that records what must NOT change casually in a project: the decisions that were made deliberately (ADRs), the behaviors that must always hold (invariants), the code that looks refactorable but is contractual (load-bearing list), and the flaws that are known and tolerated on purpose (weak points). Its job is to stop a future session — human or agent — from reversing a deliberate decision by accident, and to stop settled arguments from being re-litigated. This skill tells you how to write the contract, how to enforce it culturally (marking conventions), and how to reconstruct it when it does not exist yet.

## When to use / when NOT to use

| Situation                                                                               | Use                                                                                                           |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Recording a design decision, writing an ADR                                             | This skill                                                                                                    |
| Deciding whether an integration belongs on the spine or perimeter                       | This skill                                                                                                    |
| Marking code as load-bearing / do-not-change                                            | This skill                                                                                                    |
| Repo has no architecture docs; you must infer the implicit contract                     | This skill (section "Discovering the implicit architecture")                                                  |
| Deciding whether a _change_ is allowed to proceed, risk tiers, one-way doors, PR gating | **agentic-change-control** — that skill owns change gating; this one only defines what is protected           |
| First-contact repo recon (what to read in what order)                                   | **agentic-project-onboarding**                                                                                |
| Recording past failures and dead ends so they are not retried                           | **agentic-failure-archaeology** — weak points here are _tolerated_ flaws; failures there are _closed_ battles |
| General doc style, templates, doc budgets                                               | **agentic-docs-and-writing**                                                                                  |

Hard rule: one home per fact. If a decision is recorded in an ADR, other docs link to it; they do not restate it.

## The contract: four artifacts

Default layout (adapt to the repo's existing docs — discover with `git ls-files '*.md' | head -50`): ADRs at `docs/adr/` (the conventional path; template home is `agentic-docs-and-writing` §5), the three registers together in `docs/architecture/`.

| Artifact             | File                                | Answers                                       |
| -------------------- | ----------------------------------- | --------------------------------------------- |
| ADR log              | `docs/adr/NNNN-<slug>.md`           | "Why is it built this way?"                   |
| Invariants register  | `docs/architecture/INVARIANTS.md`   | "What must always hold?"                      |
| Load-bearing list    | `docs/architecture/LOAD-BEARING.md` | "What must I not touch without an ADR?"       |
| Weak-points register | `docs/architecture/WEAK-POINTS.md`  | "What is known-bad and why is it still here?" |

Also add one line to the agent's persistent-instructions file (CLAUDE.md / AGENTS.md / .cursor/rules — whichever the repo uses): `Before changing architecture, wire formats, IDs, or public APIs, read docs/architecture/ — especially LOAD-BEARING.md.` That single pointer is the cheapest enforcement mechanism available.

## 1. ADR-lite

An ADR (Architecture Decision Record) is a one-page record of one decision, written in ten minutes or it will not be written at all.

**The template has exactly one home: `agentic-docs-and-writing` §5 (ADR-lite).** Copy it from there — do not reconstruct it from memory; forked templates are how ADR logs diverge. This skill owns the _policy_: when an ADR is mandatory (below) and what must be recorded (the rejected alternatives and the reversal trigger are the load-bearing parts — a decision without them cannot be defended or revisited).

Numbering: zero-padded sequence (`0001-...`). Find the next number with:

```bash
ls docs/adr/ | sort | tail -1        # bash
```

```powershell
Get-ChildItem docs/adr | Sort-Object Name | Select-Object -Last 1   # PowerShell
```

### When an ADR is mandatory (hard rule)

Write an ADR for **any decision a future session could plausibly reverse by accident** — the test is not "was it hard to decide" but "would a competent stranger, seeing only the code, think the other option is an improvement?" If yes, the code alone cannot defend the decision; an ADR must.

Mandatory triggers:

- [ ] Chose between two viable technologies/libraries/storage engines.
- [ ] Chose an ID scheme, serialization format, wire protocol, or file layout that anything external (or any future data) depends on.
- [ ] Deliberately did the "worse-looking" thing (denormalized, duplicated, hand-rolled instead of using a library) for a reason.
- [ ] Rejected an integration or feature that will predictably be proposed again.
- [ ] Set a boundary: what a module is allowed to know about, who owns a concern.
- [ ] Anything on the load-bearing list (below) — every entry there must cite an ADR.

Not mandatory (default, not hard rule): naming, formatting, internal refactors with no external surface, anything trivially reversible with a `git revert` and no data migration.

## 2. Invariants register

An invariant is a behavior that must hold in every version of the system, stated so that a test could check it. Vague invariants ("the system is consistent") are worthless; each entry must name the observable and the check.

Format — one table in `INVARIANTS.md`:

| ID    | Invariant (testable statement)                                                                   | Checked by                 | ADR      |
| ----- | ------------------------------------------------------------------------------------------------ | -------------------------- | -------- |
| INV-1 | Given the same input record, `<id function>` produces the same ID on every run and every machine | `<test file or command>`   | ADR-NNNN |
| INV-2 | Messages on `<queue/topic>` are consumed in publish order per key                                | `<test>`                   | ADR-NNNN |
| INV-3 | `<public endpoint>` never returns a field not listed in `<schema file>`                          | `<schema validation test>` | ADR-NNNN |

Rules:

- Every invariant states WHAT holds, not HOW it is implemented. The implementation may change; the invariant may not (without an ADR superseding it).
- "Checked by" should point at an automated test. If none exists, write `UNCHECKED` in the column — an honest gap beats a fake reference. Turning UNCHECKED into a test is standing backlog (evidence standards live in **agentic-validation-and-qa**).
- Cap the register. Heuristic (candidate practice, not hard rule): if you have more than ~20 invariants, most are not invariants — they are current behavior. Keep only the ones whose silent violation would corrupt data, break external consumers, or invalidate stored history.

## 3. Load-bearing code and the marking convention

**Load-bearing code** is code whose current behavior is a contract even though nothing in its appearance says so. It compiles the same after a "cleanup," passes local tests, and quietly breaks something external or historical. The classic categories:

| Category                                                                   | Why it looks refactorable        | Why it is contractual                                               |
| -------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------- |
| Deterministic ID / hash schemes                                            | "Just a hash function"           | Stored data and dedup logic depend on byte-identical output forever |
| Wire formats / serialization field order                                   | "Just JSON encoding"             | External consumers and old stored payloads parse it                 |
| Public API shapes (routes, CLI flags, exit codes, env var names)           | "Just rename for clarity"        | Unknown callers depend on the exact surface                         |
| Ordering guarantees (queue consumption, iteration order exposed to output) | "Order isn't specified anywhere" | Downstream systems observed and now rely on it                      |
| Timestamp/locale/precision formatting in persisted output                  | "Cosmetic"                       | Diffs, checksums, and parsers downstream                            |
| Randomness seeds / tie-breaking rules                                      | "Arbitrary"                      | Reproducibility of past results                                     |

### Marking convention (hard rule)

1. **The list is the source of truth.** `LOAD-BEARING.md` is a table: `path (file or symbol) | what must not change | why | ADR`. This is the documented "do not change without ADR" list. Changing anything on it without a superseding ADR is a violation — the enforcement mechanics (review gates, risk tiers) belong to **agentic-change-control**.
2. **Inline comments only where the code cannot show it.** At the exact line where the trap is invisible, add a short marker comment pointing back to the list, e.g. `// LOAD-BEARING: field order is the wire format. See docs/architecture/LOAD-BEARING.md (ADR-0007).` Do not sprinkle markers broadly — a marker on every file trains readers to ignore markers. One marker per trap, at the trap.
3. **Grepability.** Use one exact token — `LOAD-BEARING` — so this always finds every marker:

```bash
grep -rn "LOAD-BEARING" --include="*.*" .        # bash
```

```powershell
Get-ChildItem -Recurse -File | Select-String -Pattern "LOAD-BEARING" | Select-Object Path, LineNumber, Line   # PowerShell
```

## 4. Known-weak-points register

A weak point is a flaw you know about, chose to tolerate, and wrote down — so no session wastes a day rediscovering it, "fixing" it prematurely, or being surprised by it in an incident. Hiding weak points is the failure mode; the register exists to make them boring.

Format — table in `WEAK-POINTS.md`, three mandatory columns:

| Weak point (stated plainly)                                         | Why tolerated                                     | Fix trigger                                                      |
| ------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------- |
| `<component>` holds all state in memory; crash loses in-flight work | Volume is tiny; durability cost not yet justified | First real data-loss incident, OR sustained load > `<threshold>` |
| No auth on `<internal endpoint>`                                    | Only reachable inside `<network boundary>`        | The moment anything outside that boundary can reach it           |
| `<module>` is O(n²) over `<collection>`                             | n < 100 today                                     | n observed > `<value>` in production                             |

Rules:

- "Stated plainly" means the sentence would survive being read aloud in an incident review. No euphemisms ("suboptimal"), no burying in a paragraph.
- **Fix trigger is mandatory.** A weak point without a trigger condition is either an unacknowledged bug (fix it or file it) or permanent design (then it belongs in an ADR's Consequences, not here).
- Distinguish from **agentic-failure-archaeology**: that chronicle records _approaches that failed and must not be retried_. This register records _live flaws in the current system_. An entry can graduate from here to there when the fix lands.

## 5. Design doctrine: spine vs perimeter

This doctrine generalizes across agentic projects. Terms first:

- **Spine**: the single component that holds the truth for a given concern — the one datastore for state X, the one module that assigns IDs, the one scheduler that decides what runs. There is exactly one spine per concern (**single holder of truth**).
- **Perimeter**: everything that connects the spine to the outside world — importers, exporters, notifiers, UI adapters, third-party syncs. Perimeter components talk to the spine through a **narrow, one-way interface**: they either feed data in through one entry point, or read data out through one query surface. They do not hold their own copy of the truth and nothing on the spine knows they exist.

| Doctrine                         | Statement                                                                                                                                                                                                                                                                    | Strength                        |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Single holder of truth           | For every concern (state, IDs, schedule, config), exactly one component owns it; everyone else asks                                                                                                                                                                          | Hard rule                       |
| Narrow one-way perimeter         | Integrations get one interface in one direction; if an integration needs bidirectional deep access, it is trying to become a second spine                                                                                                                                    | Hard rule                       |
| Reject spine-widening by default | Any proposal that adds a second writer of the truth, a second scheduler, or a bypass around the spine's interface is rejected unless an ADR argues it in                                                                                                                     | Default (override only via ADR) |
| Boring by default                | Choose the most boring technology that meets the requirement (files before databases, SQLite before a server, the standard library before a framework). Burden of proof is on novelty: the novel option must show a requirement the boring one fails, in writing, in the ADR | Default                         |

The spine-widening test to run on every proposed integration: _"If this integration is deleted tomorrow, does the spine still work unchanged?"_ If no, it is not an integration — it is an architecture change and needs an ADR.

Why this doctrine matters more in agentic projects (heuristic, but consistently observed): agent sessions are enthusiastic integrators. Each session, seeing a narrow interface, is tempted to widen it "just for this feature." Without a written doctrine to point at, each widening looks locally reasonable, and the spine dissolves in a dozen sessions. The doctrine's value is that it is _citable_: a session can reject a widening by reference instead of re-arguing it.

## 6. Discovering the implicit architecture (no contract exists yet)

When you land in a repo with no architecture docs, reconstruct the contract from evidence before writing anything. (Full first-contact recon order is **agentic-project-onboarding**; this section is only the architecture-extraction pass.)

**Step 1 — Trace the entry points.** Find every way execution starts; each one anchors a public surface.

```bash
# Manifest-declared entry points (check whichever manifests exist):
cat package.json | grep -A5 '"bin"\|"main"\|"scripts"'          # Node
grep -A10 '\[project.scripts\]\|entry_points' pyproject.toml setup.cfg 2>/dev/null  # Python
grep -rn "ENTRYPOINT\|CMD" Dockerfile* 2>/dev/null               # Containers
grep -rn "func main\|if __name__\|fn main" --include="*.go" --include="*.py" --include="*.rs" . | head -20
```

**Step 2 — Follow the data.** Truth lives where data persists. Find the stores, then find their single writer (or discover, alarmingly, that there are several).

```bash
git ls-files | grep -iE '\.sql$|migration|schema|\.proto$|\.avsc$|openapi|swagger'   # schemas & wire formats
grep -rniE "connect|open\(|createClient|new .*Client" --include="*.py" --include="*.js" --include="*.ts" --include="*.go" . | head -30  # who touches stores
```

Everything matching the first command is presumptively load-bearing (wire format / persistence contract) until proven otherwise.

**Step 3 — Diff the public surface across releases.** What has NOT changed across many releases while everything around it churned is the implicit contract — stability under churn is the strongest signal of load-bearingness.

```bash
git tag --sort=creatordate | tail -5                     # recent releases (if tagged)
git diff <old-tag>..<new-tag> --stat -- <api-dir>        # how much the public surface moved
git log --format= --name-only | sort | uniq -c | sort -rn | head -25   # bash: churn hotspots
```

```powershell
git log --format= --name-only | Where-Object { $_ } | Group-Object | Sort-Object Count -Descending | Select-Object -First 25 Count, Name   # PowerShell: churn hotspots
```

Read the result two ways: high-churn files near persistence or APIs are candidate weak points; zero-churn files that everything imports are candidate load-bearing code. Confirm the latter with `git log --follow -- <file>` — a file untouched for a year with many importers is contractual until an ADR says otherwise.

**Step 4 — Mine decisions from history.** Commit messages and PR descriptions are fossil ADRs.

```bash
git log --grep="decid\|instead of\|chose\|switch\|migrat" -i --oneline | head -20
```

**Step 5 — Write the contract you found.** Backfill ADRs only for decisions that are (a) still active and (b) plausibly reversible by accident — do not archaeologize everything. Mark backfilled ADRs `Status: accepted` with the _original_ decision date if discoverable (`git log --follow` on the relevant files), else the backfill date with a note. Then populate the other three registers and add the pointer line to the agent memory file. Budget: the entire backfilled contract for a mid-size repo should fit in one session; if it cannot, you are recording current behavior, not decisions.

## Provenance and maintenance

- Authored 2026-07-02. Doctrine and templates are experience-derived heuristics except where marked "hard rule"; the spine/perimeter doctrine is a strong default, consistently observed across agentic projects but not a theorem.
- Volatile facts: none load-bearing. The shell commands use only git, grep, ls, cat, and PowerShell built-ins; all flags used (`git log --format= --name-only`, `git tag --sort=creatordate`, `git diff --stat`, `grep -rniE`) are long-stable. As of 2026-07-02.
- Re-verify commands if git behavior is suspected to have drifted: `git log --help`, `git tag --help`, `grep --help` (bash) / `Get-Help Select-String` (PowerShell).
- Cross-references (re-check on library reorganization): agentic-change-control (gating), agentic-project-onboarding (recon), agentic-failure-archaeology (failure chronicle), agentic-validation-and-qa (evidence for invariant checks), agentic-docs-and-writing (doc style).
