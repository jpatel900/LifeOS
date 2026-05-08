-- Local seed file for `supabase db reset`.
--
-- Phase 4A seeds two local Auth users and starter areas so the Supabase-backed
-- `/settings/areas` and `/capture` flows can be smoke-tested with RLS enabled.
-- Password for both local test users: password123

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmation_token,
  recovery_token,
  email_change,
  email_change_token_new,
  email_change_token_current,
  reauthentication_token,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  is_sso_user,
  is_anonymous
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'user_a@example.test',
    crypt('password123', gen_salt('bf')),
    now(),
    '',
    '',
    '',
    '',
    '',
    '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"User A"}'::jsonb,
    now(),
    now(),
    false,
    false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'user_b@example.test',
    crypt('password123', gen_salt('bf')),
    now(),
    '',
    '',
    '',
    '',
    '',
    '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"User B"}'::jsonb,
    now(),
    now(),
    false,
    false
  )
on conflict (id) do nothing;

insert into auth.identities (
  id,
  user_id,
  provider_id,
  provider,
  identity_data,
  created_at,
  updated_at
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    'email',
    '{"sub":"00000000-0000-4000-8000-000000000001","email":"user_a@example.test"}'::jsonb,
    now(),
    now()
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000002',
    'email',
    '{"sub":"00000000-0000-4000-8000-000000000002","email":"user_b@example.test"}'::jsonb,
    now(),
    now()
  )
on conflict (provider_id, provider) do nothing;

insert into public.areas (
  id,
  user_id,
  name,
  slug,
  description,
  color,
  icon,
  sort_order,
  is_active
)
values
  (
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000001',
    'Main Job',
    'main-job',
    'Work commitments and job-related projects.',
    '#2563eb',
    'briefcase',
    0,
    true
  ),
  (
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000001',
    'Personal',
    'personal',
    'Home, health, errands, and personal admin.',
    '#16a34a',
    'home',
    1,
    true
  ),
  (
    '00000000-0000-4000-8000-000000000103',
    '00000000-0000-4000-8000-000000000001',
    'Volunteer Work',
    'volunteer-work',
    'Community commitments and volunteer follow-ups.',
    '#9333ea',
    'heart',
    2,
    true
  ),
  (
    '00000000-0000-4000-8000-000000000104',
    '00000000-0000-4000-8000-000000000001',
    'Side Project',
    'side-project',
    'Independent builds, experiments, and optional projects.',
    '#f97316',
    'rocket',
    3,
    true
  ),
  (
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000002',
    'User B Private Area',
    'user-b-private-area',
    'Used to verify user isolation in local RLS tests.',
    '#f97316',
    'lock',
    0,
    true
  )
on conflict (user_id, slug) do nothing;
