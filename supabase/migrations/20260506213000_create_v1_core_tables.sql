create extension if not exists pgcrypto with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.areas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  slug text not null,
  description text,
  color text,
  icon text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint areas_user_slug_key unique (user_id, slug),
  constraint areas_id_user_id_key unique (id, user_id),
  constraint areas_name_not_blank check (length(btrim(name)) > 0),
  constraint areas_slug_not_blank check (length(btrim(slug)) > 0)
);

create table public.capture_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  area_id uuid,
  raw_text text not null,
  raw_audio_ref text,
  capture_mode text not null,
  inferred_area_confidence numeric,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  constraint capture_items_id_user_id_key unique (id, user_id),
  constraint capture_items_area_fk foreign key (area_id, user_id) references public.areas (id, user_id) on delete restrict,
  constraint capture_items_raw_text_not_blank check (length(btrim(raw_text)) > 0),
  constraint capture_items_capture_mode_check check (capture_mode in ('text', 'audio', 'import')),
  constraint capture_items_status_check check (status in ('new', 'parsed', 'triage_required', 'resolved', 'archived')),
  constraint capture_items_inferred_area_confidence_check check (
    inferred_area_confidence is null
    or (inferred_area_confidence >= 0 and inferred_area_confidence <= 1)
  )
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  area_id uuid not null,
  title text not null,
  description text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_id_user_id_key unique (id, user_id),
  constraint projects_area_fk foreign key (area_id, user_id) references public.areas (id, user_id) on delete restrict,
  constraint projects_title_not_blank check (length(btrim(title)) > 0),
  constraint projects_status_check check (status in ('active', 'paused', 'done', 'dropped', 'archived'))
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  area_id uuid not null,
  project_id uuid,
  source_capture_item_id uuid,
  title text not null,
  description text,
  status text not null default 'draft',
  priority_score numeric,
  priority_confidence numeric,
  task_type text,
  energy_type text,
  estimated_minutes_low integer,
  estimated_minutes_high integer,
  due_at timestamptz,
  definition_of_done text,
  first_tiny_step text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_id_user_id_key unique (id, user_id),
  constraint tasks_area_fk foreign key (area_id, user_id) references public.areas (id, user_id) on delete restrict,
  constraint tasks_project_fk foreign key (project_id, user_id) references public.projects (id, user_id) on delete set null (project_id),
  constraint tasks_source_capture_item_fk foreign key (source_capture_item_id, user_id) references public.capture_items (id, user_id) on delete set null (source_capture_item_id),
  constraint tasks_title_not_blank check (length(btrim(title)) > 0),
  constraint tasks_status_check check (status in ('draft', 'active', 'scheduled', 'blocked', 'done', 'dropped', 'archived')),
  constraint tasks_priority_confidence_check check (
    priority_confidence is null
    or (priority_confidence >= 0 and priority_confidence <= 1)
  ),
  constraint tasks_estimated_minutes_low_check check (estimated_minutes_low is null or estimated_minutes_low > 0),
  constraint tasks_estimated_minutes_high_check check (estimated_minutes_high is null or estimated_minutes_high > 0),
  constraint tasks_estimate_range_check check (
    estimated_minutes_low is null
    or estimated_minutes_high is null
    or estimated_minutes_high >= estimated_minutes_low
  )
);

create table public.time_block_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  area_id uuid not null,
  task_id uuid,
  proposed_start timestamptz not null,
  proposed_end timestamptz not null,
  rationale_json jsonb not null default '{}'::jsonb,
  conflict_flag boolean not null default false,
  conflict_details_json jsonb,
  status text not null default 'proposed',
  created_at timestamptz not null default now(),
  constraint time_block_proposals_id_user_id_key unique (id, user_id),
  constraint time_block_proposals_area_fk foreign key (area_id, user_id) references public.areas (id, user_id) on delete restrict,
  constraint time_block_proposals_task_fk foreign key (task_id, user_id) references public.tasks (id, user_id) on delete set null (task_id),
  constraint time_block_proposals_status_check check (status in ('proposed', 'edited', 'accepted', 'rejected', 'superseded')),
  constraint time_block_proposals_time_range_check check (proposed_end > proposed_start)
);

create table public.calendar_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  area_id uuid not null,
  proposal_id uuid,
  task_id uuid,
  google_event_id text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'scheduled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_blocks_id_user_id_key unique (id, user_id),
  constraint calendar_blocks_area_fk foreign key (area_id, user_id) references public.areas (id, user_id) on delete restrict,
  constraint calendar_blocks_proposal_fk foreign key (proposal_id, user_id) references public.time_block_proposals (id, user_id) on delete set null (proposal_id),
  constraint calendar_blocks_task_fk foreign key (task_id, user_id) references public.tasks (id, user_id) on delete set null (task_id),
  constraint calendar_blocks_status_check check (status in ('scheduled', 'running', 'completed', 'missed', 'cancelled')),
  constraint calendar_blocks_time_range_check check (end_at > start_at)
);

create table public.execution_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  area_id uuid not null,
  task_id uuid,
  calendar_block_id uuid,
  planned_minutes integer,
  actual_minutes integer,
  paused_minutes integer,
  distraction_minutes integer,
  productivity_rating integer,
  energy_rating text,
  outcome text not null,
  notes text,
  created_at timestamptz not null default now(),
  constraint execution_sessions_id_user_id_key unique (id, user_id),
  constraint execution_sessions_area_fk foreign key (area_id, user_id) references public.areas (id, user_id) on delete restrict,
  constraint execution_sessions_task_fk foreign key (task_id, user_id) references public.tasks (id, user_id) on delete set null (task_id),
  constraint execution_sessions_calendar_block_fk foreign key (calendar_block_id, user_id) references public.calendar_blocks (id, user_id) on delete set null (calendar_block_id),
  constraint execution_sessions_outcome_check check (outcome in ('completed', 'partial', 'stopped', 'distracted', 'blocked', 'skipped')),
  constraint execution_sessions_planned_minutes_check check (planned_minutes is null or planned_minutes >= 0),
  constraint execution_sessions_actual_minutes_check check (actual_minutes is null or actual_minutes >= 0),
  constraint execution_sessions_paused_minutes_check check (paused_minutes is null or paused_minutes >= 0),
  constraint execution_sessions_distraction_minutes_check check (distraction_minutes is null or distraction_minutes >= 0),
  constraint execution_sessions_productivity_rating_check check (
    productivity_rating is null
    or (productivity_rating >= 1 and productivity_rating <= 5)
  )
);

create table public.review_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  area_id uuid,
  review_type text not null,
  period_start date not null,
  period_end date not null,
  summary_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint review_entries_id_user_id_key unique (id, user_id),
  constraint review_entries_area_fk foreign key (area_id, user_id) references public.areas (id, user_id) on delete restrict,
  constraint review_entries_review_type_check check (review_type in ('daily', 'weekly')),
  constraint review_entries_period_range_check check (period_end >= period_start)
);

create table public.health_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  area_id uuid,
  subsystem text not null,
  status text not null,
  score integer not null,
  details_json jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now(),
  constraint health_checks_id_user_id_key unique (id, user_id),
  constraint health_checks_area_fk foreign key (area_id, user_id) references public.areas (id, user_id) on delete restrict,
  constraint health_checks_subsystem_not_blank check (length(btrim(subsystem)) > 0),
  constraint health_checks_status_check check (status in ('healthy', 'watch', 'critical')),
  constraint health_checks_score_check check (score >= 0 and score <= 100)
);

create table public.health_incidents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  area_id uuid,
  subsystem text not null,
  severity text not null,
  incident_code text not null,
  details_json jsonb not null default '{}'::jsonb,
  status text not null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint health_incidents_id_user_id_key unique (id, user_id),
  constraint health_incidents_area_fk foreign key (area_id, user_id) references public.areas (id, user_id) on delete restrict,
  constraint health_incidents_subsystem_not_blank check (length(btrim(subsystem)) > 0),
  constraint health_incidents_severity_not_blank check (length(btrim(severity)) > 0),
  constraint health_incidents_incident_code_not_blank check (length(btrim(incident_code)) > 0),
  constraint health_incidents_status_not_blank check (length(btrim(status)) > 0),
  constraint health_incidents_closed_after_opened_check check (closed_at is null or closed_at >= opened_at)
);

create table public.suggestion_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  area_id uuid,
  suggestion_type text not null,
  subject_type text not null,
  subject_id uuid,
  suggestion_json jsonb not null default '{}'::jsonb,
  confidence numeric,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint suggestion_records_id_user_id_key unique (id, user_id),
  constraint suggestion_records_area_fk foreign key (area_id, user_id) references public.areas (id, user_id) on delete restrict,
  constraint suggestion_records_suggestion_type_not_blank check (length(btrim(suggestion_type)) > 0),
  constraint suggestion_records_subject_type_not_blank check (length(btrim(subject_type)) > 0),
  constraint suggestion_records_status_check check (status in ('pending', 'accepted', 'rejected', 'ignored', 'expired')),
  constraint suggestion_records_confidence_check check (
    confidence is null
    or (confidence >= 0 and confidence <= 1)
  ),
  constraint suggestion_records_resolved_after_created_check check (resolved_at is null or resolved_at >= created_at)
);

create table public.override_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  area_id uuid,
  subject_type text not null,
  subject_id uuid not null,
  override_type text not null,
  old_value_json jsonb not null default '{}'::jsonb,
  new_value_json jsonb not null default '{}'::jsonb,
  reason text,
  created_at timestamptz not null default now(),
  constraint override_records_id_user_id_key unique (id, user_id),
  constraint override_records_area_fk foreign key (area_id, user_id) references public.areas (id, user_id) on delete restrict,
  constraint override_records_subject_type_not_blank check (length(btrim(subject_type)) > 0),
  constraint override_records_override_type_not_blank check (length(btrim(override_type)) > 0)
);

create trigger areas_set_updated_at
before update on public.areas
for each row execute function public.set_updated_at();

create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

create trigger tasks_set_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

create trigger calendar_blocks_set_updated_at
before update on public.calendar_blocks
for each row execute function public.set_updated_at();

create index areas_user_id_idx on public.areas (user_id);
create index areas_user_is_active_idx on public.areas (user_id, is_active);
create index areas_user_sort_order_idx on public.areas (user_id, sort_order);

create index capture_items_user_created_at_idx on public.capture_items (user_id, created_at desc);
create index capture_items_user_area_id_idx on public.capture_items (user_id, area_id);
create index capture_items_user_status_idx on public.capture_items (user_id, status);

create index projects_user_id_idx on public.projects (user_id);
create index projects_user_area_status_idx on public.projects (user_id, area_id, status);

create index tasks_user_id_idx on public.tasks (user_id);
create index tasks_user_area_status_idx on public.tasks (user_id, area_id, status);
create index tasks_user_due_at_idx on public.tasks (user_id, due_at);
create index tasks_user_project_id_idx on public.tasks (user_id, project_id);

create index time_block_proposals_user_id_idx on public.time_block_proposals (user_id);
create index time_block_proposals_user_area_status_idx on public.time_block_proposals (user_id, area_id, status);
create index time_block_proposals_user_proposed_start_idx on public.time_block_proposals (user_id, proposed_start);
create index time_block_proposals_user_task_id_idx on public.time_block_proposals (user_id, task_id);

create index calendar_blocks_user_id_idx on public.calendar_blocks (user_id);
create index calendar_blocks_user_area_status_idx on public.calendar_blocks (user_id, area_id, status);
create index calendar_blocks_user_start_at_idx on public.calendar_blocks (user_id, start_at);
create index calendar_blocks_user_google_event_id_idx on public.calendar_blocks (user_id, google_event_id);
create index calendar_blocks_user_task_id_idx on public.calendar_blocks (user_id, task_id);

create index execution_sessions_user_id_idx on public.execution_sessions (user_id);
create index execution_sessions_user_area_id_idx on public.execution_sessions (user_id, area_id);
create index execution_sessions_user_task_id_idx on public.execution_sessions (user_id, task_id);
create index execution_sessions_user_calendar_block_id_idx on public.execution_sessions (user_id, calendar_block_id);
create index execution_sessions_user_created_at_idx on public.execution_sessions (user_id, created_at desc);

create index review_entries_user_id_idx on public.review_entries (user_id);
create index review_entries_user_area_id_idx on public.review_entries (user_id, area_id);
create index review_entries_user_review_type_idx on public.review_entries (user_id, review_type);
create index review_entries_user_period_start_idx on public.review_entries (user_id, period_start);

create index health_checks_user_id_idx on public.health_checks (user_id);
create index health_checks_user_area_id_idx on public.health_checks (user_id, area_id);
create index health_checks_user_status_idx on public.health_checks (user_id, status);
create index health_checks_user_checked_at_idx on public.health_checks (user_id, checked_at desc);

create index health_incidents_user_id_idx on public.health_incidents (user_id);
create index health_incidents_user_area_id_idx on public.health_incidents (user_id, area_id);
create index health_incidents_user_status_idx on public.health_incidents (user_id, status);
create index health_incidents_user_opened_at_idx on public.health_incidents (user_id, opened_at desc);

create index suggestion_records_user_id_idx on public.suggestion_records (user_id);
create index suggestion_records_user_area_id_idx on public.suggestion_records (user_id, area_id);
create index suggestion_records_user_status_idx on public.suggestion_records (user_id, status);
create index suggestion_records_user_created_at_idx on public.suggestion_records (user_id, created_at desc);
create index suggestion_records_user_subject_idx on public.suggestion_records (user_id, subject_type, subject_id);

create index override_records_user_id_idx on public.override_records (user_id);
create index override_records_user_area_id_idx on public.override_records (user_id, area_id);
create index override_records_user_created_at_idx on public.override_records (user_id, created_at desc);
create index override_records_user_subject_idx on public.override_records (user_id, subject_type, subject_id);

alter table public.areas enable row level security;
alter table public.capture_items enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.time_block_proposals enable row level security;
alter table public.calendar_blocks enable row level security;
alter table public.execution_sessions enable row level security;
alter table public.review_entries enable row level security;
alter table public.health_checks enable row level security;
alter table public.health_incidents enable row level security;
alter table public.suggestion_records enable row level security;
alter table public.override_records enable row level security;

create policy areas_select_own on public.areas for select to authenticated using ((select auth.uid()) = user_id);
create policy areas_insert_own on public.areas for insert to authenticated with check ((select auth.uid()) = user_id);
create policy areas_update_own on public.areas for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy areas_delete_own on public.areas for delete to authenticated using ((select auth.uid()) = user_id);

create policy capture_items_select_own on public.capture_items for select to authenticated using ((select auth.uid()) = user_id);
create policy capture_items_insert_own on public.capture_items for insert to authenticated with check ((select auth.uid()) = user_id);
create policy capture_items_update_own on public.capture_items for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy capture_items_delete_own on public.capture_items for delete to authenticated using ((select auth.uid()) = user_id);

create policy projects_select_own on public.projects for select to authenticated using ((select auth.uid()) = user_id);
create policy projects_insert_own on public.projects for insert to authenticated with check ((select auth.uid()) = user_id);
create policy projects_update_own on public.projects for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy projects_delete_own on public.projects for delete to authenticated using ((select auth.uid()) = user_id);

create policy tasks_select_own on public.tasks for select to authenticated using ((select auth.uid()) = user_id);
create policy tasks_insert_own on public.tasks for insert to authenticated with check ((select auth.uid()) = user_id);
create policy tasks_update_own on public.tasks for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy tasks_delete_own on public.tasks for delete to authenticated using ((select auth.uid()) = user_id);

create policy time_block_proposals_select_own on public.time_block_proposals for select to authenticated using ((select auth.uid()) = user_id);
create policy time_block_proposals_insert_own on public.time_block_proposals for insert to authenticated with check ((select auth.uid()) = user_id);
create policy time_block_proposals_update_own on public.time_block_proposals for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy time_block_proposals_delete_own on public.time_block_proposals for delete to authenticated using ((select auth.uid()) = user_id);

create policy calendar_blocks_select_own on public.calendar_blocks for select to authenticated using ((select auth.uid()) = user_id);
create policy calendar_blocks_insert_own on public.calendar_blocks for insert to authenticated with check ((select auth.uid()) = user_id);
create policy calendar_blocks_update_own on public.calendar_blocks for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy calendar_blocks_delete_own on public.calendar_blocks for delete to authenticated using ((select auth.uid()) = user_id);

create policy execution_sessions_select_own on public.execution_sessions for select to authenticated using ((select auth.uid()) = user_id);
create policy execution_sessions_insert_own on public.execution_sessions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy execution_sessions_update_own on public.execution_sessions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy execution_sessions_delete_own on public.execution_sessions for delete to authenticated using ((select auth.uid()) = user_id);

create policy review_entries_select_own on public.review_entries for select to authenticated using ((select auth.uid()) = user_id);
create policy review_entries_insert_own on public.review_entries for insert to authenticated with check ((select auth.uid()) = user_id);
create policy review_entries_update_own on public.review_entries for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy review_entries_delete_own on public.review_entries for delete to authenticated using ((select auth.uid()) = user_id);

create policy health_checks_select_own on public.health_checks for select to authenticated using ((select auth.uid()) = user_id);
create policy health_checks_insert_own on public.health_checks for insert to authenticated with check ((select auth.uid()) = user_id);
create policy health_checks_update_own on public.health_checks for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy health_checks_delete_own on public.health_checks for delete to authenticated using ((select auth.uid()) = user_id);

create policy health_incidents_select_own on public.health_incidents for select to authenticated using ((select auth.uid()) = user_id);
create policy health_incidents_insert_own on public.health_incidents for insert to authenticated with check ((select auth.uid()) = user_id);
create policy health_incidents_update_own on public.health_incidents for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy health_incidents_delete_own on public.health_incidents for delete to authenticated using ((select auth.uid()) = user_id);

create policy suggestion_records_select_own on public.suggestion_records for select to authenticated using ((select auth.uid()) = user_id);
create policy suggestion_records_insert_own on public.suggestion_records for insert to authenticated with check ((select auth.uid()) = user_id);
create policy suggestion_records_update_own on public.suggestion_records for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy suggestion_records_delete_own on public.suggestion_records for delete to authenticated using ((select auth.uid()) = user_id);

create policy override_records_select_own on public.override_records for select to authenticated using ((select auth.uid()) = user_id);
create policy override_records_insert_own on public.override_records for insert to authenticated with check ((select auth.uid()) = user_id);
create policy override_records_update_own on public.override_records for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy override_records_delete_own on public.override_records for delete to authenticated using ((select auth.uid()) = user_id);
