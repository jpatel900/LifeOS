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

| Capability | Tag | What it did | Proven by | Comes back when |
| ---------- | --- | ----------- | --------- | --------------- |

_No entries yet. The first entries land with the ADR 0009 implementation slice._
