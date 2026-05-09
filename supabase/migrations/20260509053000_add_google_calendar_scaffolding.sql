create table public.google_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  provider text not null default 'google_calendar',
  calendar_id text not null default 'primary',
  granted_scopes_json jsonb not null default '[]'::jsonb,
  status text not null default 'metadata_only',
  first_write_warning_acknowledged_at timestamptz,
  connected_at timestamptz,
  disconnected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint google_calendar_connections_user_id_key unique (user_id),
  constraint google_calendar_connections_provider_check check (provider = 'google_calendar'),
  constraint google_calendar_connections_calendar_id_not_blank check (length(btrim(calendar_id)) > 0),
  constraint google_calendar_connections_status_check check (status in ('metadata_only', 'connected', 'disconnected', 'error'))
);

create table public.external_write_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  area_id uuid,
  provider text not null,
  operation text not null,
  target_type text not null,
  target_id text,
  request_summary_json jsonb not null default '{}'::jsonb,
  result_summary_json jsonb not null default '{}'::jsonb,
  result_status text not null,
  error_message text,
  created_at timestamptz not null default now(),
  constraint external_write_events_area_fk foreign key (area_id, user_id) references public.areas (id, user_id) on delete set null (area_id),
  constraint external_write_events_provider_not_blank check (length(btrim(provider)) > 0),
  constraint external_write_events_operation_not_blank check (length(btrim(operation)) > 0),
  constraint external_write_events_target_type_not_blank check (length(btrim(target_type)) > 0),
  constraint external_write_events_result_status_check check (result_status in ('pending', 'succeeded', 'failed'))
);

create trigger google_calendar_connections_set_updated_at
before update on public.google_calendar_connections
for each row execute function public.set_updated_at();

create index google_calendar_connections_user_id_idx on public.google_calendar_connections (user_id);
create index google_calendar_connections_user_status_idx on public.google_calendar_connections (user_id, status);

create index external_write_events_user_id_idx on public.external_write_events (user_id);
create index external_write_events_user_area_id_idx on public.external_write_events (user_id, area_id);
create index external_write_events_user_provider_idx on public.external_write_events (user_id, provider);
create index external_write_events_user_created_at_idx on public.external_write_events (user_id, created_at desc);
create index external_write_events_user_target_idx on public.external_write_events (user_id, target_type, target_id);

alter table public.google_calendar_connections enable row level security;
alter table public.external_write_events enable row level security;

create policy google_calendar_connections_select_own on public.google_calendar_connections for select to authenticated using ((select auth.uid()) = user_id);
create policy google_calendar_connections_insert_own on public.google_calendar_connections for insert to authenticated with check ((select auth.uid()) = user_id);
create policy google_calendar_connections_update_own on public.google_calendar_connections for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy google_calendar_connections_delete_own on public.google_calendar_connections for delete to authenticated using ((select auth.uid()) = user_id);

create policy external_write_events_select_own on public.external_write_events for select to authenticated using ((select auth.uid()) = user_id);
create policy external_write_events_insert_own on public.external_write_events for insert to authenticated with check ((select auth.uid()) = user_id);
create policy external_write_events_update_own on public.external_write_events for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy external_write_events_delete_own on public.external_write_events for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on table public.google_calendar_connections to authenticated;
grant select, insert, update, delete on table public.external_write_events to authenticated;
