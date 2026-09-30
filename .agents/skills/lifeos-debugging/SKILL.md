---
name: lifeos-debugging
description: Use for LifeOS debugging so failures are classified, reproduced, fixed narrowly, and verified without thrashing or weakening proof.
---

# lifeos-debugging

## Purpose

A repeatable debugging workflow so fixes are driven by evidence, not guesses.

## When to use

- A command, route, workflow, or test is failing.
- Behavior seems broken, misleading, or inconsistent.
- A regression or flaky-looking surface needs triage.

Skip it for new features with no failure, or pure docs/governance work.

## Process

1. Capture the exact failing command, error text, or reported behavior.
2. Classify it: code bug, test bug, workflow/control-plane bug, dependency/install issue, env/config issue, flaky external, expected safety block, or unclear.
3. Read the smallest relevant authority docs and source before patching.
4. Reproduce it, or reason from trustworthy evidence when you can't.
5. Patch the smallest surface that fixes the confirmed cause.
6. Add or update regression proof when the touched surface warrants it.
7. If the same approach fails twice, change approach.
8. Report what was checked, what wasn't, and remaining risk.

## Red flags

- "Patch first, understand later." Diagnose before editing.
- "The test is probably wrong." Prove it before changing it.
- Broad refactors justified as debugging.
- Weakened assertions used to hide uncertainty.
- Missing exact error text or repro steps in the handoff.

## Done when

- The failure is classified and the cause (or best-supported cause) is written down.
- The fix maps to a verified cause, with regression proof where it fits.
- Validation and remaining risk are reported exactly.

## Authority

`AGENTS.md`, issue scope, and repo validation rules override this skill. It does
not authorize schema weakening or risky shortcuts.
