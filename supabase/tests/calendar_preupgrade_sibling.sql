-- DESTRUCTIVE fixture: use only a disposable database migrated through
-- 20261028090000. This test commits synthetic data and both upgrade migrations.
-- psql -X -v ON_ERROR_STOP=1 -f supabase/tests/calendar_preupgrade_sibling.sql
begin;
set local role service_role;
create temp table sibling_cases (
  scenario text primary key, owner_id uuid default gen_random_uuid(), area uuid default gen_random_uuid(),
  task_a uuid default gen_random_uuid(), task_b uuid, a uuid default gen_random_uuid(),
  b uuid default gen_random_uuid(), connection uuid default gen_random_uuid(),
  audit_a uuid, audit_b uuid, refused boolean
);
insert into sibling_cases (scenario) values
  ('stored absence'), ('legacy task fallback'), ('explicit null task'), ('different task'),
  ('confirmed rejection'), ('confirmed success'), ('same proposal'), ('recovered outstanding'), ('already dispatched');
update sibling_cases set task_b = case when scenario = 'different task' then gen_random_uuid() else task_a end;
update sibling_cases set b = a where scenario = 'same proposal';
insert into public.areas (id, user_id, name, slug)
  select area, owner_id, 'Synthetic area', 'sibling-fixture' from sibling_cases;
insert into public.tasks (id, user_id, area_id, title, status)
  select distinct t.id, owner_id, area, 'Synthetic task', 'active'
  from sibling_cases cross join lateral (values (task_a), (task_b)) t(id);
insert into public.time_block_proposals (id, user_id, area_id, task_id, proposed_start, proposed_end)
  select distinct p.id, owner_id, area, p.task, timestamptz '2026-05-10 16:00Z', timestamptz '2026-05-10 17:00Z'
  from sibling_cases cross join lateral (values (a, task_a), (b, task_b)) p(id, task);
insert into public.google_calendar_connections (id, user_id, status, connected_at, credential_verified_at,
    first_write_warning_acknowledged_at, encrypted_refresh_token, granted_scopes_json)
  select connection, owner_id, 'connected', '2026-05-09 00:00Z', '2026-05-09 00:00Z', '2026-05-09 00:00Z',
    'synthetic', '["https://www.googleapis.com/auth/calendar.events.owned"]'::jsonb from sibling_cases;

-- A's original legacy worker can still POST when the old poller records absence.
update sibling_cases set audit_a = (public.claim_google_calendar_approval(owner_id, a, task_a,
  '2026-05-10 16:00Z', '2026-05-10 17:00Z', connection, '2026-05-09 00:00Z', 'primary', '{}')->>'id')::uuid;
-- Seed the two historical snapshot shapes separately from the main witness.
update public.external_write_events e set result_status = case f.scenario when 'confirmed success'
    then 'succeeded' else 'failed' end,
  result_summary_json = case f.scenario
    when 'confirmed rejection' then '{"provider_event_created":false}'::jsonb
    when 'confirmed success' then '{"reconciled":true,"google_event_id_stored":true,"provider_event_id_present":true}'::jsonb
    else '{"reconciled":true,"google_event_id_stored":false,"provider_event_id_present":false}'::jsonb end,
  request_summary_json = case f.scenario
    when 'legacy task fallback' then e.request_summary_json - 'claim_task_id'
    when 'explicit null task' then e.request_summary_json || '{"claim_task_id":null}'::jsonb
    else e.request_summary_json end
from sibling_cases f where e.id = f.audit_a;
-- This is the only reservation of B. Use A's exact audit ID as the absence voucher.
update sibling_cases set audit_b = (public.reserve_google_calendar_approval(owner_id, b, task_b,
  '2026-05-10 16:00Z', '2026-05-10 17:00Z', connection, '2026-05-09 00:00Z', 'primary', '{}',
  array[audit_a])->>'id')::uuid;
select public.dispatch_google_calendar_approval(owner_id, audit_b)
from sibling_cases where scenario = 'already dispatched';

-- A stale snapshot in another owner's audit can carry the same task text.
-- It must not revoke the otherwise eligible different-task control.
insert into public.external_write_events (user_id, area_id, provider, operation, target_type, target_id,
    result_status, result_summary_json, request_summary_json)
select e.user_id, e.area_id, e.provider, e.operation, e.target_type, e.target_id, e.result_status,
    e.result_summary_json, e.request_summary_json || jsonb_build_object('claim_task_id', other.task_b)
from sibling_cases original join public.external_write_events e on e.id = original.audit_a
cross join sibling_cases other where original.scenario = 'stored absence' and other.scenario = 'different task';

create temp view sibling_state as
select f.scenario, a.result_status as a_status, a.result_summary_json as a_evidence,
  b.result_status as b_status, b.request_summary_json->>'claim_dispatch_state' as dispatch,
  b.request_summary_json->>'claim_send_outstanding' = 'true' as send_outstanding,
  b.result_summary_json->>'reservation_revoked' = 'true' as revoked, f.refused
from sibling_cases f join public.external_write_events a on a.id = f.audit_a and a.user_id = f.owner_id
  join public.external_write_events b on b.id = f.audit_b and b.user_id = f.owner_id;
commit;
select 'before upgrade' as phase, a_status, b_status, dispatch, send_outstanding
from sibling_state where scenario = 'stored absence';
do $$ begin
  if (select count(*) from sibling_state where b_status = 'pending' and dispatch = 'reserved'
      and send_outstanding is not true) <> 8 or not exists (
      select 1 from sibling_state where scenario = 'stored absence' and a_status = 'failed'
      and a_evidence @> '{"reconciled":true,"google_event_id_stored":false,"provider_event_id_present":false}') then
    raise exception 'Predecessor failed to reserve B on the old poller evidence';
  end if;
end $$;

begin;
\ir ../migrations/20261105090000_preserve_legacy_calendar_attempt.sql
-- Simulate a previously installed parent with a confirmed same-proposal recovery
-- before the follow-up runs. The original legacy sender is still outstanding.
set local role service_role;
select public.finish_google_calendar_approval(owner_id, audit_a, a, connection, '2026-05-09 00:00Z', 'primary',
    'lifeos' || replace(a::text, '-', ''), '2026-05-10 16:00Z', '2026-05-10 17:00Z', 'synthetic-etag') is not null
from sibling_cases where scenario = 'recovered outstanding';
reset role;
\ir ../migrations/20261106090000_revoke_preupgrade_calendar_siblings.sql
commit;
select 'after upgrade' as phase, a_status, b_status, dispatch, send_outstanding, revoked
from sibling_state where scenario = 'stored absence';

begin;
set local role service_role;
do $$
declare f sibling_cases;
begin
  for f in select * from sibling_cases loop
    if f.scenario = 'same proposal' then
      perform public.finish_google_calendar_approval(f.owner_id, f.audit_a, f.a, f.connection,
        '2026-05-09 00:00Z', 'primary', 'lifeos' || replace(f.a::text, '-', ''),
        '2026-05-10 16:00Z', '2026-05-10 17:00Z', 'synthetic-etag');
    else
      begin
        perform public.dispatch_google_calendar_approval(f.owner_id, f.audit_b);
        update sibling_cases set refused = false where scenario = f.scenario;
      exception when sqlstate 'PCA01' then
        update sibling_cases set refused = true where scenario = f.scenario;
      end;
    end if;
  end loop;
end $$;
commit;
select 'after dispatch' as phase, a_status, b_status, dispatch, send_outstanding, revoked, refused
from sibling_state where scenario = 'stored absence';

do $$
declare s sibling_state;
begin
  if (select count(*) from sibling_state) <> 9 then raise exception 'Missing audit after upgrade'; end if;
  for s in select * from sibling_state order by (scenario = 'stored absence') desc, scenario loop
    if s.scenario in ('stored absence', 'legacy task fallback', 'recovered outstanding') then
      if s.refused is not true or s.b_status <> 'failed' or s.revoked is not true
          or s.dispatch is distinct from 'reserved' or s.send_outstanding is true then
        raise exception 'Unsafe sibling (%): A=%, B=%, send_outstanding=%, revoked=%, refused=%',
          s.scenario, s.a_status, s.dispatch, coalesce(s.send_outstanding, false), coalesce(s.revoked, false), s.refused;
      end if;
    elsif s.scenario = 'already dispatched' then
      if s.refused is not true or s.b_status <> 'pending' or s.revoked is true
          or s.dispatch is distinct from 'dispatched' or s.send_outstanding is not true then
        raise exception 'Migration misclassified a previously authorized send';
      end if;
    elsif s.scenario = 'same proposal' then
      if s.b_status <> 'pending' or s.dispatch is distinct from 'reserved' or s.send_outstanding is true
          or s.revoked is true or s.a_status <> 'succeeded'
          or not exists (select 1 from public.external_write_events a join sibling_cases f on a.id = f.audit_a
            where f.scenario = s.scenario and a.result_summary_json->>'recovered_by_audit_id' = f.audit_a::text
            and a.request_summary_json->>'claim_send_outstanding' = 'true') then
        raise exception 'Same-proposal recovery lost the original sender fence';
      end if;
    elsif s.refused is not false or s.dispatch is distinct from 'dispatched' or s.send_outstanding is not true
        or s.b_status <> 'pending' or s.revoked is true then
      raise exception 'Eligible reservation refused: %', s.scenario;
    end if;
    if s.a_status is distinct from (case when s.scenario in ('confirmed success','recovered outstanding','same proposal')
        then 'succeeded' when s.scenario = 'confirmed rejection' then 'failed' else 'pending' end) then
      raise exception 'Wrong legacy outcome for %: %', s.scenario, s.a_status;
    end if;
    if s.a_status = 'pending' and not s.a_evidence @> '{"reconciled":true,"google_event_id_stored":false,"provider_event_id_present":false}' then
      raise exception 'Lost legacy poller observation for %', s.scenario;
    end if;
    if (s.scenario = 'confirmed rejection' and s.a_evidence <> '{"provider_event_created":false}'::jsonb)
        or (s.scenario = 'confirmed success' and s.a_evidence <>
          '{"reconciled":true,"google_event_id_stored":true,"provider_event_id_present":true}'::jsonb) then
      raise exception 'Modified confirmed outcome for %', s.scenario;
    end if;
  end loop;
end $$;
