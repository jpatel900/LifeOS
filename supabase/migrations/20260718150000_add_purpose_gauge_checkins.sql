-- FR-047 slice 2 / FR-033 Purpose Gauge check-in persistence (#686). The
-- Close-moment 3-point tap ("how did today sit with you?" — lighter / even /
-- heavier, FR-033) had no store: the Mirror trend kernel (FR-047 slice 1,
-- #681) shipped reading an empty set. This is the smallest truthful slice —
-- one row per user per local day a check-in is actually tapped.
--
-- Modeled exactly on 20260718120000_add_brief_views.sql: append-only, own-row
-- RLS, server-authoritative created_at, no update/delete policy or grant. The
-- one addition over brief_views is the `response` payload (the three exact
-- FR-033 values), constrained in the database so no drift value can land.
--
-- Append-only by design: primary key (user_id, checked_on) makes a re-tap on
-- the same local day a no-op by construction (client upserts with
-- ignoreDuplicates, matching the capture_items client_capture_id precedent in
-- 20260706150000_add_capture_client_capture_id.sql) -- a double-tap can never
-- double-count or revise the recorded response. A skipped or declined offer
-- writes NOTHING (FR-033: a skipped or absent check is never counted, shown,
-- or treated as signal -- the check-in rows ARE the only history; an unanswered
-- offer leaves no trace by doctrine). user_id has an explicit FK to auth.users
-- so a deleted account's check-in history is cleaned up automatically instead
-- of orphaning rows (brief_views precedent).
--
-- Clock: created_at is a pure audit timestamp (when the row landed), not the
-- gauge's clock -- the trend orders by checked_on, supplied by the client's
-- local date per NS surfaces' existing client-day-authority convention (the
-- Close moment's own local `now`). It still gets the standard
-- server-authoritative created_at trigger so a client clock can never forge it
-- (brief_views / review_entries / win_records pattern).

create table public.purpose_gauge_checkins (
  user_id uuid not null references auth.users (id) on delete cascade,
  checked_on date not null,
  response text not null check (response in ('lighter', 'even', 'heavier')),
  created_at timestamptz not null default now(),
  primary key (user_id, checked_on)
);

create index purpose_gauge_checkins_user_id_idx on public.purpose_gauge_checkins (user_id);

alter table public.purpose_gauge_checkins enable row level security;

create policy purpose_gauge_checkins_select_own on public.purpose_gauge_checkins for select to authenticated using ((select auth.uid()) = user_id);
create policy purpose_gauge_checkins_insert_own on public.purpose_gauge_checkins for insert to authenticated with check ((select auth.uid()) = user_id);

-- No update/delete policy and no update/delete grant: rows are append-only
-- facts, never corrected or removed by the app.
grant select, insert on table public.purpose_gauge_checkins to authenticated;

-- created_at-only clock (brief_views / review_entries / win_records /
-- rollup_summaries pattern). No keep_created_at trigger: there is no update
-- policy for any role to exploit, so created_at is already immutable by RLS
-- absence alone.
create trigger purpose_gauge_checkins_set_server_created_at
before insert on public.purpose_gauge_checkins
for each row execute function public.set_server_created_at();
