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
7. Reset and account changes invalidate in-flight ownership receipts and reads.
   Authenticated identity binds a read before it starts, independently of its
   returned rows. Empty accounts therefore clear prior account-held rows and
   aliases too. Auth events fence old completions and request a fresh pass if
   the previous account's read was still running. This adds no replay worker,
   server write, database migration or reassignment of device-only work.

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

An older saved copy never overwrites newer account data (review, 2026-10-24):

- Legacy or invalid bookkeeping keeps only never-delivered local rows pending.
  Rows the account already holds take the account's values on the next read,
  as the pre-#967 merge did, and are not resurrected if the account no longer
  returns them.
- Each owner records the newest valid account row version (`updated_at`) it saw.
  Late reads cannot lower that evidence. Otherwise a retained edit would be
  lost after reload when the unchanged newer account row returned.
  Pending edits restored from a saved copy are marked `restored`. They keep
  their value only while the account row is provably that same version. A
  newer, missing or unknown account version wins and releases them. Edits made
  in the current page are unaffected.

Bookkeeping limits (review, 2026-10-24):

- Only account work drives the "work on this device" notice. Device-only
  collections (drafts, projects) and device-only edits (the first move) stay
  protected from reads but are never owed. Proposal `rationale` is display
  text and is not owned.
- Reading drafts back from device storage creates no new obligation.
- A completed read prunes delivered stamps its start already covers. An older
  read that would have needed them is then ignored for that collection.
  Area reads use the same acceptance check before changing persistence caches,
  reactive mappings or selection, keeping those representations consistent.
  If a newer area-only read makes an account retry stale, the rejected pass
  requests a clean replacement so workflow hydration and journal replay still
  run. The replacement retains the existing identity and unmount guards.
- Binding a different authenticated account drops the previous account's rows,
  ownership and delivered local aliases, even when the new account is empty.
  Only never-delivered local creations keep their debt. Retained draft-transfer
  receipts keep their exact revisions and values under the new epoch. A legacy
  snapshot without an account marker retains same-account edits only when its
  row identity proves the match. Existing device-only retention stays in place.
- Delivered aliases and receipt account IDs also fence old operations when a
  legacy snapshot lacks an account marker. Pure device-only first sign-in keeps
  its existing epoch so valid in-flight local receipts still work.
- Binding is not an empty-account read. Neutral initial area placeholders prevent
  premature onboarding while the new account's read is pending. They contain no
  prior-account values, ownership or persistence mapping. The actual area read,
  including an empty result, replaces them through normal reconciliation.
- Retained local children are not silently reassigned when their prior account
  parent disappears. This is not whole-app account storage isolation: device
  drafts and other device-only surfaces keep their existing policies.
- Change tracking looks up owners through one alias map per collection and
  skips unchanged row objects, so a dispatch stays linear in the row count.

The focused checks must include the exact saved R-967 successful-capture target
and both safety controls, then new field/race, hydration, reset and provider cases.
Tests must prove both retention of unrelated work and eventual clearing after the
correct receipt. Existing positive queue-drain guards stay intact.

Wave 4 forbids browsers, services, Docker and full e2e. Focused mock/provider tests,
static checks and independent review provide local proof only. Browser, real
account/IndexedDB behavior, hosted CI and human acceptance remain unverified.
