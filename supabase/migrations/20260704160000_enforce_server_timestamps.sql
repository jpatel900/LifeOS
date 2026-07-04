-- Enforce server-side timestamps on user-owned tables (KNOWN_ISSUES row 14, issue #341).
--
-- API-facing roles (anon, authenticated) can no longer influence row clock truth:
--   * BEFORE INSERT forces created_at/updated_at (and checked_at/opened_at on the
--     health tables) to server now(), regardless of what the payload carries.
--   * BEFORE UPDATE keeps created_at immutable. updated_at is already forced by the
--     existing set_updated_at triggers on update.
-- postgres and service_role writes pass through untouched so migrations, seeds, and a
-- future service-role import lane can carry provenance timestamps.

create or replace function public.set_server_created_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    new.created_at = now();
  end if;
  return new;
end;
$$;

create or replace function public.set_server_row_timestamps()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    new.created_at = now();
    new.updated_at = now();
  end if;
  return new;
end;
$$;

create or replace function public.set_server_checked_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    new.checked_at = now();
  end if;
  return new;
end;
$$;

create or replace function public.set_server_opened_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    new.opened_at = now();
  end if;
  return new;
end;
$$;

create or replace function public.keep_created_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    new.created_at = old.created_at;
  end if;
  return new;
end;
$$;

-- created_at only.
create trigger capture_items_set_server_created_at
before insert on public.capture_items
for each row execute function public.set_server_created_at();

create trigger time_block_proposals_set_server_created_at
before insert on public.time_block_proposals
for each row execute function public.set_server_created_at();

create trigger execution_sessions_set_server_created_at
before insert on public.execution_sessions
for each row execute function public.set_server_created_at();

create trigger review_entries_set_server_created_at
before insert on public.review_entries
for each row execute function public.set_server_created_at();

create trigger suggestion_records_set_server_created_at
before insert on public.suggestion_records
for each row execute function public.set_server_created_at();

create trigger override_records_set_server_created_at
before insert on public.override_records
for each row execute function public.set_server_created_at();

create trigger external_write_events_set_server_created_at
before insert on public.external_write_events
for each row execute function public.set_server_created_at();

create trigger ai_call_traces_set_server_created_at
before insert on public.ai_call_traces
for each row execute function public.set_server_created_at();

-- created_at + updated_at.
create trigger areas_set_server_row_timestamps
before insert on public.areas
for each row execute function public.set_server_row_timestamps();

create trigger tasks_set_server_row_timestamps
before insert on public.tasks
for each row execute function public.set_server_row_timestamps();

create trigger projects_set_server_row_timestamps
before insert on public.projects
for each row execute function public.set_server_row_timestamps();

create trigger calendar_blocks_set_server_row_timestamps
before insert on public.calendar_blocks
for each row execute function public.set_server_row_timestamps();

create trigger google_calendar_connections_set_server_row_timestamps
before insert on public.google_calendar_connections
for each row execute function public.set_server_row_timestamps();

-- Health tables use semantic clock columns instead of created_at.
create trigger health_checks_set_server_checked_at
before insert on public.health_checks
for each row execute function public.set_server_checked_at();

create trigger health_incidents_set_server_opened_at
before insert on public.health_incidents
for each row execute function public.set_server_opened_at();

-- created_at immutability on update for every table that has the column.
create trigger capture_items_keep_created_at
before update on public.capture_items
for each row execute function public.keep_created_at();

create trigger time_block_proposals_keep_created_at
before update on public.time_block_proposals
for each row execute function public.keep_created_at();

create trigger execution_sessions_keep_created_at
before update on public.execution_sessions
for each row execute function public.keep_created_at();

create trigger review_entries_keep_created_at
before update on public.review_entries
for each row execute function public.keep_created_at();

create trigger suggestion_records_keep_created_at
before update on public.suggestion_records
for each row execute function public.keep_created_at();

create trigger override_records_keep_created_at
before update on public.override_records
for each row execute function public.keep_created_at();

create trigger external_write_events_keep_created_at
before update on public.external_write_events
for each row execute function public.keep_created_at();

create trigger areas_keep_created_at
before update on public.areas
for each row execute function public.keep_created_at();

create trigger tasks_keep_created_at
before update on public.tasks
for each row execute function public.keep_created_at();

create trigger projects_keep_created_at
before update on public.projects
for each row execute function public.keep_created_at();

create trigger calendar_blocks_keep_created_at
before update on public.calendar_blocks
for each row execute function public.keep_created_at();

create trigger google_calendar_connections_keep_created_at
before update on public.google_calendar_connections
for each row execute function public.keep_created_at();

create trigger ai_call_traces_keep_created_at
before update on public.ai_call_traces
for each row execute function public.keep_created_at();
