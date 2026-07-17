-- Stage-2 entry gate instrumentation (#292 gap finding, 2026-07-16 A2 runbook
-- comment): "brief viewed >= 4 days/week" had NO instrumentation anywhere —
-- the re-entry/brief surface (reEntry/summary.ts, useReEntryRitual.ts) is a
-- pure client read-model that writes nothing. This is the smallest truthful
-- slice: one row per user per local day the brief/re-entry surface renders.
--
-- Deliberately its own table rather than a new ai_call_traces.surface value
-- (that enum is a closed taxonomy guarded by #624) or a suggestion_records
-- entry (this isn't a policy suggestion) -- a dedicated table avoids both
-- couplings and keeps the payload to exactly (user, date), no content.
--
-- Append-only by design: primary key (user_id, viewed_on) makes a re-render
-- on the same local day a no-op by construction (client upserts with
-- ignoreDuplicates, matching the capture_items client_capture_id precedent in
-- 20260706150000_add_capture_client_capture_id.sql) -- no count inflation,
-- no update/delete policy because there is nothing to correct on a fact this
-- narrow. user_id has an explicit FK to auth.users so a deleted account's
-- view history is cleaned up automatically instead of orphaning rows (no
-- other table in this schema needs this because Supabase Auth user deletion
-- is not otherwise exercised against user-owned tables yet).
--
-- Clock: created_at is a pure audit timestamp (when the row landed), not the
-- gate's clock -- the gate counts distinct viewed_on days, which is supplied
-- by the client's local date per NS surfaces' existing client-day-authority
-- convention (see the re-entry ritual's own local suppression key). It still
-- gets the standard server-authoritative created_at trigger so a client
-- clock can never forge it (review_entries / win_records pattern).

create table public.brief_views (
  user_id uuid not null references auth.users (id) on delete cascade,
  viewed_on date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, viewed_on)
);

create index brief_views_user_id_idx on public.brief_views (user_id);

alter table public.brief_views enable row level security;

create policy brief_views_select_own on public.brief_views for select to authenticated using ((select auth.uid()) = user_id);
create policy brief_views_insert_own on public.brief_views for insert to authenticated with check ((select auth.uid()) = user_id);

-- No update/delete policy and no update/delete grant: rows are append-only
-- facts, never corrected or removed by the app.
grant select, insert on table public.brief_views to authenticated;

-- created_at-only clock (review_entries / win_records / rollup_summaries
-- pattern). No keep_created_at trigger: there is no update policy for any
-- role to exploit, so created_at is already immutable by RLS absence alone.
create trigger brief_views_set_server_created_at
before insert on public.brief_views
for each row execute function public.set_server_created_at();
