-- Run only against an isolated, migrated test database (see
-- calendar_approval_guard.sql). Review round 3 (#1105): no case may leave a
-- task blocked with no way out.
begin;

create function pg_temp.claim2(p_user uuid, p_proposal uuid, p_task uuid, p_connection uuid)
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
  a uuid := gen_random_uuid();
  t uuid := gen_random_uuid();
  t2 uuid := gen_random_uuid();
  first uuid := gen_random_uuid();
  sibling uuid := gen_random_uuid();
  late uuid := gen_random_uuid();
  other uuid := gen_random_uuid();
  orphan uuid := gen_random_uuid();
  c uuid := gen_random_uuid();
  claimed jsonb;
  message text;
  detail text;
begin
  insert into public.areas(id,user_id,name,slug) values (a,u,'Fixture','approval-release');
  insert into public.tasks(id,user_id,area_id,title) values (t,u,a,'Task'), (t2,u,a,'Other');
  insert into public.time_block_proposals(id,user_id,area_id,task_id,proposed_start,proposed_end)
  select id,u,a,task,'2026-05-10T16:00:00Z','2026-05-10T17:00:00Z'
  from (values (first,t),(sibling,t),(late,t),(other,t2)) as v(id,task);
  insert into public.google_calendar_connections(id,user_id,status,connected_at,first_write_warning_acknowledged_at,encrypted_refresh_token)
  values (c,u,'connected','2026-05-09T00:00:00Z','2026-05-09T00:00:00Z','fixture-only');

  -- Case 4: a legacy attempt whose proposal row was deleted reserves no
  -- other proposal. It must not block an unrelated task's approval.
  insert into public.external_write_events(user_id,area_id,provider,operation,target_type,target_id,request_summary_json,result_status)
  values(u,a,'google_calendar','calendar.events.insert','time_block_proposal',orphan::text,
    '{"calendar_id":"primary","proposed_start":"2026-05-10T16:00:00Z","proposed_end":"2026-05-10T17:00:00Z"}', 'succeeded');
  perform pg_temp.claim2(u,other,t2,c);

  -- Cases 2 and 3: the first attempt finished, but no succeeded delete audit
  -- exists (a failed cancel audit, or a cancel on an earlier connection).
  claimed := pg_temp.claim2(u,first,t,c);
  update public.external_write_events set result_status='succeeded'
    where id=(claimed->>'id')::uuid;
  begin
    perform pg_temp.claim2(u,sibling,t,c);
    raise exception 'Unverified sibling was released';
  exception when sqlstate 'PCA01' then
    get stacked diagnostics message = message_text, detail = pg_exception_detail;
    if detail is distinct from 'checkable:' || first::text then
      raise exception 'Conflict did not name the checkable sibling: %', detail;
    end if;
  end;
  -- The route confirmed with Google that the first event is gone.
  perform public.claim_google_calendar_approval(
    u, sibling, t, '2026-05-10T16:00:00Z', '2026-05-10T17:00:00Z', c,
    '2026-05-09T00:00:00Z', 'primary', '{}'::jsonb, array[first]);

  -- A pending attempt may still be in flight: vouching cannot release it.
  begin
    perform public.claim_google_calendar_approval(
      u, late, t, '2026-05-10T16:00:00Z', '2026-05-10T17:00:00Z', c,
      '2026-05-09T00:00:00Z', 'primary', '{}'::jsonb, array[first, sibling]);
    raise exception 'A pending sibling attempt was released';
  exception when sqlstate 'PCA01' then null; end;
end;
$$;
rollback;
