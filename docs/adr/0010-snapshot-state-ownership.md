# ADR 0010 — Snapshot state has explicit mutation owners

Status: local candidate for #967, authorized by the W5-4 brief on 2026-10-23.

## Problem

The workflow snapshot, account and two replay queues hold different subsets of
work. A failed snapshot write says the browser could not keep a recovery copy.
It does not prove that an account write is pending. Conversely, an empty replay
queue says nothing about memory-only areas, drafts, first moves, WIP swaps or
failed direct map writes. Account hydration must not erase those values merely
because a different operation succeeded.

The prior preserve-only experiment passed the successful-capture case but failed
the memory-only-area and earlier-failed-capture controls. It is not reused.

## Alternatives

| Approach                                                    | Decision                                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------------------------ |
| Clear or preserve one global boolean                        | Rejected. Neither identifies which work an acknowledgment covers.        |
| Infer all pending work from queue counts                    | Rejected. Several state mutations have no journal entry.                 |
| Track actual local changes and reconcile their exact fields | Chosen. Keeps local work, delivery evidence and storage health separate. |

## Ownership contract

1. The reducer owns serializable mutation metadata beside the workflow snapshot.
   Actual semantic row changes create field revisions. No-op actions, display
   messages, account readbacks and bookkeeping aliases do not create new work.
2. The existing local-state apply helper uses an explicit local transition,
   distinct from restoring a saved snapshot. Both dispatch paths use the same
   ownership implementation. The domain transition remains the sole owner of
   business behavior.
3. Account-backed rows keep pending fields until their own matching account
   values or exact mutation receipt arrive. An acknowledgment can release only
   the submitted revisions. Captures use their existing local/account identity
   mapping. Area creation records its actual returned account identity, never
   guesses identity from names.
4. Device-only drafts, project decisions and other retained local payloads keep
   their own ownership. A successful session snapshot or draft-store write is
   device durability, not account delivery. Derived review-log text, transient
   WIP refusals and server timestamps are not independent delivery obligations.
5. Account merges preserve pending fields and unmatched owned rows. A read
   carries its start revision. Fields changed after that point survive even
   if their own acknowledgment completed before the old read returned.
6. Storage health is independent. Snapshot failure marks storage blocked but
   creates no fictitious mutation. Pending is the union of snapshot owners and
   known replay/offline-queue debt. A failed queue read retains prior evidence.
   Latest-started and mutation-generation guards prevent old empty reads from
   clearing newer work.
7. Reset invalidates in-flight ownership receipts and reads. Existing account
   identity and unmount fences remain binding. This change adds no replay
   worker, server write, database migration or account-switching policy.

New rows carry a creation obligation separately from later field edits. An exact
creation receipt allows account defaults to replace optimistic defaults, while
later edits remain owned. Accepting a draft records the exact draft revisions
transferred into the task and proposal. Only those successful transfers retire
the corresponding draft history. A sibling draft remains independent.

Delivery advances the revision watermark too. This protects a read that started
after a local edit but before its acknowledgment, as well as reads started before
the edit. Existing aliasless echo matching can identify a displayed duplicate,
but cannot prove delivery by itself. Inferred identities keep local intent until
the account values match. Confirmed account edits retire their exact fields.
Refused optimistic transitions restore prior ownership without losing later work.

Map approval and completion replace whole graphs. Their account writes run in
order per task, while local edits apply immediately. Area recolors use the same
ordering helper per area. This prevents two successful writes completing out of
order and restoring older values. A failed earlier write releases the next one.
Queued writes check the reset/unmount fence before starting. This is an in-memory ordering fence,
not a durable replay queue or a cross-tab concurrency guarantee.

## Surface coverage

| Surface                           | Owner and receipt                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Raw captures                      | Each local capture, independent of later captures. Only its account receipt retires its raw fields.                      |
| New areas and colors              | Per-row name/color revisions, with exact returned area identity and submitted revision.                                  |
| Task/project drafts and decisions | Local rows survive account refreshes. Draft-store success does not settle account ownership.                             |
| First move                        | The task's edited field, separate from unrelated task/map fields.                                                        |
| WIP swaps                         | Every changed task, block and session field belongs to the same local transition. Telemetry is not a receipt.            |
| Map approval and completion       | Map fields and the approval's first move are tracked independently. Earlier results cannot clear later toggles/edits.    |
| Existing journalled transitions   | Preserve current journal/idempotency behavior. Matching account readback reconciles only the corresponding local values. |

## Compatibility and proof

Old snapshots remain readable. Missing or malformed bookkeeping must not discard
valid user rows. Restored local-only data is treated conservatively, and ownership
metadata is carried through subsequent snapshots. Initial demo seed and account
hydration are not new user mutations.

Rejected bookkeeping is removed before recovery reads it or infers identity.
Legacy UUID rows without receipts keep their fields pending until account values
agree. This may retain a warning longer than older code, but avoids silently
discarding edits whose delivery is unknown.

The focused checks must include the exact saved R-967 successful-capture target
and both safety controls, then new field/race, hydration, reset and provider cases.
Tests must prove both retention of unrelated work and eventual clearing after the
correct receipt. Existing positive queue-drain guards stay intact.

Wave 4 forbids browsers, services, Docker and full e2e. Focused mock/provider tests,
static checks and independent review provide local proof only. Browser, real
account/IndexedDB behavior, hosted CI and human acceptance remain unverified.
