# The Attic

Status: Living catalog of parked capabilities (ADR 0009)
Read when: Considering removing working code, resurrecting a parked capability, or wondering whether something was ever built

Working code is never silently deleted here (owner decision 2026-08-23). Before a
capability leaves `main`, it gets a permanent annotated tag (`attic/<name>-v1`)
and a row below stating what it did, which tests proved it, and the explicit
condition for bringing it back. Resurrection is one command:

    git checkout attic/<name>-v1 -- <path>

Rules:

1. A row is added in the same PR that removes the code, never later.
2. Every row names a resurrection condition — a measurable trigger, not "someday".
3. Rows are never deleted. A resurrected capability keeps its row, marked returned.
4. Commented-out code is not an accepted parking form anywhere in this repo.

| Capability         | Tag                         | What it did                                                                                                                          | Proven by                                                                                                                                                                      | Comes back when                                                                                                                                                                                        |
| ------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `codex-ci-autofix` | `attic/codex-ci-autofix-v1` | Tried to repair failed CI runs and open repair PRs. Parked because the workflow was retired on 2026-07-04 and has had no user since. | No successful repair recorded. Commit `863d87c7` records 100+ runs and zero landed fixes; `c4d9a5b6` records a mutation-verified stale-context guard, not a successful repair. | The owner approves a bounded trial for a recurring CI failure that existing repair workflows cannot handle, with a funded API budget and at least one validated repair before enabling automatic runs. |

Restore the workflow and its prompt:

```sh
git checkout attic/codex-ci-autofix-v1 -- .github/workflows/codex-ci-autofix.yml .github/codex/prompts/ci-autofix.md
```
