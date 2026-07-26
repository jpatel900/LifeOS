-- #737-A slice 2 (durable writes): server-side idempotency for wins and
-- review entries.
--
-- Slice 2 makes a confirmed win and a saved review device-durable by writing
-- them to the pending-writes journal (IndexedDB) BEFORE any network call, then
-- replaying the journal to the account on app start and on reconnect. A replay
-- can therefore run more than once for the same logical write -- two tabs, a
-- reconnect racing a mount, a response lost after the row landed. Without a
-- server-side idempotency key each replay would create a duplicate row.
--
-- The client pairs these indexes with
-- `upsert(..., { onConflict: "user_id,client_write_id", ignoreDuplicates: true })`,
-- so a replayed write is a no-op rather than a duplicate row or a thrown
-- unique violation.
--
-- WHY THESE ARE PLAIN UNIQUE INDEXES AND NOT PARTIAL ONES
-- -------------------------------------------------------
-- The first version of this migration copied
-- `20260706150000_add_capture_client_capture_id.sql` literally, including its
-- `where client_write_id is not null` predicate. CI's Migrations+RLS lane then
-- rejected every upsert with Postgres **42P10** ("no unique or exclusion
-- constraint matching the ON CONFLICT specification").
--
-- That is a real Postgres rule, not a quirk: `ON CONFLICT (a, b)` infers its
-- arbiter index from the column list, and it will only consider a PARTIAL
-- index when the INSERT statement itself carries a WHERE clause that PROVES
-- the index predicate holds. PostgREST/supabase-js `onConflict` sends column
-- names and nothing else, so it can never satisfy that proof and Postgres
-- refuses the statement outright.
--
-- Dropping the predicate costs nothing, because the property it existed to
-- protect is already guaranteed. A Postgres unique index treats NULLs as
-- DISTINCT by default, so any number of rows may carry a NULL
-- `client_write_id` -- which is every row written before this slice, and every
-- row written by a path that does not journal. The RLS suite asserts exactly
-- that ("leaves rows with no client_write_id free to repeat"); it now proves
-- the real behaviour rather than the predicate's.
--
-- `NULLS NOT DISTINCT` is deliberately NOT used: it would make two NULL-id
-- rows collide and break every pre-existing win and review.
--
-- Otherwise additive and nullable: no existing column is altered or renamed.
--
-- Scoped to `(user_id, ...)` rather than the id alone: journal ids are minted
-- per device, so two accounts used on one device can legitimately produce the
-- same id and must not block each other.
--
-- No new grants: `grant select, insert, update, delete` on both tables already
-- covers every column (20260508194709 for review_entries, 20260706120000 for
-- win_records), and PostgreSQL table-level privileges extend to columns added
-- later. RLS policies are likewise column-agnostic (`auth.uid() = user_id`) and
-- are deliberately left untouched.
--
-- Deliberately NOT added to `winRecordColumns` / `reviewEntryColumns`: nothing
-- reads this value back. The capture path does select `client_capture_id`
-- because its queue reconciles against server rows; the journal instead clears
-- its own entry once the write is confirmed, so the key is write-only here.

alter table public.win_records
  add column client_write_id text;

create unique index win_records_user_client_write_id_key
  on public.win_records (user_id, client_write_id);

alter table public.review_entries
  add column client_write_id text;

create unique index review_entries_user_client_write_id_key
  on public.review_entries (user_id, client_write_id);
