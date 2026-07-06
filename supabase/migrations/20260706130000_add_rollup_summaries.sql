-- Stage 1 slice S8 (issue #260): rollup summaries (weekly -> monthly).
-- Additive-only, matching the frozen S0 DATA_MODEL target shape (section 5.7)
-- exactly (NS-INV-2/NS-INV-7). New user-owned table; no existing column is
-- altered or renamed.
--
-- Purpose: AI-drafted weekly/monthly per-area rollups (FR-020). Only user-
-- approved rollups persist; drafts live in the UI only (NS-INV-4). Monthly
-- rollups compose approved weeks.
--
-- Clock: rollup_summaries carries created_at only (no updated_at), so it uses
-- the created_at-only server-timestamp triggers (review_entries / win_records
-- pattern) -- NOT set_server_row_timestamps.

create table public.rollup_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  area_id uuid not null,
  period_type text not null,
  period_start date not null,
  period_end date not null,
  summary jsonb not null,
  created_at timestamptz not null default now(),
  constraint rollup_summaries_id_user_id_key unique (id, user_id),
  constraint rollup_summaries_period_type_check
    check (period_type in ('week', 'month')),
  -- One rollup per area per period: re-approving a period replaces nothing
  -- silently, it conflicts (the app decides upsert-vs-refuse).
  constraint rollup_summaries_period_key
    unique (user_id, area_id, period_type, period_start),
  constraint rollup_summaries_area_fk
    foreign key (area_id, user_id)
    references public.areas (id, user_id)
    on delete restrict
);

create index rollup_summaries_user_id_idx on public.rollup_summaries (user_id);
create index rollup_summaries_user_area_period_idx
  on public.rollup_summaries (user_id, area_id, period_type, period_start);

alter table public.rollup_summaries enable row level security;

create policy rollup_summaries_select_own on public.rollup_summaries for select to authenticated using ((select auth.uid()) = user_id);
create policy rollup_summaries_insert_own on public.rollup_summaries for insert to authenticated with check ((select auth.uid()) = user_id);
create policy rollup_summaries_update_own on public.rollup_summaries for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy rollup_summaries_delete_own on public.rollup_summaries for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on table public.rollup_summaries to authenticated;

-- created_at-only clock (review_entries / win_records pattern).
create trigger rollup_summaries_set_server_created_at
before insert on public.rollup_summaries
for each row execute function public.set_server_created_at();

create trigger rollup_summaries_keep_created_at
before update on public.rollup_summaries
for each row execute function public.keep_created_at();
