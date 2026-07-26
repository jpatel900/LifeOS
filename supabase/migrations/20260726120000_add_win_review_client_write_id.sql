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
-- Same shape as the offline capture queue's key
-- (20260706150000_add_capture_client_capture_id.sql): additive, nullable text
-- column plus a PARTIAL unique index scoped to the owner, so existing rows
-- (all NULL) never conflict and rows written by paths that do not journal are
-- unaffected. The client pairs it with
-- `upsert(..., { onConflict: "user_id,client_write_id", ignoreDuplicates: true })`,
-- so a replayed write is a no-op rather than a duplicate row or a thrown
-- unique violation.
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
  on public.win_records (user_id, client_write_id)
  where client_write_id is not null;

alter table public.review_entries
  add column client_write_id text;

create unique index review_entries_user_client_write_id_key
  on public.review_entries (user_id, client_write_id)
  where client_write_id is not null;
