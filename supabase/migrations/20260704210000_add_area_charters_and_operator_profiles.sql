-- Stage 1 slice S2 (issue #254): area charters & operator profile.
-- Additive-only, matching the frozen S0 DATA_MODEL target shapes (section 4.12)
-- exactly (NS-INV-2/NS-INV-7). No existing column is altered or renamed. This
-- storage feeds the NS-INV-1 context-assembly choke point
-- (apps/web/src/lib/ai/contextAssembly.ts). Schema only — no prompt behavior
-- change ships until non-empty charter/profile rows exist.
--
-- 1. `areas` additive columns: charter_text, charter_updated_at.
-- 2. `operator_profiles`: single global operator profile per user (unique
--    user_id), named strengths/weaknesses with compensation rules.

-- Additive areas columns. The existing areas table already carries the
-- server-timestamp triggers; charter_updated_at is a product timestamp written
-- by the app when the charter changes, not a row-lifecycle timestamp.
alter table public.areas
  add column charter_text text,
  add column charter_updated_at timestamptz;

create table public.operator_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  profile_text text,
  compensation_rules jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operator_profiles_user_id_key unique (user_id)
);

create index operator_profiles_user_id_idx on public.operator_profiles (user_id);

alter table public.operator_profiles enable row level security;

create policy operator_profiles_select_own on public.operator_profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy operator_profiles_insert_own on public.operator_profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy operator_profiles_update_own on public.operator_profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy operator_profiles_delete_own on public.operator_profiles for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on table public.operator_profiles to authenticated;

-- Server-owned timestamp triggers, mirroring the people/areas/tasks pattern
-- established in 20260704160000_enforce_server_timestamps.sql: API-facing roles
-- cannot influence created_at/updated_at, and created_at is immutable on update.
create trigger operator_profiles_set_updated_at
before update on public.operator_profiles
for each row execute function public.set_updated_at();

create trigger operator_profiles_set_server_row_timestamps
before insert on public.operator_profiles
for each row execute function public.set_server_row_timestamps();

create trigger operator_profiles_keep_created_at
before update on public.operator_profiles
for each row execute function public.keep_created_at();
