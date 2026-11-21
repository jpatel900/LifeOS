-- Upgrade regression. Run only on a disposable database migrated through
-- 20261028090000: psql -X -v ON_ERROR_STOP=1 -f supabase/tests/calendar_legacy_poller.sql
-- A has obtained its legacy claim and can still POST. No provider is contacted.
begin;
set local role service_role;
create temporary table poller_cases (
  scenario text primary key, owner_id uuid default gen_random_uuid(),
  area uuid default gen_random_uuid(), task uuid default gen_random_uuid(),
  a uuid default gen_random_uuid(), b uuid default gen_random_uuid(),
  connection uuid default gen_random_uuid(), audit uuid
);
insert into poller_cases (scenario) values
  ('new absence'), ('stored absence'), ('confirmed rejection'), ('confirmed success');

insert into public.areas (id, user_id, name, slug)
  select area, owner_id, 'Fixture', 'poller-fixture' from poller_cases;
insert into public.tasks (id, user_id, area_id, title, status)
  select task, owner_id, area, 'Synthetic task', 'active' from poller_cases;
insert into public.time_block_proposals (id, user_id, area_id, task_id, proposed_start, proposed_end)
  select p.id, owner_id, area, task, '2026-05-10 16:00Z', '2026-05-10 17:00Z'
  from poller_cases cross join lateral (values (a), (b)) p(id);
insert into public.google_calendar_connections
  (id, user_id, status, connected_at, credential_verified_at, first_write_warning_acknowledged_at,
   encrypted_refresh_token, granted_scopes_json)
  select connection, owner_id, 'connected', '2026-05-09 00:00Z', '2026-05-09 00:00Z', '2026-05-09 00:00Z',
         'synthetic', '["https://www.googleapis.com/auth/calendar.events.owned"]'::jsonb
  from poller_cases;

update poller_cases set audit = (public.claim_google_calendar_approval(
  owner_id, a, task, '2026-05-10 16:00Z', '2026-05-10 17:00Z', connection,
  '2026-05-09 00:00Z', 'primary', '{}')->>'id')::uuid;

-- The old poller records the same observation on either side of the upgrade.
create function pg_temp.record_absence(id_to_poll uuid) returns void language sql as $$
  update public.external_write_events set result_status = 'failed',
    result_summary_json = '{"reconciled":true,"google_event_id_stored":false,"provider_event_id_present":false}',
    error_message = 'Synthetic absence'
    where id = id_to_poll and result_status = 'pending';
$$;
select pg_temp.record_absence(audit) from poller_cases where scenario = 'stored absence';
do $$
begin
  if not exists (select 1 from public.external_write_events e join poller_cases f on f.audit = e.id
      where f.scenario = 'stored absence' and e.result_status = 'failed'
        and e.result_summary_json->>'reconciled' = 'true') then
    raise exception 'Stored-absence setup did not record an old poller failure';
  end if;
end;
$$;
update public.external_write_events set result_status = 'failed',
  result_summary_json = '{"provider_event_created":false}'
  where id = (select audit from poller_cases where scenario = 'confirmed rejection');

reset role;
\ir ../migrations/20261105090000_preserve_legacy_calendar_attempt.sql
set local role service_role;

do $$
begin
  perform pg_temp.record_absence((select audit from poller_cases where scenario = 'new absence'));
exception when sqlstate 'PCA01' then null;
end;
$$;
-- A positive observation has different evidence from an absence.
update public.external_write_events set result_status = 'succeeded',
  result_summary_json = '{"reconciled":true,"google_event_id_stored":true,"provider_event_id_present":true}'
  where id = (select audit from poller_cases where scenario = 'confirmed success');

do $$
declare
  f poller_cases;
  sibling jsonb;
  detail text;
  checkable boolean;
  dispatched boolean;
  failed_cases text[] := '{}';
begin
  for f in select * from poller_cases order by scenario loop
    sibling := null;
    checkable := false;
    begin
      sibling := public.reserve_google_calendar_approval(f.owner_id, f.b, f.task,
        '2026-05-10 16:00Z', '2026-05-10 17:00Z', f.connection, '2026-05-09 00:00Z', 'primary', '{}');
      -- Only a definitive rejection should admit B without a voucher.
      if f.scenario <> 'confirmed rejection' then
        failed_cases := array_append(failed_cases, f.scenario || ': admitted without evidence');
      end if;
    exception when sqlstate 'PCA01' then
      get stacked diagnostics detail = pg_exception_detail;
      checkable := coalesce(detail like 'checkable-v2:%', false);
      if checkable and substring(detail from 14)::jsonb->0->>'auditId' is distinct from f.audit::text then
        raise exception 'Unexpected evidence ID for %', f.scenario;
      end if;
    end;
    if checkable is distinct from (f.scenario = 'confirmed success') then
      failed_cases := array_append(failed_cases, f.scenario || ': evidence eligibility');
    end if;

    dispatched := false;
    begin
      if f.scenario <> 'confirmed rejection' then
        sibling := public.reserve_google_calendar_approval(f.owner_id, f.b, f.task,
          '2026-05-10 16:00Z', '2026-05-10 17:00Z', f.connection, '2026-05-09 00:00Z',
          'primary', '{}', array[f.audit]);
      end if;
      perform public.dispatch_google_calendar_approval(f.owner_id, (sibling->>'id')::uuid);
      dispatched := true;
    exception when sqlstate 'PCA01' then null;
    end;
    if dispatched is distinct from (f.scenario in ('confirmed rejection', 'confirmed success')) then
      failed_cases := array_append(failed_cases, f.scenario || ': dispatched=' || dispatched);
    end if;
    if dispatched and not exists (select 1 from public.external_write_events
        where user_id = f.owner_id and target_id = f.b::text and id = (sibling->>'id')::uuid
          and request_summary_json->>'claim_dispatch_state' = 'dispatched') then
      raise exception 'Wrong sibling or dispatch state for %', f.scenario;
    end if;
    if f.scenario in ('new absence', 'stored absence') and (
        (select result_status from public.external_write_events where id = f.audit) <> 'pending'
        or exists (select 1 from public.external_write_events where user_id = f.owner_id and target_id = f.b::text)) then
      failed_cases := array_append(failed_cases, f.scenario || ': outstanding A or sibling audit');
    end if;
  end loop;
  if cardinality(failed_cases) > 0 then raise exception 'Old-poller fixture: %', failed_cases; end if;

  for f in select * from poller_cases where scenario in ('new absence', 'stored absence') loop
    begin
      perform public.claim_google_calendar_approval(f.owner_id, f.b, f.task,
        '2026-05-10 16:00Z', '2026-05-10 17:00Z', f.connection, '2026-05-09 00:00Z',
        'primary', '{}', array[f.audit]);
      raise exception 'Direct legacy claim accepted the voucher for %', f.scenario;
    exception when sqlstate 'PCA01' then null;
    end;
  end loop;

  -- A positive read for the same deterministic event can still finish A.
  -- Its original worker has not acknowledged its POST, so keep that fence.
  select * into strict f from poller_cases where scenario = 'stored absence';
  perform public.finish_google_calendar_approval(f.owner_id, f.audit, f.a, f.connection,
    '2026-05-09 00:00Z', 'primary', 'lifeos' || replace(f.a::text, '-', ''),
    '2026-05-10 16:00Z', '2026-05-10 17:00Z', 'synthetic-etag');
  if not exists (select 1 from public.external_write_events where id = f.audit and result_status = 'succeeded'
      and result_summary_json->>'recovered_by_audit_id' = f.audit::text
      and request_summary_json->>'claim_send_outstanding' = 'true') then
    raise exception 'Confirmed recovery lost the legacy sender fence';
  end if;
end;
$$;
-- The upgrade must exclude a direct legacy claim's read as well as its insert.
do $$
begin
  -- Embedded single-backend PostgreSQL reports PID 0, represented as NULL
  -- in pg_locks. A server backend has a positive PID.
  if not exists (select 1 from pg_locks where pid is not distinct from nullif(pg_backend_pid(), 0) and granted
      and relation = 'public.external_write_events'::regclass and mode = 'AccessExclusiveLock') then
    raise exception 'Upgrade did not hold the read/write barrier on the audit table';
  end if;
end;
$$;
rollback;
