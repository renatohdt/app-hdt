-- Consolidated schema for a fresh Supabase project.
-- Includes the base app schema plus LGPD phases 1-4.

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.guard_user_role_change()
returns trigger
language plpgsql
set search_path = public, auth
as $$
begin
  if new.role is distinct from old.role
     and coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('postgres', 'service_role') then
    raise exception 'Only service_role can change public.users.role';
  end if;

  return new;
end;
$$;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  anonymized_at timestamptz,
  retention_hold boolean not null default false
);

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  muscle text,
  muscle_groups text[] not null default '{}',
  type text,
  location text[] not null default '{}',
  equipment text[] not null default '{}',
  level text[] not null default '{}',
  tags text[] not null default '{}',
  metadata jsonb not null default '{"muscle":"","muscle_groups":[],"muscles":[],"type":"","level":[],"location":[],"equipment":[]}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  video_url text
);

create table if not exists public.user_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  answers jsonb not null check (jsonb_typeof(answers) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  anonymized_at timestamptz,
  expires_at timestamptz,
  retention_hold boolean not null default false
);

create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  hash text check (hash is null or hash ~ '^[a-f0-9]{64}$'),
  exercises jsonb not null check (jsonb_typeof(exercises) = 'object'),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  anonymized_at timestamptz,
  expires_at timestamptz,
  retention_hold boolean not null default false
);

create table if not exists public.user_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check (scope in ('health', 'analytics', 'marketing', 'ads', 'ai_training_notice', 'terms_of_use')),
  granted boolean not null,
  version text not null check (btrim(version) <> ''),
  source text,
  granted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  anonymized_at timestamptz,
  expires_at timestamptz,
  retention_hold boolean not null default false
);

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null check (btrim(event_name) <> ''),
  user_id uuid references public.users(id) on delete cascade,
  visitor_id text check (visitor_id is null or btrim(visitor_id) <> ''),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  anonymized_at timestamptz,
  expires_at timestamptz not null default (now() + interval '180 days'),
  retention_hold boolean not null default false,
  constraint analytics_events_actor_check check (user_id is not null or visitor_id is not null)
);

create table if not exists public.content_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  articles jsonb not null default '[]'::jsonb check (jsonb_typeof(articles) = 'array'),
  generated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  anonymized_at timestamptz,
  retention_hold boolean not null default false
);

create table if not exists public.workout_review_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workout_id uuid references public.workouts(id) on delete set null,
  reason text not null check (btrim(reason) <> ''),
  status text not null default 'requested' check (status in ('requested', 'in_review', 'completed', 'cancelled', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  anonymized_at timestamptz,
  expires_at timestamptz not null default (now() + interval '730 days'),
  retention_hold boolean not null default false
);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id text not null check (btrim(admin_id) <> ''),
  admin_email text,
  action text not null check (btrim(action) <> ''),
  target_type text not null check (btrim(target_type) <> ''),
  target_id text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  anonymized_at timestamptz,
  expires_at timestamptz not null default (now() + interval '730 days'),
  retention_hold boolean not null default false
);

-- Legacy cleanup kept here so the file is safe to rerun during setup.
alter table public.users drop column if exists auth_user_id;
alter table public.users drop column if exists email;
alter table public.users drop column if exists profile;
alter table public.users drop column if exists quiz_started;
alter table public.users drop column if exists quiz_completed;
alter table public.users drop column if exists viewed_workout;
alter table public.users drop column if exists clicked_cta;
alter table public.exercises drop column if exists description;
alter table public.exercises add column if not exists muscle_groups text[] not null default '{}';

update public.exercises
set muscle_groups = array_remove(array[nullif(btrim(muscle), '')], null)
where coalesce(array_length(muscle_groups, 1), 0) = 0
  and coalesce(btrim(muscle), '') <> '';

update public.exercises
set metadata = jsonb_set(
  jsonb_set(
    jsonb_set(
      metadata,
      '{level}',
      case
        when jsonb_typeof(metadata->'level') = 'array' then metadata->'level'
        when coalesce(metadata->>'level', '') = '' then '[]'::jsonb
        else jsonb_build_array(metadata->>'level')
      end
    ),
    '{muscle_groups}',
    case
      when jsonb_typeof(metadata->'muscle_groups') = 'array' then metadata->'muscle_groups'
      when coalesce(metadata->>'muscle', '') = '' then '[]'::jsonb
      else jsonb_build_array(metadata->>'muscle')
    end
  ),
  '{muscles}',
  case
    when jsonb_typeof(metadata->'muscle_groups') = 'array' then metadata->'muscle_groups'
    when coalesce(metadata->>'muscle', '') = '' then '[]'::jsonb
    else jsonb_build_array(metadata->>'muscle')
  end
)
where metadata ? 'level'
  and (
    jsonb_typeof(metadata->'level') <> 'array'
    or jsonb_typeof(metadata->'muscle_groups') <> 'array'
    or jsonb_typeof(metadata->'muscles') <> 'array'
  );

update public.exercises
set metadata = jsonb_set(
  jsonb_set(
    jsonb_set(
      coalesce(metadata, '{}'::jsonb),
      '{muscle}',
      to_jsonb(coalesce(nullif(btrim(muscle), ''), muscle_groups[1], ''))
    ),
    '{muscle_groups}',
    to_jsonb(muscle_groups)
  ),
  '{muscles}',
  to_jsonb(muscle_groups)
)
where coalesce(metadata->'muscle_groups', 'null'::jsonb) <> to_jsonb(muscle_groups)
   or coalesce(metadata->'muscles', 'null'::jsonb) <> to_jsonb(muscle_groups)
   or coalesce(metadata->>'muscle', '') <> coalesce(nullif(btrim(muscle), ''), muscle_groups[1], '');

update public.workouts
set hash = null
where hash is not null
  and hash !~ '^[a-f0-9]{64}$';

create unique index if not exists user_answers_user_id_key on public.user_answers(user_id);
create unique index if not exists workouts_user_id_key on public.workouts(user_id);
create unique index if not exists user_consents_user_scope_key on public.user_consents(user_id, scope);
create unique index if not exists content_recommendations_user_id_key on public.content_recommendations(user_id);

create index if not exists users_created_at_idx on public.users(created_at desc);
create index if not exists users_deleted_at_idx on public.users(deleted_at) where deleted_at is not null;

create index if not exists exercises_name_idx on public.exercises(name);
create index if not exists exercises_muscle_idx on public.exercises(muscle);
create index if not exists exercises_muscle_groups_idx on public.exercises using gin (muscle_groups);
create index if not exists exercises_type_idx on public.exercises(type);

create index if not exists user_answers_created_at_idx on public.user_answers(created_at desc);
create index if not exists user_answers_deleted_at_idx on public.user_answers(deleted_at) where deleted_at is not null;
create index if not exists user_answers_expires_at_idx on public.user_answers(expires_at) where expires_at is not null;

create index if not exists workouts_hash_idx on public.workouts(hash);
create index if not exists workouts_created_at_idx on public.workouts(created_at desc);
create index if not exists workouts_deleted_at_idx on public.workouts(deleted_at) where deleted_at is not null;
create index if not exists workouts_expires_at_idx on public.workouts(expires_at) where expires_at is not null;

create index if not exists user_consents_user_id_idx on public.user_consents(user_id);
create index if not exists user_consents_scope_granted_idx on public.user_consents(scope, granted);
create index if not exists user_consents_deleted_at_idx on public.user_consents(deleted_at) where deleted_at is not null;
create index if not exists user_consents_expires_at_idx on public.user_consents(expires_at) where expires_at is not null;

create index if not exists analytics_events_created_at_idx on public.analytics_events(created_at desc);
create index if not exists analytics_events_user_created_at_idx on public.analytics_events(user_id, created_at desc);
create index if not exists analytics_events_user_event_created_at_idx on public.analytics_events(user_id, event_name, created_at desc);
create index if not exists analytics_events_visitor_created_at_idx on public.analytics_events(visitor_id, created_at desc)
  where visitor_id is not null;
create index if not exists analytics_events_visitor_event_created_at_idx on public.analytics_events(visitor_id, event_name, created_at desc)
  where visitor_id is not null;
create index if not exists analytics_events_event_name_created_at_idx on public.analytics_events(event_name, created_at desc);
create index if not exists analytics_events_expires_at_idx on public.analytics_events(expires_at)
  where retention_hold = false and deleted_at is null;

create index if not exists content_recommendations_expires_at_idx on public.content_recommendations(expires_at)
  where retention_hold = false and deleted_at is null;

create index if not exists workout_review_requests_user_id_idx on public.workout_review_requests(user_id);
create index if not exists workout_review_requests_workout_id_idx on public.workout_review_requests(workout_id);
create index if not exists workout_review_requests_status_idx on public.workout_review_requests(status);
create index if not exists workout_review_requests_created_at_idx on public.workout_review_requests(created_at desc);
create index if not exists workout_review_requests_expires_at_idx on public.workout_review_requests(expires_at)
  where retention_hold = false and deleted_at is null;

create index if not exists admin_audit_logs_admin_id_idx on public.admin_audit_logs(admin_id);
create index if not exists admin_audit_logs_action_idx on public.admin_audit_logs(action);
create index if not exists admin_audit_logs_target_idx on public.admin_audit_logs(target_type, target_id);
create index if not exists admin_audit_logs_created_at_idx on public.admin_audit_logs(created_at desc);
create index if not exists admin_audit_logs_expires_at_idx on public.admin_audit_logs(expires_at)
  where retention_hold = false and deleted_at is null;

drop trigger if exists users_guard_role_change on public.users;
create trigger users_guard_role_change
before update on public.users
for each row
execute function public.guard_user_role_change();

drop trigger if exists user_answers_set_updated_at on public.user_answers;
create trigger user_answers_set_updated_at
before update on public.user_answers
for each row
execute function public.set_updated_at();

drop trigger if exists content_recommendations_set_updated_at on public.content_recommendations;
create trigger content_recommendations_set_updated_at
before update on public.content_recommendations
for each row
execute function public.set_updated_at();

drop trigger if exists workout_review_requests_set_updated_at on public.workout_review_requests;
create trigger workout_review_requests_set_updated_at
before update on public.workout_review_requests
for each row
execute function public.set_updated_at();

alter table public.users enable row level security;
alter table public.exercises enable row level security;
alter table public.user_answers enable row level security;
alter table public.workouts enable row level security;
alter table public.user_consents enable row level security;
alter table public.analytics_events enable row level security;
alter table public.content_recommendations enable row level security;
alter table public.workout_review_requests enable row level security;
alter table public.admin_audit_logs enable row level security;

drop policy if exists "Users can read own row" on public.users;
drop policy if exists "Users can insert own row" on public.users;
drop policy if exists "Users can update own row" on public.users;
drop policy if exists "Users can delete own row" on public.users;

drop policy if exists "Users can read own answers" on public.user_answers;
drop policy if exists "Users can insert own answers" on public.user_answers;
drop policy if exists "Users can update own answers" on public.user_answers;
drop policy if exists "Users can delete own answers" on public.user_answers;

drop policy if exists "Users can read own consents" on public.user_consents;
drop policy if exists "Users can insert own consents" on public.user_consents;
drop policy if exists "Users can update own consents" on public.user_consents;
drop policy if exists "Users can delete own consents" on public.user_consents;

drop policy if exists "Users can read own workouts" on public.workouts;
drop policy if exists "Users can insert own workouts" on public.workouts;
drop policy if exists "Users can update own workouts" on public.workouts;
drop policy if exists "Users can delete own workouts" on public.workouts;

drop policy if exists "Users can read own workout review requests" on public.workout_review_requests;
drop policy if exists "Users can insert own workout review requests" on public.workout_review_requests;
drop policy if exists "Users can delete own workout review requests" on public.workout_review_requests;

drop policy if exists "Exercises are readable" on public.exercises;

drop policy if exists "Analytics blocked by default" on public.analytics_events;
drop policy if exists "Users can insert own analytics events" on public.analytics_events;
drop policy if exists "Users can read own analytics events" on public.analytics_events;
drop policy if exists "Users can delete own analytics events" on public.analytics_events;

drop policy if exists "Users can read own content recommendations" on public.content_recommendations;
drop policy if exists "Users can insert own content recommendations" on public.content_recommendations;
drop policy if exists "Users can update own content recommendations" on public.content_recommendations;
drop policy if exists "Users can delete own content recommendations" on public.content_recommendations;

create policy "Users can read own row"
  on public.users
  for select
  to authenticated
  using (auth.uid() = id);

create policy "Users can insert own row"
  on public.users
  for insert
  to authenticated
  with check (auth.uid() = id and role = 'user');

create policy "Users can update own row"
  on public.users
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Users can read own answers"
  on public.user_answers
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own answers"
  on public.user_answers
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own answers"
  on public.user_answers
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can read own consents"
  on public.user_consents
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own consents"
  on public.user_consents
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own consents"
  on public.user_consents
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can read own workouts"
  on public.workouts
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own workouts"
  on public.workouts
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own workouts"
  on public.workouts
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can read own workout review requests"
  on public.workout_review_requests
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own workout review requests"
  on public.workout_review_requests
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Exercises are readable"
  on public.exercises
  for select
  to authenticated
  using (true);

create policy "Users can read own analytics events"
  on public.analytics_events
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can read own content recommendations"
  on public.content_recommendations
  for select
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.run_retention_cleanup(
  p_run_at timestamptz default now(),
  p_dry_run boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_content_candidates integer := 0;
  v_content_processed integer := 0;
  v_analytics_candidates integer := 0;
  v_analytics_processed integer := 0;
  v_review_candidates integer := 0;
  v_review_processed integer := 0;
  v_admin_candidates integer := 0;
  v_admin_processed integer := 0;
  v_answers_candidates integer := 0;
  v_answers_processed integer := 0;
  v_workouts_candidates integer := 0;
  v_workouts_processed integer := 0;
  v_users_candidates integer := 0;
  v_users_processed integer := 0;
  v_consents_candidates integer := 0;
  v_consents_processed integer := 0;
begin
  select count(*) into v_content_candidates
  from public.content_recommendations
  where retention_hold = false
    and deleted_at is null
    and expires_at <= p_run_at;

  select count(*) into v_analytics_candidates
  from public.analytics_events
  where retention_hold = false
    and deleted_at is null
    and expires_at <= p_run_at;

  select count(*) into v_review_candidates
  from public.workout_review_requests
  where retention_hold = false
    and deleted_at is null
    and expires_at <= p_run_at
    and status in ('completed', 'cancelled', 'rejected');

  select count(*) into v_admin_candidates
  from public.admin_audit_logs
  where retention_hold = false
    and deleted_at is null
    and expires_at <= p_run_at;

  select count(*) into v_answers_candidates
  from public.user_answers
  where retention_hold = false
    and anonymized_at is null
    and deleted_at is not null
    and coalesce(expires_at, deleted_at + interval '30 days') <= p_run_at;

  select count(*) into v_workouts_candidates
  from public.workouts
  where retention_hold = false
    and anonymized_at is null
    and deleted_at is not null
    and coalesce(expires_at, deleted_at + interval '30 days') <= p_run_at;

  select count(*) into v_users_candidates
  from public.users
  where retention_hold = false
    and anonymized_at is null
    and deleted_at is not null
    and deleted_at <= p_run_at;

  select count(*) into v_consents_candidates
  from public.user_consents
  where retention_hold = false
    and deleted_at is not null
    and coalesce(expires_at, deleted_at + interval '30 days') <= p_run_at;

  if not p_dry_run then
    delete from public.content_recommendations
    where retention_hold = false
      and deleted_at is null
      and expires_at <= p_run_at;
    get diagnostics v_content_processed = row_count;

    delete from public.analytics_events
    where retention_hold = false
      and deleted_at is null
      and expires_at <= p_run_at;
    get diagnostics v_analytics_processed = row_count;

    delete from public.workout_review_requests
    where retention_hold = false
      and deleted_at is null
      and expires_at <= p_run_at
      and status in ('completed', 'cancelled', 'rejected');
    get diagnostics v_review_processed = row_count;

    delete from public.admin_audit_logs
    where retention_hold = false
      and deleted_at is null
      and expires_at <= p_run_at;
    get diagnostics v_admin_processed = row_count;

    update public.user_answers
    set answers = '{}'::jsonb,
        anonymized_at = p_run_at
    where retention_hold = false
      and anonymized_at is null
      and deleted_at is not null
      and coalesce(expires_at, deleted_at + interval '30 days') <= p_run_at;
    get diagnostics v_answers_processed = row_count;

    update public.workouts
    set exercises = '[]'::jsonb,
        hash = null,
        anonymized_at = p_run_at
    where retention_hold = false
      and anonymized_at is null
      and deleted_at is not null
      and coalesce(expires_at, deleted_at + interval '30 days') <= p_run_at;
    get diagnostics v_workouts_processed = row_count;

    update public.users
    set name = 'Conta removida',
        anonymized_at = p_run_at
    where retention_hold = false
      and anonymized_at is null
      and deleted_at is not null
      and deleted_at <= p_run_at;
    get diagnostics v_users_processed = row_count;

    delete from public.user_consents
    where retention_hold = false
      and deleted_at is not null
      and coalesce(expires_at, deleted_at + interval '30 days') <= p_run_at;
    get diagnostics v_consents_processed = row_count;
  else
    v_content_processed := v_content_candidates;
    v_analytics_processed := v_analytics_candidates;
    v_review_processed := v_review_candidates;
    v_admin_processed := v_admin_candidates;
    v_answers_processed := v_answers_candidates;
    v_workouts_processed := v_workouts_candidates;
    v_users_processed := v_users_candidates;
    v_consents_processed := v_consents_candidates;
  end if;

  return jsonb_build_object(
    'runAt', p_run_at,
    'dryRun', p_dry_run,
    'summary', jsonb_build_object(
      'content_recommendations', jsonb_build_object('strategy', 'delete', 'eligible', v_content_candidates, 'processed', v_content_processed),
      'analytics_events', jsonb_build_object('strategy', 'delete', 'eligible', v_analytics_candidates, 'processed', v_analytics_processed),
      'workout_review_requests', jsonb_build_object('strategy', 'delete', 'eligible', v_review_candidates, 'processed', v_review_processed),
      'admin_audit_logs', jsonb_build_object('strategy', 'delete', 'eligible', v_admin_candidates, 'processed', v_admin_processed),
      'user_answers', jsonb_build_object('strategy', 'anonymize', 'eligible', v_answers_candidates, 'processed', v_answers_processed),
      'workouts', jsonb_build_object('strategy', 'anonymize', 'eligible', v_workouts_candidates, 'processed', v_workouts_processed),
      'users', jsonb_build_object('strategy', 'anonymize', 'eligible', v_users_candidates, 'processed', v_users_processed),
      'user_consents', jsonb_build_object('strategy', 'delete_when_marked', 'eligible', v_consents_candidates, 'processed', v_consents_processed)
    )
  );
end;
$$;

revoke all on function public.run_retention_cleanup(timestamptz, boolean) from public;
revoke all on function public.run_retention_cleanup(timestamptz, boolean) from anon;
revoke all on function public.run_retention_cleanup(timestamptz, boolean) from authenticated;
grant execute on function public.run_retention_cleanup(timestamptz, boolean) to service_role;

notify pgrst, 'reload schema';
