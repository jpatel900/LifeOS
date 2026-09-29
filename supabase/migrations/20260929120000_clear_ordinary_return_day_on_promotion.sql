-- FR-049: promotion consumes an ordinary return day, including legacy NULL task_type.
-- FR-024 decision deadlines stay. CREATE OR REPLACE preserves existing execute grants.

create or replace function public.apply_task_review_transition(
  p_task_id uuid,
  p_target_status text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_task public.tasks;
  v_blocks jsonb := '[]'::jsonb;
begin
  if p_target_status not in ('active', 'backlog', 'dropped') then
    raise exception 'Review task target status is not supported.';
  end if;

  select * into v_task
  from public.tasks
  where id = p_task_id
  for update;

  if not found then
    raise exception 'Review task was not found.';
  end if;

  if exists (
    select 1
    from public.calendar_blocks
    where task_id = p_task_id
      and status in ('scheduled', 'running')
      and google_event_id is not null
  ) then
    raise exception 'Google-backed blocks require calendar approval before changing this task.';
  end if;

  with cancelled_blocks as (
    update public.calendar_blocks
    set status = 'cancelled'
    where task_id = p_task_id
      and status in ('scheduled', 'running')
      and google_event_id is null
    returning *
  )
  select coalesce(jsonb_agg(to_jsonb(cancelled_blocks)), '[]'::jsonb)
  into v_blocks
  from cancelled_blocks;

  update public.tasks
  set status = p_target_status,
      due_at = case
        when p_target_status = 'active'
          and task_type is distinct from 'decision' then null
        else due_at
      end
  where id = p_task_id
  returning * into v_task;

  return jsonb_build_object(
    'task', to_jsonb(v_task),
    'blocks', v_blocks
  );
end;
$$;
