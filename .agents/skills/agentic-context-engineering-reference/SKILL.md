---
name: agentic-context-engineering-reference
description: "Use for questions about how LLM agents themselves work and how to run them well: context windows and 'context rot', token costs and prompt caching, which model tier to use for a task, where instructions should live (system prompt vs CLAUDE.md/AGENTS.md/.cursor/rules vs skills), why an agent forgot something, subagent/tool design, structured outputs, or known agent failure modes (sycophancy, hallucinated APIs). Also when designing any multi-agent or long-session setup."
---

# Agentic Context Engineering Reference

The domain-theory pack: what a mid-level engineer needs to know about how LLM agents actually work, as it applies to running engineering projects — not a textbook. Most operational rules in this library (files-as-memory, re-verification, cold-reader review, runbook-shaped skills) derive from the mechanics below; knowing the mechanics lets you derive the next rule yourself instead of memorizing this library.

**Jargon:** *context window* = the model's entire working memory for a session, one long token sequence. *Compaction* = summarizing older conversation to fit the window. *Prompt caching* = provider-side reuse of an unchanged prompt prefix at reduced cost/latency. *Cold* = starting with empty context.

## When to use / when NOT to use

**Use when:** reasoning about agent behavior, cost, memory, model choice, or multi-agent design — the "why" behind the practices.

**Do NOT use for:**
- The operational protocols themselves: session state across days → `agentic-long-horizon-campaign`; doc/entry-file budgets → `agentic-docs-and-writing`; verification standards → `agentic-validation-and-qa`.
- Provider-specific API parameters, current model names, and prices — look those up in the provider's live docs; they churn too fast for any skill file.

## 1. Context mechanics — and what they force

**Everything is one sequence.** System prompt, instruction files, tool outputs, your own prior messages — one token stream. There is no separate "memory": anything not in the stream (or on disk) does not exist for the model.

**Attention degrades with length ("context rot").** Facts from early in a long session get skipped or misremembered even while technically still in the window; retrieval is best near the start and the end, worst in the middle. As of 2026-07-02, frontier windows are hundreds of thousands of tokens — degradation arrives well before the hard limit.

**Compaction loses detail silently.** When sessions summarize to stay under the limit, the summary keeps conclusions and drops the evidence, caveats, and exact numbers. Nobody is notified about what was dropped.

**Therefore (these are the load-bearing consequences):**
- Decisions, state, and evidence live in **files**, not conversation (the entire premise of `agentic-long-horizon-campaign` and `agentic-failure-archaeology`).
- Claims decay: anything load-bearing that was established long ago in-session gets **re-verified** before being built on (one command now beats an hour later).
- An agent's confident restatement of an early fact is not evidence the fact survived — check the file.

## 2. Token economics

- **Output tokens cost several times input tokens** on most providers; both count against usage limits. Generating a 400-line file is expensive; reading one is cheap-ish; re-reading it five times is not.
- **Prompt caching** discounts a re-sent unchanged *prefix* heavily, but any change near the top invalidates everything after it, and caches expire in minutes. Practical consequences: stable instruction files pay for themselves; frequent small edits to early-context material are anti-economical; a paused-then-resumed session re-pays for its own history.
- **Subagents/cold sessions pay a cold-start tax:** each must re-read enough context to act — commonly tens of thousands of tokens before any useful work. Fan-out multiplies this. Delegation is worth it when the subtask is big or parallel; for small serial tasks, inline work in the session that already holds the context is cheaper (empirically the lesson of this library's own authoring).
- **Usage limits are real:** plans meter tokens per rolling window. Big parallel fan-outs can burn a whole window in minutes. Pace expensive work; checkpoint to disk so an interruption costs nothing but time.

## 3. Model tiering (defaults)

- **Smaller/cheaper tier** (fast models): well-scoped, runbook-guided, verifiable work — apply a documented procedure, write tests against a spec, mechanical refactors. The whole purpose of a skill library is to push more work down-tier safely: a good runbook substitutes for judgment the smaller model doesn't have.
- **Frontier tier:** ambiguous architecture calls, adversarial review, novel derivation, anything where being subtly wrong is expensive and no runbook exists.
- **The tier is per-task, not per-project.** Route the task, not the repo.
- **Escalation signal:** a smaller model that is looping (same fix attempted twice, contradictory claims) has exceeded its runbook — escalate the task rather than re-prompting harder (compare the two-dead-hypotheses rule in `agentic-debugging-playbook`).

## 4. Where instructions live (precedence and placement)

Rough precedence: **system prompt / tool harness > entry files (CLAUDE.md / AGENTS.md / .cursor/rules) > skills (loaded on demand) > conversation**. Later/lower layers cannot reliably override earlier/higher ones.

| Put it in... | When |
|---|---|
| Entry file | Always-relevant, short: build/test commands, hard rules, pointers to docs of record. Budgeted — see `agentic-docs-and-writing` (an entry file is context spent every single session) |
| A skill | Situational expertise loaded by trigger. The `description` frontmatter is written for the *retriever*: concrete trigger phrases, "use when...", not a title |
| Docs of record | Everything else durable; entry file points at them |
| Conversation | Nothing durable. If it matters past this session, it goes in a file |

**Skills are advisory, not enforced:** a model can fail to load one or ignore it under pressure. Anything that MUST hold needs a mechanical gate too — a hook, a CI check, a protected branch (`agentic-change-control` §"the gates themselves").

## 5. Delegation and tool design

- **Subagents start cold.** A delegation prompt must be self-contained: task, constraints, file paths, expected output form. "Fix the thing we discussed" hands the subagent nothing.
- **Verify at every delegation boundary.** Treat subagent output as plausible-until-demonstrated — same bar as any agent-authored change (`agentic-validation-and-qa`). The cheapest leverage in multi-agent design: the *author* and the *verifier* have separate contexts, so the verifier's clean priors catch what the invested author cannot (cold-reader effect — the same reason `agentic-debugging-playbook` recommends a fresh session after repeated dead ends).
- **Structured handoffs beat prose:** define the exact fields you need back (paths, verdicts, numbers); free-text summaries lose the load-bearing details.
- **Small orthogonal tools beat kitchen-sink tools:** a model choosing among 5 crisp tools errs less than one parsing a 40-option mega-tool. Same for scripts you write for agents to run: one job, `# Usage:` header, deterministic output (`agentic-diagnostics-and-tooling` §4).
- **Loop engineering (field term, as of 2026-07):** the maturing form of delegation — design the *system* that prompts agents (scheduled triggers, git/CI events) instead of prompting them yourself. A sound loop has: a way to find work, a way to act, a verifier SEPARATE from the author, external memory (files/tracker, not conversation), a verifiable stopping condition ("all tests pass", never "looks good"), and a token budget. Pitfalls match this skill's mechanics: vague goals loop forever; unbudgeted loops burn usage windows; auditability moves from code to execution traces, so log every iteration.

## 6. Known failure modes (assume present; design around)

| Failure mode | Shape | Countermeasure in this library |
|---|---|---|
| Confident hallucination | Plausible API/flag/path stated as fact; prose fluency masks it | Ground-truth-only rule: verify against `--help`/source before writing (all skills); wrong runbooks are worse than none |
| Sycophancy | Agent drifts toward confirming the user's (or its own) stated hypothesis | Assign the *refutation* role explicitly (`agentic-research-methodology`); refutation-first habit (`agentic-proof-and-analysis-toolkit` §7) |
| Test-gaming / metric-gaming | Optimizes the checkable proxy: edits the assertion, special-cases the input | Anti-test-gaming hard rules (`agentic-validation-and-qa`); verifier isolated from author (§5) |
| Context-rot drift | Late-session work quietly violates an early-session decision | Decisions in files; re-entry re-verification (`agentic-long-horizon-campaign`) |
| Premature convergence | First plausible mechanism adopted; search stops | Discriminating experiments; one-mechanism-explains-ALL-observations bar (`agentic-research-methodology`) |
| Scope drift | Helpful adjacent "improvements" accrete unrequested | Silent-scope-widening non-negotiable (`agentic-change-control`); drift alarms (`agentic-long-horizon-campaign`) |
| Claimed-but-not-run | "Tests pass" written without the run happening | Done-means-demonstrated; verification report with pasted output (`agentic-validation-and-qa`) |

## Provenance and maintenance

Authored 2026-07-02. Mechanics in §1–§2 are stable properties of the current LLM paradigm stated qualitatively; ALL specific numbers (window sizes, price ratios, cache TTLs, tier names) are deliberately omitted or hedged because they churn within months — **look up current values in your provider's docs; do not trust any number this old**. §3–§6 are distilled operational doctrine (defaults, not standards).

**Volatile facts, re-verify if this file is old:**
- Context window sizes, pricing, caching semantics: provider docs (Anthropic/OpenAI/Google model pages).
- Entry-file conventions and skill-loading behavior per tool (Claude Code, Codex, Cursor): each tool's current docs — this moves quarterly.
- Whether "attention degrades in the middle" still characterizes current frontier models: check recent long-context evals before citing.
- Sibling skills referenced: `agentic-long-horizon-campaign`, `agentic-failure-archaeology`, `agentic-docs-and-writing`, `agentic-validation-and-qa`, `agentic-change-control`, `agentic-debugging-playbook`, `agentic-diagnostics-and-tooling`, `agentic-proof-and-analysis-toolkit`, `agentic-research-methodology` — re-verify against the library index.
