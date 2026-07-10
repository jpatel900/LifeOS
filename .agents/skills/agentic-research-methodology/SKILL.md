---
name: agentic-research-methodology
description: "Use when turning a hunch into an accepted result: 'I think X is causing Y, how do I prove it', designing an experiment, deciding whether a finding is real, running an A/B or before/after comparison, adopting or retiring an experimental idea/flag, or reviewing someone's (or some agent's) claimed discovery. Also when a conclusion is about to be written into the failure chronicle, an ADR, or a public claim."
---

# Agentic Research Methodology

The discipline that turns a hunch into an accepted result — or into a documented retirement, which is the _other_ success outcome. The failure this prevents: plausible mechanisms getting adopted because they explained the headline observation, fit the narrative, and nobody was assigned to kill them. In agent-driven projects the risk is amplified: agents generate fluent mechanisms on demand, and fluency reads as evidence.

**Jargon:** _pre-registration_ = writing the prediction down before running the experiment. _Negative observation_ = something that did NOT happen but would have under a rival mechanism. _Adversarial refutation_ = a deliberate, assigned attempt to disprove.

## When to use / when NOT to use

**Use when:** any belief is about to become load-bearing — adopted into code, written into the chronicle or an ADR, or claimed externally.

**Do NOT use for:**

- Individual proof techniques (bisect, differential test, Fermi) → `agentic-proof-and-analysis-toolkit`; this skill sequences them.
- Live bug triage → `agentic-debugging-playbook` (its loop is this lifecycle in miniature).
- Choosing WHICH open problems are worth a research program → `agentic-research-frontier`.
- Shipping mechanics for the adopted change → `agentic-change-control`.

## 1. The evidence bar (hard rules)

A mechanism is _accepted_ only when ALL of these hold:

1. **One mechanism explains ALL observations — including the negatives.** Not just the headline symptom: also why the failure _doesn't_ occur in configurations where a rival mechanism predicts it would. Two half-fitting mechanisms = keep looking. An observation that doesn't fit = the mechanism is incomplete, no matter how much you like it.
2. **It predicted numbers (or concrete observations) before the confirming run.** A mechanism that only ever explains data after seeing it has predicted nothing.
3. **It survived an assigned adversarial refutation** (§3).
4. **The experiments rerun.** Exact commands, versions, seeds recorded; someone else (or a cold session) can reproduce the result from the write-up alone.

## 2. Pre-registration (the cheapest honesty device that exists)

Before running any experiment intended to support a conclusion, write — in the experiment log, not your head:

```markdown
## Experiment <n> (<date>)

Hypothesis (mechanism, one sentence):
Prediction if TRUE: <specific number/observation, with tolerance>
Prediction if FALSE: <what you'd see instead>
Command(s): <exact, with versions/seeds>
```

Then run, then paste the actual output under the predictions. **Hard rule:** a post-hoc explanation of a surprising result is a NEW hypothesis requiring a NEW pre-registered experiment — it is never a conclusion. This is the single rule that separates measurement from storytelling; it costs four lines.

Experiment hygiene (defaults, mostly inherited): one variable per run; keep a control (the unmodified baseline, re-run under identical conditions — not remembered from last week); fix seeds where the system allows; statistical minimums per `agentic-proof-and-analysis-toolkit` §8.

## 3. Assigned adversarial refutation

Sycophancy is a documented failure mode (`agentic-context-engineering-reference` §6): an agent asked "is my hypothesis right?" drifts toward yes. So refutation is _assigned_, not hoped for:

- Before acceptance, a **separate cold session or second agent** receives: the observations (including negatives), the proposed mechanism, the experiment log — and the explicit role: _"Your job is to refute this. Find the observation it doesn't explain, the confound it ignores, the cheaper mechanism that fits equally well. Default to 'not proven' if uncertain."_
- The cold context is the point: clean priors, no investment in the mechanism, no memory of how hard it was to find (same cold-reader effect as `agentic-debugging-playbook` §5). Fresh context is the cheapest adversary an agentic project has.
- Surviving = the refuter concedes the mechanism uniquely fits. A refuter who merely _fails to engage_ hasn't tested anything — rerun with a sharper brief.
- Self-review is not refutation. The author checking their own work satisfies nothing in §1.3.

## 4. The idea lifecycle

Explicit states; an idea in no state is a rumor.

| State                 | Entry requirement                                                                                               | Lives where                                                                    |
| --------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1. Hunch              | Noticed something                                                                                               | Ideas log (§5) — one line, park it                                             |
| 2. Written hypothesis | Mechanism + pre-registered predictions (§2)                                                                     | Experiment log                                                                 |
| 3. Experiment         | Behind a flag/branch, never on the mainline                                                                     | Flag per `agentic-config-and-environment`; branch per `agentic-change-control` |
| 4. Result             | Predictions compared against outputs                                                                            | Experiment log, verbatim outputs                                               |
| 5a. **Adopted**       | Passed §1 bar including refutation → ships via normal change control + validation (`agentic-validation-and-qa`) | Codebase + ADR if load-bearing (`agentic-architecture-contract`)               |
| 5b. **Retired**       | Failed, superseded, or not worth it — with the WHY written down                                                 | Failure chronicle (`agentic-failure-archaeology`)                              |

**Hard rules:** documented retirement is a SUCCESS outcome — it permanently fences a wrong path; undocumented abandonment is the failure (the idea returns in six months wearing a new hat). And experiments do not linger: an experiment flag that has neither adopted nor retired within its stated window is a zombie — force the decision (`agentic-config-and-environment` owns the flag-removal checklist).

## 5. Where ideas come from (and the capture rule)

Historically, good engineering-project ideas disproportionately come from: **anomalies noticed while debugging something else** ("that's odd — why did the cache even matter there?"); **invariant violations** ("this should be impossible"); **10×-off Fermi mismatches** (`agentic-proof-and-analysis-toolkit` §5 — a reconciliation that fails is a discovery knocking); the negatives column of failed experiments; and friction repeated three times (the diagnostics §4 script rule generalizes: repeated pain is data).

**The capture rule (default):** when one appears mid-task, write ONE line in the ideas log (`IDEAS.md` or the project's equivalent) and **return to the task**. Chasing it now is scope drift (`agentic-change-control`); losing it is waste. The log gets triaged deliberately, ideas promoted to state-2 on merit, not on how shiny they were in the moment.

## 6. Reviewing a claimed discovery (checklist)

When an agent or human presents a finding — before you accept it anywhere:

- [ ] Is the mechanism one sentence, naming a cause, not a location?
- [ ] Were predictions written before the confirming run? (Ask to see the log's timestamps/ordering.)
- [ ] Does it explain the negatives? Name one rival mechanism and ask what observation kills it.
- [ ] Has anyone been _assigned_ to refute it? (Not "did anyone object.")
- [ ] Do the commands rerun, from the write-up alone, in a cold session?
- [ ] Is the claimed effect larger than the run-to-run spread?

Any unchecked box → the finding is _candidate_, and gets labeled that way everywhere it travels (`agentic-external-positioning` owns what may be claimed publicly).

## Provenance and maintenance

Authored 2026-07-02. This is the scientific method specialized to agent-driven engineering; the hard rules (§1, §2's post-hoc rule, §4's retirement rule) are the load-bearing ones. The "where ideas come from" list is distilled observation across projects — a default prior, not a law.

**Volatile facts, re-verify if this file is old:**

- The claim that assigned-refutation-by-cold-context outperforms self-review rests on the sycophancy failure mode; re-check `agentic-context-engineering-reference` §6 stays current on whether this remains true of frontier models.
- Sibling skills referenced: `agentic-proof-and-analysis-toolkit`, `agentic-debugging-playbook`, `agentic-research-frontier`, `agentic-change-control`, `agentic-config-and-environment`, `agentic-validation-and-qa`, `agentic-architecture-contract`, `agentic-failure-archaeology`, `agentic-context-engineering-reference`, `agentic-external-positioning` — re-verify against the library index.
