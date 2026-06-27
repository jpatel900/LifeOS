alter table public.tasks
  drop constraint if exists tasks_status_check;

alter table public.tasks
  add constraint tasks_status_check check (
    status in (
      'draft',
      'active',
      'backlog',
      'scheduled',
      'blocked',
      'done',
      'dropped',
      'archived'
    )
  );
