-- Stage 1 slice S1 (issue #253): people & commitments schema.
-- Additive-only, matching the frozen S0 DATA_MODEL target shapes (sections 4.10
-- and 4.11) exactly (NS-INV-2/NS-INV-7). No existing column is altered or
-- renamed. Schema only — zero user-visible change.
--
-- 1. `people`: user-scoped person records for waiting-on / committed-to tracking.
-- 2. `tasks` additive columns: waiting_on_person_id, waiting_on_since,
--    is_commitment, committed_to_person_id. Commitment due date reuses the
--    existing tasks.due_at column (no new date column).

create table public.people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  display_name text not null,
  normalized_name text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint people_id_user_id_key unique (id, user_id),
  constraint people_display_name_not_blank check (length(btrim(display_name)) > 0),
  constraint people_normalized_name_not_blank check (length(btrim(normalized_name)) > 0)
);

create index people_user_id_idx on public.people (user_id);
create index people_user_normalized_name_idx on public.people (user_id, normalized_name);

alter table public.people enable row level security;

create policy people_select_own on public.people for select to authenticated using ((select auth.uid()) = user_id);
create policy people_insert_own on public.people for insert to authenticated with check ((select auth.uid()) = user_id);
create policy people_update_own on public.people for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy people_delete_own on public.people for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on table public.people to authenticated;

-- Server-owned timestamp triggers, mirroring the areas/tasks pattern established
-- in 20260704160000_enforce_server_timestamps.sql: API-facing roles cannot
-- influence created_at/updated_at, and created_at is immutable on update.
create trigger people_set_updated_at
before update on public.people
for each row execute function public.set_updated_at();

create trigger people_set_server_row_timestamps
before insert on public.people
for each row execute function public.set_server_row_timestamps();

create trigger people_keep_created_at
before update on public.people
for each row execute function public.keep_created_at();

-- Additive tasks columns. Composite (id, user_id) FKs keep referenced person
-- rows within the same owner, consistent with every other tasks FK. tasks
-- already carries the server-timestamp triggers, so no new triggers here.
alter table public.tasks
  add column waiting_on_person_id uuid,
  add column waiting_on_since timestamptz,
  add column is_commitment boolean not null default false,
  add column committed_to_person_id uuid;

alter table public.tasks
  add constraint tasks_waiting_on_person_fk
    foreign key (waiting_on_person_id, user_id)
    references public.people (id, user_id)
    on delete set null (waiting_on_person_id);

alter table public.tasks
  add constraint tasks_committed_to_person_fk
    foreign key (committed_to_person_id, user_id)
    references public.people (id, user_id)
    on delete set null (committed_to_person_id);

create index tasks_user_waiting_on_person_id_idx on public.tasks (user_id, waiting_on_person_id);
create index tasks_user_committed_to_person_id_idx on public.tasks (user_id, committed_to_person_id);
