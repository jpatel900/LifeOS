-- Final UX Loop C1, Target Cards 1+7 (audit 2026-07-26 finding P0#4):
-- ONE close per user per calendar day.
--
-- !! HUMAN REVIEW REQUIRED !!
-- This migration DELETES user rows (duplicate daily reviews). It is the only
-- way to add the constraint to an account that already has duplicates, and the
-- audit found exactly that: `review_entries` held FIVE rows for the single
-- date 2026-07-26 because "Close the day" could be pressed indefinitely.
-- Read the dedupe block below before applying to any account with real data.
--
-- WHAT THE APP DOES ABOVE THIS
-- ----------------------------
-- The Close moment now renders a verdict once the day is closed and stops
-- offering the action, so a second write is not reachable through the UI. This
-- index is the BACKSTOP for the paths the UI cannot see: a second tab, a
-- journal replay racing a mount, a future caller. Belt and braces, the same
-- shape as 20260726120000's client_write_id keys.
--
-- WHY A PARTIAL INDEX IS CORRECT **HERE** AND WAS WRONG **THERE**
-- --------------------------------------------------------------
-- 20260726120000's header records a real Postgres rule: `ON CONFLICT (a, b)`
-- infers its arbiter from the column list and will only consider a PARTIAL
-- index when the INSERT itself proves the predicate. PostgREST/supabase-js
-- `onConflict` sends column names and nothing else, so a partial index can
-- never be an arbiter there -- which is why THAT migration's indexes are plain.
--
-- This index is deliberately NOT an arbiter and must never become one. The
-- review upsert still says `onConflict: "user_id,client_write_id"` and still
-- infers 20260726120000's plain index; this one is only ENFORCED. Two
-- consequences, both intended:
--
--   * a replay of the SAME journal entry is still a silent no-op (its
--     client_write_id matches, `ignoreDuplicates` swallows it), and
--   * a genuinely SECOND close of the same day -- a different
--     client_write_id -- raises 23505 against this index instead of landing a
--     row.
--
-- The client treats that 23505 as terminal SUCCESS ("the account already has
-- this day's close") and drops the journal entry, rather than letting it
-- retry forever. See `reviewHandler` in `lib/durability/durableWrites.ts`.
--
-- The predicate is required, not decorative: `review_type` also takes
-- 'weekly' (20260506213000's check constraint), and a weekly review shares a
-- `period_start` with the daily close that begins its week. Without
-- `where review_type = 'daily'` this index would forbid that legitimate pair.
--
-- WHY (user_id, period_start) AND NOT (user_id, area_id, period_start)
-- -------------------------------------------------------------------
-- "Close the day" is one ritual over the whole day, not one per area: the
-- Close moment's counts, carry-forward and wins are all whole-day, and the
-- write is the single journalled `reviewType: "daily"` call in the app
-- (`lib/workflowContext/persistenceSync.ts`, verified as the only non-test
-- caller). Scoping by area would let the same day be "closed" once per area,
-- which is the unlimited-closes defect wearing a narrower hat. `area_id` is
-- still recorded on the row -- it just does not widen the key.
--
-- THE DATE IS THE USER'S LOCAL CALENDAR DAY
-- -----------------------------------------
-- `period_start` is written from the browser's LOCAL calendar day
-- (`localIsoDate` in `lib/review/dayClose.ts`), which is also what the Close
-- moment's own counts are derived from. Before this lane the write used the
-- UTC date while the readback used the local one, so a close taken at 20:00
-- local in the Americas was filed under tomorrow and no readback ever found
-- it -- PR #773's failure class, inside the write path itself. One derivation
-- now, on both sides of the key.
--
-- THE DEDUPE: RE-POINT BEFORE DELETE
-- ----------------------------------
-- `win_records_review_entry_fk` is `on delete set null (review_entry_id)`
-- (20260706120000), so deleting a duplicate review would SILENTLY unlink any
-- win that referenced it -- no error, just a win that forgot which review it
-- was harvested in. So wins are re-pointed to the survivor FIRST.
--
-- The survivor is the EARLIEST row per (user_id, period_start): `created_at`
-- is server-set and immutable (20260704160000's triggers), so the earliest row
-- is the moment the user actually finished their day. The later rows are the
-- accidental re-presses this migration exists to make impossible.

-- 1. Re-point wins away from the duplicates that are about to go.
with ranked as (
  select
    id,
    user_id,
    first_value(id) over (
      partition by user_id, period_start
      order by created_at asc, id asc
    ) as keeper_id
  from public.review_entries
  where review_type = 'daily'
)
update public.win_records as w
set review_entry_id = ranked.keeper_id
from ranked
where w.review_entry_id = ranked.id
  and w.user_id = ranked.user_id
  and ranked.id <> ranked.keeper_id;

-- 2. Drop the duplicates, keeping the earliest close per user per day.
with ranked as (
  select
    id,
    first_value(id) over (
      partition by user_id, period_start
      order by created_at asc, id asc
    ) as keeper_id
  from public.review_entries
  where review_type = 'daily'
)
delete from public.review_entries as e
using ranked
where e.id = ranked.id
  and ranked.id <> ranked.keeper_id;

-- 3. Make it impossible from here on.
create unique index review_entries_user_daily_close_key
  on public.review_entries (user_id, period_start)
  where review_type = 'daily';
