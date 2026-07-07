-- E1 (issue #261 follow-up): per-(area, task_type) duration profile. Additive-
-- only, matching the frozen DATA_MODEL section 5.3 target shape (NS-INV-2/-7).
-- Stores the accepted recalibration signal so planning can re-time future blocks
-- (apply-on-accept lands in a separate maintainer PR). Mutable: upserted as new
-- actuals accrue, so it carries last_updated_at only (no created_at per 5.3).

create table public.duration_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  area_id uuid not null,
  task_type text not null,
  estimate_stats_json jsonb not null,
  sample_count integer not null,
  last_updated_at timestamptz not null default now(),
  constraint duration_profiles_id_user_id_key unique (id, user_id),
  constraint duration_profiles_sample_count_check check (sample_count >= 1),
  constraint duration_profiles_area_task_key
    unique (user_id, area_id, task_type),
  constraint duration_profiles_area_fk
    foreign key (area_id, user_id)
    references public.areas (id, user_id)
    on delete restrict
);

create index duration_profiles_user_id_idx on public.duration_profiles (user_id);
create index duration_profiles_user_area_task_idx
  on public.duration_profiles (user_id, area_id, task_type);

alter table public.duration_profiles enable row level security;

create policy duration_profiles_select_own on public.duration_profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy duration_profiles_insert_own on public.duration_profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy duration_profiles_update_own on public.duration_profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy duration_profiles_delete_own on public.duration_profiles for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on table public.duration_profiles to authenticated;

-- Server-authoritative last_updated_at on both insert and update (no created_at
-- on this table, so the shared set_server_row_timestamps/set_updated_at helpers
-- do not fit — this dedicated trigger sets the single clock column).
create or replace function public.set_last_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.last_updated_at := now();
  return new;
end;
$$;

create trigger duration_profiles_set_last_updated_at
before insert or update on public.duration_profiles
for each row execute function public.set_last_updated_at();
