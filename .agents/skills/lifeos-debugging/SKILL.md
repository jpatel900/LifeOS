---
name: lifeos-debugging
description: Use for LifeOS debugging so failures are classified, reproduced, fixed narrowly, and verified without thrashing or weakening proof.
---

# lifeos-debugging

## Overview / purpose

Provide a repeatable debugging workflow for LifeOS failures so fixes are evidence-driven instead of guess-driven.

## When to use

- A command, route, workflow, or test is failing.
- A user reports behavior that seems broken, misleading, or inconsistent.
- A regression or flaky-looking surface needs disciplined triage.

## Do not use when

- The work is a new feature with no failure to diagnose.
- The task is only docs planning or repo governance with no concrete malfunction.

## Process

1. Capture the exact failing command, error text, or user-reported behavior.
2. Classify the failure: code bug, test bug, workflow/control-plane bug, dependency/install issue, env/config issue, flaky external, expected safety block, or unclear.
3. Read the smallest relevant authority docs and source files before patching.
4. Reproduce the failure or reason from trustworthy evidence when reproduction is unavailable.
5. Patch the smallest surface that resolves the confirmed cause.
6. Add or update regression proof when the touched surface warrants it.
7. If the same approach fails twice, stop and change approach instead of thrashing.
8. Report what was checked, what was not checked, and remaining risk.

## Common rationalizations

- "I can patch first and understand later." No. Diagnose before editing.
- "The test is probably wrong." Prove that before changing it.
- "I already tried twice; a third attempt might work." Change approach instead.

## Red flags

- Broad refactors justified as debugging.
- Weakened assertions used to hide uncertainty.
- Missing exact error text or reproduction steps in the handoff.

## Verification

- The original failure mode is named precisely.
- The chosen fix maps to a verified cause, not a guess.
- Regression proof exists when appropriate for the touched surface.

## Done criteria

- Failure type is classified.
- Root cause or best-supported cause is documented.
- Smallest viable fix is applied or a blocker is surfaced plainly.
- Validation and remaining risk are reported exactly.

## Authority / safety boundaries

- `AGENTS.md`, issue scope, and repo validation rules override this skill.
- This skill does not authorize schema weakening, risky shortcuts, or broad cleanup.
