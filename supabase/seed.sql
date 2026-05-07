-- Local-only seed data. These rows use a fixed mock user_id so developers can
-- inspect the schema before auth/UI wiring exists. RLS is still enforced for
-- app clients; Supabase seeds run with elevated local database privileges.

insert into public.areas (
  id,
  user_id,
  name,
  slug,
  description,
  color,
  icon,
  sort_order
) values
  (
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000001',
    'Main Job',
    'main-job',
    'Default work area',
    '#2563eb',
    'briefcase',
    0
  ),
  (
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000001',
    'Personal',
    'personal',
    'Default personal area',
    '#16a34a',
    'home',
    1
  ),
  (
    '00000000-0000-4000-8000-000000000103',
    '00000000-0000-4000-8000-000000000001',
    'Volunteer Work',
    'volunteer-work',
    'Default volunteer area',
    '#9333ea',
    'heart-handshake',
    2
  ),
  (
    '00000000-0000-4000-8000-000000000104',
    '00000000-0000-4000-8000-000000000001',
    'Side Project',
    'side-project',
    'Default side-project area',
    '#ea580c',
    'rocket',
    3
  )
on conflict (user_id, slug) do nothing;

insert into public.capture_items (
  id,
  user_id,
  area_id,
  raw_text,
  capture_mode,
  inferred_area_confidence,
  status
) values (
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000103',
  'Follow up with Alex about event sponsorship.',
  'text',
  0.9,
  'parsed'
) on conflict (id) do nothing;

insert into public.projects (
  id,
  user_id,
  area_id,
  title,
  description,
  status
) values (
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000103',
  'Event sponsorship follow-up',
  'Mock project for local schema inspection',
  'active'
) on conflict (id) do nothing;

insert into public.tasks (
  id,
  user_id,
  area_id,
  project_id,
  source_capture_item_id,
  title,
  description,
  status,
  priority_score,
  priority_confidence,
  task_type,
  estimated_minutes_low,
  estimated_minutes_high,
  definition_of_done,
  first_tiny_step
) values (
  '00000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000103',
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000201',
  'Email Alex about sponsorship',
  'Mock accepted task from a capture',
  'active',
  0.7,
  0.75,
  'email',
  15,
  30,
  'Alex has the sponsorship follow-up details',
  'Open prior event notes'
) on conflict (id) do nothing;

insert into public.time_block_proposals (
  id,
  user_id,
  area_id,
  task_id,
  proposed_start,
  proposed_end,
  rationale_json,
  conflict_flag,
  status
) values (
  '00000000-0000-4000-8000-000000000501',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000103',
  '00000000-0000-4000-8000-000000000401',
  '2026-05-07 14:00:00+00',
  '2026-05-07 14:30:00+00',
  '{"reason":"Short focused follow-up block"}'::jsonb,
  false,
  'proposed'
) on conflict (id) do nothing;

insert into public.calendar_blocks (
  id,
  user_id,
  area_id,
  proposal_id,
  task_id,
  start_at,
  end_at,
  status
) values (
  '00000000-0000-4000-8000-000000000601',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000103',
  '00000000-0000-4000-8000-000000000501',
  '00000000-0000-4000-8000-000000000401',
  '2026-05-07 14:00:00+00',
  '2026-05-07 14:30:00+00',
  'scheduled'
) on conflict (id) do nothing;

insert into public.execution_sessions (
  id,
  user_id,
  area_id,
  task_id,
  calendar_block_id,
  planned_minutes,
  actual_minutes,
  productivity_rating,
  outcome,
  notes
) values (
  '00000000-0000-4000-8000-000000000701',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000103',
  '00000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000601',
  30,
  25,
  4,
  'partial',
  'Mock execution row'
) on conflict (id) do nothing;

insert into public.review_entries (
  id,
  user_id,
  area_id,
  review_type,
  period_start,
  period_end,
  summary_json
) values (
  '00000000-0000-4000-8000-000000000801',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000103',
  'daily',
  '2026-05-07',
  '2026-05-07',
  '{"mock":true,"completed":[],"open":["Email Alex about sponsorship"]}'::jsonb
) on conflict (id) do nothing;

insert into public.health_checks (
  id,
  user_id,
  area_id,
  subsystem,
  status,
  score,
  details_json
) values (
  '00000000-0000-4000-8000-000000000901',
  '00000000-0000-4000-8000-000000000001',
  null,
  'database',
  'healthy',
  100,
  '{"mock":true}'::jsonb
) on conflict (id) do nothing;

insert into public.health_incidents (
  id,
  user_id,
  area_id,
  subsystem,
  severity,
  incident_code,
  details_json,
  status
) values (
  '00000000-0000-4000-8000-000000001001',
  '00000000-0000-4000-8000-000000000001',
  null,
  'calendar_connector',
  'low',
  'mock_calendar_not_connected',
  '{"mock":true,"blocking":false}'::jsonb,
  'open'
) on conflict (id) do nothing;

insert into public.suggestion_records (
  id,
  user_id,
  area_id,
  suggestion_type,
  subject_type,
  subject_id,
  suggestion_json,
  confidence,
  status
) values (
  '00000000-0000-4000-8000-000000001101',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000103',
  'time_block',
  'task',
  '00000000-0000-4000-8000-000000000401',
  '{"mock":true,"message":"Try a short follow-up block"}'::jsonb,
  0.7,
  'pending'
) on conflict (id) do nothing;

insert into public.override_records (
  id,
  user_id,
  area_id,
  subject_type,
  subject_id,
  override_type,
  old_value_json,
  new_value_json,
  reason
) values (
  '00000000-0000-4000-8000-000000001201',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000103',
  'task',
  '00000000-0000-4000-8000-000000000401',
  'estimate_adjustment',
  '{"estimated_minutes_low":10,"estimated_minutes_high":15}'::jsonb,
  '{"estimated_minutes_low":15,"estimated_minutes_high":30}'::jsonb,
  'Mock override row for local inspection'
) on conflict (id) do nothing;
