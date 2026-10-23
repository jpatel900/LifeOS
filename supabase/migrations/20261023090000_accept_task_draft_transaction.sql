-- INV-1: the accepted task, its approved people, optional proposal and capture
-- status commit together. Name normalization stays in TypeScript. Optional
-- learning records are emitted only after commit and are not workflow state.
create or replace function public.accept_task_draft(
  p_task jsonb,
  p_person_mentions jsonb,
  p_proposal jsonb,
  p_accepted_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_key text := btrim(p_task->>'client_write_id');
  v_area uuid := (p_task->>'area_id')::uuid;
  v_capture uuid := (p_task->>'source_capture_item_id')::uuid;
  v_capture_status text;
  v_task public.tasks;
  v_proposal public.time_block_proposals;
  v_deduplicated boolean;
  v_mention jsonb;
  v_person uuid;
  v_waiting uuid;
  v_committed uuid;
  v_links jsonb := '[]'::jsonb;
begin
  if v_user is null then
    raise exception 'Sign in before saving tasks.' using errcode = '42501';
  end if;
  if v_key is null or length(v_key) = 0 then
    raise exception 'A journalled triage accept needs a client write id.';
  end if;
  if jsonb_typeof(p_person_mentions) is distinct from 'array'
    or p_accepted_at is null then
    raise exception 'Draft acceptance details are invalid.';
  end if;

  -- No task row exists on the first attempt. Serialize the stable journal key
  -- before lookup so concurrent retries cannot create orphan people or tasks.
  perform pg_advisory_xact_lock(hashtextextended('accept_task_draft:' || v_user::text || ':' || v_key, 0));

  select * into v_task from public.tasks
    where user_id = v_user and client_write_id = v_key for update;
  v_deduplicated := found;

  if v_deduplicated then
    if v_task.source_capture_item_id is not null and v_capture is not null
      and v_task.source_capture_item_id <> v_capture then
      raise exception 'This acceptance key belongs to a different draft.';
    end if;
    -- Captures can reach the account after their accepted task. Resolve the
    -- newly available owned capture without rejecting the stable journal key.
    v_capture := coalesce(v_task.source_capture_item_id, v_capture);
  else
    if p_task->>'status' is null or p_task->>'status' not in ('active', 'backlog')
      or nullif(btrim(p_task->>'title'), '') is null then
      raise exception 'Draft task details are invalid.';
    end if;
    perform 1 from public.areas where id = v_area and user_id = v_user;
    if not found then
      raise exception 'Draft area was not found.' using errcode = '42501';
    end if;

    for v_mention in select value from jsonb_array_elements(p_person_mentions)
    loop
      v_person := null;
      if v_mention->>'role' in ('waiting_on', 'committed_to') then
        -- NS-INV-4: an unavailable/invalid person link becomes no-link. This
        -- subtransaction rolls back its own attempted person creation only.
        begin
          if nullif(btrim(v_mention->>'name'), '') is not null
            and nullif(btrim(v_mention->>'normalized_name'), '') is not null then
            select id into strict v_person from public.people
              where user_id = v_user and normalized_name = v_mention->>'normalized_name';
          end if;
        exception
          when no_data_found then
            begin
              insert into public.people (user_id, display_name, normalized_name)
              values (v_user, btrim(v_mention->>'name'), v_mention->>'normalized_name')
              returning id into v_person;
            exception when others then v_person := null;
            end;
          when others then v_person := null;
        end;
      end if;
      if v_mention->>'role' = 'waiting_on' and v_waiting is null then
        v_waiting := v_person;
      elsif v_mention->>'role' = 'committed_to' and v_committed is null then
        v_committed := v_person;
      end if;
      v_links := v_links || jsonb_build_array(jsonb_build_object(
        'name', v_mention->>'name', 'role', v_mention->>'role', 'person_id', v_person));
    end loop;

    insert into public.tasks (
      user_id, area_id, source_capture_item_id, title, description, status,
      priority_confidence, task_type, is_reversible, due_at,
      estimated_minutes_low, estimated_minutes_high, first_tiny_step, definition_of_done,
      waiting_on_person_id, waiting_on_since, is_commitment, committed_to_person_id,
      client_write_id
    ) values (
      v_user, v_area, v_capture, p_task->>'title', p_task->>'description', p_task->>'status',
      (p_task->>'priority_confidence')::numeric, p_task->>'task_type',
      (p_task->>'is_reversible')::boolean, (p_task->>'due_at')::timestamptz,
      (p_task->>'estimated_minutes_low')::integer, (p_task->>'estimated_minutes_high')::integer,
      p_task->>'first_tiny_step', p_task->>'definition_of_done', v_waiting,
      case when v_waiting is not null then p_accepted_at else null end,
      coalesce((p_task->>'is_commitment')::boolean, false) or v_committed is not null,
      v_committed, v_key
    ) returning * into v_task;
  end if;

  -- Repair partial accepts from the older sequential client too. Never reset
  -- the status/content of an existing task or its later accepted proposal.
  if p_proposal is not null and p_proposal <> 'null'::jsonb
    and p_task->>'status' = 'active' then
    insert into public.time_block_proposals (
      user_id, area_id, task_id, proposed_start, proposed_end, rationale_json,
      conflict_flag, conflict_details_json, status, client_write_id
    ) values (
      v_user, v_task.area_id, v_task.id,
      (p_proposal->>'proposed_start')::timestamptz,
      (p_proposal->>'proposed_end')::timestamptz,
      jsonb_build_object('note', p_proposal->>'rationale'), false, null, 'proposed', v_key || ':proposal'
    ) on conflict (user_id, client_write_id) do nothing;
    select * into v_proposal from public.time_block_proposals
      where user_id = v_user and client_write_id = v_key || ':proposal';
    if v_proposal.task_id is distinct from v_task.id then
      raise exception 'This acceptance proposal belongs to a different task.';
    end if;
  end if;

  if v_capture is not null then
    -- A denied/missing capture must fail the entire transaction, not silently
    -- return success after RLS turned the UPDATE into a zero-row write.
    select status into v_capture_status from public.capture_items
      where id = v_capture and user_id = v_user for update;
    if not found then
      raise exception 'Draft capture was not found.' using errcode = '42501';
    end if;
    if v_capture_status in ('new', 'parsed', 'triage_required') then
      update public.capture_items set status = 'resolved'
        where id = v_capture and user_id = v_user;
      if not found then
        raise exception 'Draft capture could not be resolved.' using errcode = '42501';
      end if;
    end if;
    if v_task.source_capture_item_id is null then
      update public.tasks set source_capture_item_id = v_capture
        where id = v_task.id and user_id = v_user returning * into v_task;
      if not found then
        raise exception 'Draft task could not be linked.' using errcode = '42501';
      end if;
    end if;
  end if;

  return jsonb_build_object('task', to_jsonb(v_task), 'proposal', to_jsonb(v_proposal),
    'deduplicated', v_deduplicated, 'accepted_links', v_links);
end;
$$;

revoke all on function public.accept_task_draft(jsonb, jsonb, jsonb, timestamptz) from public;
revoke all on function public.accept_task_draft(jsonb, jsonb, jsonb, timestamptz) from anon;
grant execute on function public.accept_task_draft(jsonb, jsonb, jsonb, timestamptz) to authenticated;
