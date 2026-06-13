drop extension if exists "pg_net";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.accept_time_block_proposal(p_proposal_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_proposal public.time_block_proposals;
  v_block public.calendar_blocks;
begin
  select * into v_proposal
  from public.time_block_proposals
  where id = p_proposal_id
  for update;

  if not found then
    raise exception 'Planning proposal was not found.';
  end if;

  if v_proposal.status not in ('proposed', 'edited') then
    raise exception 'Only proposed or edited proposals can be accepted.';
  end if;

  update public.time_block_proposals
  set status = 'accepted'
  where id = p_proposal_id
  returning * into v_proposal;

  insert into public.calendar_blocks (
    user_id,
    area_id,
    proposal_id,
    task_id,
    google_event_id,
    start_at,
    end_at,
    status
  )
  values (
    v_proposal.user_id,
    v_proposal.area_id,
    v_proposal.id,
    v_proposal.task_id,
    null,
    v_proposal.proposed_start,
    v_proposal.proposed_end,
    'scheduled'
  )
  returning * into v_block;

  return jsonb_build_object(
    'proposal', to_jsonb(v_proposal),
    'block', to_jsonb(v_block)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_execution_session_outcome(p_session_id uuid, p_outcome text, p_actual_minutes integer, p_paused_minutes integer, p_distraction_minutes integer, p_productivity_rating integer, p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_session public.execution_sessions;
  v_block public.calendar_blocks;
  v_task public.tasks;
begin
  select * into v_session
  from public.execution_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'Execution session was not found.';
  end if;

  update public.execution_sessions
  set
    outcome = p_outcome,
    actual_minutes = p_actual_minutes,
    paused_minutes = p_paused_minutes,
    distraction_minutes = p_distraction_minutes,
    productivity_rating = p_productivity_rating,
    notes = p_notes
  where id = p_session_id
  returning * into v_session;

  if v_session.calendar_block_id is not null
    and v_session.outcome in ('completed', 'skipped') then
    update public.calendar_blocks
    set status = case
      when v_session.outcome = 'completed' then 'completed'
      else 'missed'
    end
    where id = v_session.calendar_block_id
    returning * into v_block;
  end if;

  if v_session.task_id is not null
    and v_session.outcome in ('completed', 'blocked') then
    update public.tasks
    set status = case
      when v_session.outcome = 'completed' then 'done'
      else 'blocked'
    end
    where id = v_session.task_id
    returning * into v_task;
  end if;

  return jsonb_build_object(
    'session', to_jsonb(v_session),
    'block', to_jsonb(v_block),
    'task', to_jsonb(v_task)
  );
end;
$function$
;

grant delete on table "public"."areas" to "anon";

grant insert on table "public"."areas" to "anon";

grant select on table "public"."areas" to "anon";

grant update on table "public"."areas" to "anon";

grant delete on table "public"."areas" to "service_role";

grant insert on table "public"."areas" to "service_role";

grant select on table "public"."areas" to "service_role";

grant update on table "public"."areas" to "service_role";

grant delete on table "public"."calendar_blocks" to "anon";

grant insert on table "public"."calendar_blocks" to "anon";

grant select on table "public"."calendar_blocks" to "anon";

grant update on table "public"."calendar_blocks" to "anon";

grant delete on table "public"."calendar_blocks" to "service_role";

grant insert on table "public"."calendar_blocks" to "service_role";

grant select on table "public"."calendar_blocks" to "service_role";

grant update on table "public"."calendar_blocks" to "service_role";

grant delete on table "public"."capture_items" to "anon";

grant insert on table "public"."capture_items" to "anon";

grant select on table "public"."capture_items" to "anon";

grant update on table "public"."capture_items" to "anon";

grant delete on table "public"."capture_items" to "service_role";

grant insert on table "public"."capture_items" to "service_role";

grant select on table "public"."capture_items" to "service_role";

grant update on table "public"."capture_items" to "service_role";

grant delete on table "public"."execution_sessions" to "anon";

grant insert on table "public"."execution_sessions" to "anon";

grant select on table "public"."execution_sessions" to "anon";

grant update on table "public"."execution_sessions" to "anon";

grant delete on table "public"."execution_sessions" to "service_role";

grant insert on table "public"."execution_sessions" to "service_role";

grant select on table "public"."execution_sessions" to "service_role";

grant update on table "public"."execution_sessions" to "service_role";

grant delete on table "public"."external_write_events" to "anon";

grant insert on table "public"."external_write_events" to "anon";

grant select on table "public"."external_write_events" to "anon";

grant update on table "public"."external_write_events" to "anon";

grant delete on table "public"."google_calendar_connections" to "anon";

grant insert on table "public"."google_calendar_connections" to "anon";

grant select on table "public"."google_calendar_connections" to "anon";

grant update on table "public"."google_calendar_connections" to "anon";

grant delete on table "public"."health_checks" to "anon";

grant insert on table "public"."health_checks" to "anon";

grant select on table "public"."health_checks" to "anon";

grant update on table "public"."health_checks" to "anon";

grant delete on table "public"."health_checks" to "service_role";

grant insert on table "public"."health_checks" to "service_role";

grant select on table "public"."health_checks" to "service_role";

grant update on table "public"."health_checks" to "service_role";

grant delete on table "public"."health_incidents" to "anon";

grant insert on table "public"."health_incidents" to "anon";

grant select on table "public"."health_incidents" to "anon";

grant update on table "public"."health_incidents" to "anon";

grant delete on table "public"."health_incidents" to "authenticated";

grant insert on table "public"."health_incidents" to "authenticated";

grant select on table "public"."health_incidents" to "authenticated";

grant update on table "public"."health_incidents" to "authenticated";

grant delete on table "public"."health_incidents" to "service_role";

grant insert on table "public"."health_incidents" to "service_role";

grant select on table "public"."health_incidents" to "service_role";

grant update on table "public"."health_incidents" to "service_role";

grant delete on table "public"."override_records" to "anon";

grant insert on table "public"."override_records" to "anon";

grant select on table "public"."override_records" to "anon";

grant update on table "public"."override_records" to "anon";

grant delete on table "public"."override_records" to "authenticated";

grant insert on table "public"."override_records" to "authenticated";

grant select on table "public"."override_records" to "authenticated";

grant update on table "public"."override_records" to "authenticated";

grant delete on table "public"."override_records" to "service_role";

grant insert on table "public"."override_records" to "service_role";

grant select on table "public"."override_records" to "service_role";

grant update on table "public"."override_records" to "service_role";

grant delete on table "public"."projects" to "anon";

grant insert on table "public"."projects" to "anon";

grant select on table "public"."projects" to "anon";

grant update on table "public"."projects" to "anon";

grant delete on table "public"."projects" to "service_role";

grant insert on table "public"."projects" to "service_role";

grant select on table "public"."projects" to "service_role";

grant update on table "public"."projects" to "service_role";

grant delete on table "public"."review_entries" to "anon";

grant insert on table "public"."review_entries" to "anon";

grant select on table "public"."review_entries" to "anon";

grant update on table "public"."review_entries" to "anon";

grant delete on table "public"."review_entries" to "service_role";

grant insert on table "public"."review_entries" to "service_role";

grant select on table "public"."review_entries" to "service_role";

grant update on table "public"."review_entries" to "service_role";

grant delete on table "public"."suggestion_records" to "anon";

grant insert on table "public"."suggestion_records" to "anon";

grant select on table "public"."suggestion_records" to "anon";

grant update on table "public"."suggestion_records" to "anon";

grant delete on table "public"."suggestion_records" to "authenticated";

grant insert on table "public"."suggestion_records" to "authenticated";

grant select on table "public"."suggestion_records" to "authenticated";

grant update on table "public"."suggestion_records" to "authenticated";

grant delete on table "public"."suggestion_records" to "service_role";

grant insert on table "public"."suggestion_records" to "service_role";

grant select on table "public"."suggestion_records" to "service_role";

grant update on table "public"."suggestion_records" to "service_role";

grant delete on table "public"."tasks" to "anon";

grant insert on table "public"."tasks" to "anon";

grant select on table "public"."tasks" to "anon";

grant update on table "public"."tasks" to "anon";

grant delete on table "public"."tasks" to "service_role";

grant insert on table "public"."tasks" to "service_role";

grant select on table "public"."tasks" to "service_role";

grant update on table "public"."tasks" to "service_role";

grant delete on table "public"."time_block_proposals" to "anon";

grant insert on table "public"."time_block_proposals" to "anon";

grant select on table "public"."time_block_proposals" to "anon";

grant update on table "public"."time_block_proposals" to "anon";

grant delete on table "public"."time_block_proposals" to "service_role";

grant insert on table "public"."time_block_proposals" to "service_role";

grant select on table "public"."time_block_proposals" to "service_role";

grant update on table "public"."time_block_proposals" to "service_role";

CREATE TRIGGER enforce_bucket_name_length_trigger BEFORE INSERT OR UPDATE OF name ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.enforce_bucket_name_length();

CREATE TRIGGER protect_buckets_delete BEFORE DELETE ON storage.buckets FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();

CREATE TRIGGER protect_objects_delete BEFORE DELETE ON storage.objects FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();

CREATE TRIGGER update_objects_updated_at BEFORE UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.update_updated_at_column();


