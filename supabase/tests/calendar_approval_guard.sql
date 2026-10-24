-- Run only against an isolated, migrated test database:
-- psql <isolated-connection> -v ON_ERROR_STOP=1 -f supabase/tests/calendar_approval_guard.sql
-- No Google calls. All fixtures roll back. These checks complement the route
-- concurrency test; separate database sessions are needed to prove lock waiting.
begin;

create function pg_temp.claim(p_user uuid, p_proposal uuid, p_task uuid, p_connection uuid)
returns jsonb language sql as $$
  select public.claim_google_calendar_approval(
    p_user, p_proposal, p_task, '2026-05-10T16:00:00Z',
    '2026-05-10T17:00:00Z', p_connection, '2026-05-09T00:00:00Z',
    'primary', '{}'::jsonb
  );
$$;

set local role service_role;

do $$
declare
  u uuid := gen_random_uuid();
  other_user uuid := gen_random_uuid();
  a uuid := gen_random_uuid();
  t uuid := gen_random_uuid();
  t2 uuid := gen_random_uuid();
  legacy_task uuid := gen_random_uuid();
  legacy_proposal uuid := gen_random_uuid();
  p uuid := gen_random_uuid();
  sibling uuid := gen_random_uuid();
  later_sibling uuid := gen_random_uuid();
  independent uuid := gen_random_uuid();
  taskless uuid := gen_random_uuid();
  c uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  first_claim jsonb;
  retry_claim jsonb;
begin
  if has_function_privilege('authenticated',
      'public.claim_google_calendar_approval(uuid,uuid,uuid,timestamptz,timestamptz,uuid,timestamptz,text,jsonb)', 'execute')
     or has_function_privilege('anon',
      'public.claim_google_calendar_approval(uuid,uuid,uuid,timestamptz,timestamptz,uuid,timestamptz,text,jsonb)', 'execute') then
    raise exception 'Claim RPC must be service-only';
  end if;
  insert into public.areas(id,user_id,name,slug) values (a,u,'Fixture','approval-guard');
  insert into public.tasks(id,user_id,area_id,title) values
    (t,u,a,'Task'), (t2,u,a,'Independent task'), (legacy_task,u,a,'Legacy task');
  insert into public.time_block_proposals(id,user_id,area_id,task_id,proposed_start,proposed_end)
  values (p,u,a,t,'2026-05-10T16:00:00Z','2026-05-10T17:00:00Z'),
    (sibling,u,a,t,'2026-05-10T16:00:00Z','2026-05-10T17:00:00Z'),
    (later_sibling,u,a,t,'2026-05-10T16:00:00Z','2026-05-10T17:00:00Z'),
    (independent,u,a,t2,'2026-05-10T16:00:00Z','2026-05-10T17:00:00Z'),
    (taskless,u,a,null,'2026-05-10T16:00:00Z','2026-05-10T17:00:00Z');
  insert into public.time_block_proposals(id,user_id,area_id,task_id,proposed_start,proposed_end)
  values (legacy_proposal,u,a,legacy_task,'2026-05-10T16:00:00Z','2026-05-10T17:00:00Z');
  insert into public.google_calendar_connections(id,user_id,status,connected_at,first_write_warning_acknowledged_at,encrypted_refresh_token)
  values (c,u,'connected','2026-05-09T00:00:00Z','2026-05-09T00:00:00Z','fixture-only');

  insert into public.external_write_events(user_id,area_id,provider,operation,target_type,target_id,request_summary_json,result_status)
  values(u,a,'google_calendar','calendar.events.insert','time_block_proposal',legacy_proposal::text,
    '{"calendar_id":"primary","proposed_start":"2026-05-10T16:00:00Z","proposed_end":"2026-05-10T17:00:00Z"}', 'failed');
  begin
    update public.time_block_proposals set task_id=t2 where id=legacy_proposal;
    raise exception 'Legacy audited proposal was reassigned';
  exception when sqlstate 'PCA01' then null; end;
  begin
    update public.time_block_proposals set proposed_start='2026-05-10T16:30:00Z' where id=legacy_proposal;
    raise exception 'Legacy audited proposal changed its time';
  exception when sqlstate 'PCA01' then null; end;

  begin
    perform pg_temp.claim(other_user,p,t,c);
    raise exception 'Cross-user claim was allowed';
  exception when sqlstate 'PCA01' then null; end;

  first_claim := pg_temp.claim(u,p,t,c);
  retry_claim := pg_temp.claim(u,p,t,c);
  if first_claim->>'id' = retry_claim->>'id' then
    raise exception 'Each attempted provider write needs its own audit';
  end if;
  update public.external_write_events set result_status='failed'
    where id=(first_claim->>'id')::uuid;
  begin
    perform pg_temp.claim(u,sibling,t,c);
    raise exception 'Sibling bypassed durable winner after failed audit';
  exception when sqlstate 'PCA01' then null; end;
  perform pg_temp.claim(u,independent,t2,c);
  perform pg_temp.claim(u,taskless,null,c);
  begin
    update public.time_block_proposals set task_id=t where id=taskless;
    raise exception 'Claimed taskless proposal was reassigned';
  exception when sqlstate 'PCA01' then null; end;
  begin
    update public.time_block_proposals set proposed_start='2026-05-10T16:30:00Z' where id=p;
    raise exception 'Claimed approval time changed';
  exception when sqlstate 'PCA01' then null; end;

  -- A local cancelled flag alone cannot release a remote reservation.
  insert into public.calendar_blocks(id,user_id,area_id,proposal_id,task_id,google_event_id,start_at,end_at,status)
  values(b,u,a,p,t,'lifeos'||replace(p::text,'-',''),'2026-05-10T16:00:00Z','2026-05-10T17:00:00Z','cancelled');
  begin
    perform pg_temp.claim(u,sibling,t,c);
    raise exception 'Local cancellation alone released winner';
  exception when sqlstate 'PCA01' then null; end;

  insert into public.external_write_events(user_id,area_id,provider,operation,target_type,target_id,request_summary_json,result_status,created_at)
  values(u,a,'google_calendar','calendar.events.delete','calendar_block',b::text,
    jsonb_build_object('calendar_id','primary','google_event_id','lifeos'||replace(p::text,'-','')),
    'failed',clock_timestamp());
  begin
    perform pg_temp.claim(u,sibling,t,c);
    raise exception 'Failed cancellation audit released winner';
  exception when sqlstate 'PCA01' then null; end;
  update public.external_write_events set result_status='succeeded'
    where user_id=u and operation='calendar.events.delete' and target_id=b::text;
  -- Even a successful delete on another account's "primary" calendar cannot
  -- clear the original account's reservation.
  update public.google_calendar_connections set connected_at='2026-05-11T00:00:00Z' where id=c;
  begin
    perform public.claim_google_calendar_approval(u,sibling,t,'2026-05-10T16:00:00Z','2026-05-10T17:00:00Z',c,'2026-05-11T00:00:00Z','primary','{}');
    raise exception 'Cancellation after reconnect released original account';
  exception when sqlstate 'PCA01' then null; end;
  update public.google_calendar_connections set connected_at='2026-05-09T00:00:00Z' where id=c;
  -- Matching confirmed cancellation permits a new proposal/event ID.
  perform pg_temp.claim(u,sibling,t,c);

  update public.google_calendar_connections set connected_at='2026-05-11T00:00:00Z' where id=c;
  begin
    perform public.claim_google_calendar_approval(u,sibling,t,'2026-05-10T16:00:00Z','2026-05-10T17:00:00Z',c,'2026-05-11T00:00:00Z','primary','{}');
    raise exception 'Reconnect bypassed original account identity';
  exception when sqlstate 'PCA01' then null; end;

  delete from public.time_block_proposals where id=sibling;
  -- Restore the fixture generation so this assertion specifically tests the
  -- deleted proposal's stored scope, not the separate reconnect rejection.
  update public.google_calendar_connections set connected_at='2026-05-09T00:00:00Z' where id=c;
  begin
    perform pg_temp.claim(u,later_sibling,t,c);
    raise exception 'Deleting winner erased reservation';
  exception when sqlstate 'PCA01' then null; end;
end;
$$;
rollback;
