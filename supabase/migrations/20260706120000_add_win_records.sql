-- Stage 1 slice S7 (issue #259): wins & evidence log.
-- Additive-only, matching the frozen S0 DATA_MODEL target shape (section 4.13)
-- exactly (NS-INV-2/NS-INV-7). New user-owned table; no existing column is
-- altered or renamed.
--
-- Purpose: user-confirmed wins harvested from completed tasks/projects during
-- weekly review (FR-020) so reviews show compounding progress and review-season
-- evidence exists. Rows are only written on explicit user confirm.
--
-- Clock: win_records carries created_at only (no updated_at), so it uses the
-- created_at-only server-timestamp triggers established for review_entries in
-- 20260704160000_enforce_server_timestamps.sql -- NOT set_server_row_timestamps
-- (which also forces updated_at, a column this table does not have).

create table public.win_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  area_id uuid not null,
  source_task_id uuid,
  source_project_id uuid,
  title text not null,
  detail text,
  occurred_at date not null,
  review_entry_id uuid,
  created_at timestamptz not null default now(),
  constraint win_records_id_user_id_key unique (id, user_id),
  constraint win_records_title_not_blank check (length(btrim(title)) > 0),
  -- Composite (x, user_id) FKs keep every referenced row within the same owner,
  -- consistent with every other FK in the schema. area_id mirrors the on delete
  -- restrict used by all area references; the nullable source/review refs use the
  -- column-list SET NULL form so a deleted source leaves the win intact.
  constraint win_records_area_fk
    foreign key (area_id, user_id)
    references public.areas (id, user_id)
    on delete restrict,
  constraint win_records_source_task_fk
    foreign key (source_task_id, user_id)
    references public.tasks (id, user_id)
    on delete set null (source_task_id),
  constraint win_records_source_project_fk
    foreign key (source_project_id, user_id)
    references public.projects (id, user_id)
    on delete set null (source_project_id),
  constraint win_records_review_entry_fk
    foreign key (review_entry_id, user_id)
    references public.review_entries (id, user_id)
    on delete set null (review_entry_id)
);

create index win_records_user_id_idx on public.win_records (user_id);
create index win_records_user_area_id_idx on public.win_records (user_id, area_id);
create index win_records_user_occurred_at_idx on public.win_records (user_id, occurred_at);
create index win_records_user_review_entry_id_idx on public.win_records (user_id, review_entry_id);

alter table public.win_records enable row level security;

create policy win_records_select_own on public.win_records for select to authenticated using ((select auth.uid()) = user_id);
create policy win_records_insert_own on public.win_records for insert to authenticated with check ((select auth.uid()) = user_id);
create policy win_records_update_own on public.win_records for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy win_records_delete_own on public.win_records for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on table public.win_records to authenticated;

-- created_at-only clock (review_entries pattern). API-facing roles cannot set the
-- clock; created_at is immutable on update.
create trigger win_records_set_server_created_at
before insert on public.win_records
for each row execute function public.set_server_created_at();

create trigger win_records_keep_created_at
before update on public.win_records
for each row execute function public.keep_created_at();
