---
name: verification-before-completion
description: Use when about to claim work is complete, fixed, or passing, before committing or creating PRs - requires running verification commands and confirming output before making any success claims; evidence before assertions always
---

# Verification Before Completion

Claim success from evidence you saw, not from expectation. Before you say work is done, fixed, or passing, check that the result actually shows it.

- Use the check that fits the claim: the test run, the build output, the rendered page, the diff. One good check is enough. Don't repeat it without a new change.
- If an agent or worker reports success, look at the actual diff or output before you repeat the claim. A report is a lead, not proof.
- Don't say a test passes if you didn't run it. Don't say a change works if you only read the code.
- Say plainly what you did not verify, and why.
- If a check fails or was skipped, report that as it is. A partial result stated honestly beats a clean summary that isn't true.
