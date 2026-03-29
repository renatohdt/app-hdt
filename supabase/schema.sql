create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz not null default now()
);

alter table public.users add column if not exists role text not null default 'user';
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check check (role in ('admin', 'user'));

alter table public.users drop column if exists auth_user_id;
alter table public.users drop column if exists email;
alter table public.users drop column if exists profile;
alter table public.users drop column if exists quiz_started;
alter table public.users drop column if exists quiz_completed;
alter table public.users drop column if exists viewed_workout;
alter table public.users drop column if exists clicked_cta;

create table if not exists public.user_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  answers jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_answers_user_id_key on public.user_answers(user_id);

create table if not exists public.user_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null,
  granted boolean not null,
  version text not null,
  source text,
  granted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.user_consents add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.user_consents add column if not exists scope text;
alter table public.user_consents add column if not exists granted boolean;
alter table public.user_consents add column if not exists version text;
alter table public.user_consents add column if not exists source text;
alter table public.user_consents add column if not exists granted_at timestamptz;
alter table public.user_consents add column if not exists revoked_at timestamptz;
alter table public.user_consents add column if not exists created_at timestamptz not null default now();
alter table public.user_consents alter column user_id set not null;
alter table public.user_consents alter column scope set not null;
alter table public.user_consents alter column granted set not null;
alter table public.user_consents alter column version set not null;
alter table public.user_consents alter column created_at set default now();

create unique index if not exists user_consents_user_scope_key on public.user_consents(user_id, scope);
create index if not exists user_consents_user_id_idx on public.user_consents(user_id);
create index if not exists user_consents_scope_granted_idx on public.user_consents(scope, granted);

create table if not exists public.workout_review_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workout_id uuid references public.workouts(id) on delete set null,
  reason text not null,
  status text not null default 'requested',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workout_review_requests add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.workout_review_requests add column if not exists workout_id uuid references public.workouts(id) on delete set null;
alter table public.workout_review_requests add column if not exists reason text;
alter table public.workout_review_requests add column if not exists status text not null default 'requested';
alter table public.workout_review_requests add column if not exists created_at timestamptz not null default now();
alter table public.workout_review_requests add column if not exists updated_at timestamptz not null default now();
alter table public.workout_review_requests alter column user_id set not null;
alter table public.workout_review_requests alter column reason set not null;
alter table public.workout_review_requests alter column status set default 'requested';
alter table public.workout_review_requests alter column created_at set default now();
alter table public.workout_review_requests alter column updated_at set default now();

create index if not exists workout_review_requests_user_id_idx on public.workout_review_requests(user_id);
create index if not exists workout_review_requests_workout_id_idx on public.workout_review_requests(workout_id);
create index if not exists workout_review_requests_status_idx on public.workout_review_requests(status);

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  muscle text,
  type text,
  location text[] not null default '{}',
  equipment text[] not null default '{}',
  level text[] not null default '{}',
  tags text[] not null default '{}',
  metadata jsonb not null default '{"muscle":"","type":"","level":[],"location":[],"equipment":[]}'::jsonb,
  video_url text
);

alter table public.exercises add column if not exists muscle text;
alter table public.exercises add column if not exists type text;
alter table public.exercises add column if not exists location text[] not null default '{}';
alter table public.exercises add column if not exists equipment text[] not null default '{}';
alter table public.exercises add column if not exists level text[] not null default '{}';
alter table public.exercises add column if not exists metadata jsonb not null default '{"muscle":"","type":"","level":[],"location":[],"equipment":[]}'::jsonb;
alter table public.exercises alter column metadata set default '{"muscle":"","type":"","level":[],"location":[],"equipment":[]}'::jsonb;
update public.exercises
set metadata = jsonb_set(
  metadata,
  '{level}',
  case
    when jsonb_typeof(metadata->'level') = 'array' then metadata->'level'
    when coalesce(metadata->>'level', '') = '' then '[]'::jsonb
    else jsonb_build_array(metadata->>'level')
  end
)
where metadata ? 'level';
alter table public.exercises drop column if exists description;

create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  hash text,
  exercises jsonb not null,
  created_at timestamptz not null default now()
);

create unique index if not exists workouts_user_id_key on public.workouts(user_id);
create index if not exists workouts_hash_idx on public.workouts(hash);
alter table public.workouts add column if not exists hash text;
update public.workouts
set hash = null
where hash is not null
  and hash !~ '^[a-f0-9]{64}$';

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  user_id uuid not null references public.users(id) on delete cascade,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.analytics_events add column if not exists event_name text;
alter table public.analytics_events add column if not exists user_id uuid references public.users(id) on delete cascade;
alter table public.analytics_events add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.analytics_events alter column metadata set default '{}'::jsonb;

create table if not exists public.content_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  articles jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  updated_at timestamptz not null default now()
);

alter table public.content_recommendations add column if not exists user_id uuid references public.users(id) on delete cascade;
alter table public.content_recommendations add column if not exists articles jsonb not null default '[]'::jsonb;
alter table public.content_recommendations add column if not exists generated_at timestamptz not null default now();
alter table public.content_recommendations add column if not exists expires_at timestamptz not null default (now() + interval '24 hours');
alter table public.content_recommendations add column if not exists updated_at timestamptz not null default now();
alter table public.content_recommendations alter column articles set default '[]'::jsonb;
create unique index if not exists content_recommendations_user_id_key on public.content_recommendations(user_id);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id text not null,
  admin_email text,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.admin_audit_logs add column if not exists admin_id text;
alter table public.admin_audit_logs add column if not exists admin_email text;
alter table public.admin_audit_logs add column if not exists action text;
alter table public.admin_audit_logs add column if not exists target_type text;
alter table public.admin_audit_logs add column if not exists target_id text;
alter table public.admin_audit_logs add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.admin_audit_logs add column if not exists created_at timestamptz not null default now();
alter table public.admin_audit_logs alter column admin_id set not null;
alter table public.admin_audit_logs alter column action set not null;
alter table public.admin_audit_logs alter column target_type set not null;
alter table public.admin_audit_logs alter column metadata set default '{}'::jsonb;
alter table public.admin_audit_logs alter column created_at set default now();
create index if not exists admin_audit_logs_admin_id_idx on public.admin_audit_logs(admin_id);
create index if not exists admin_audit_logs_action_idx on public.admin_audit_logs(action);
create index if not exists admin_audit_logs_created_at_idx on public.admin_audit_logs(created_at desc);

alter table public.users enable row level security;
alter table public.user_answers enable row level security;
alter table public.user_consents enable row level security;
alter table public.workout_review_requests enable row level security;
alter table public.exercises enable row level security;
alter table public.workouts enable row level security;
alter table public.analytics_events enable row level security;
alter table public.content_recommendations enable row level security;
alter table public.admin_audit_logs enable row level security;

drop policy if exists "Users can read own row" on public.users;
drop policy if exists "Users can insert own row" on public.users;
drop policy if exists "Users can update own row" on public.users;
drop policy if exists "Users can read own answers" on public.user_answers;
drop policy if exists "Users can insert own answers" on public.user_answers;
drop policy if exists "Users can update own answers" on public.user_answers;
drop policy if exists "Users can read own consents" on public.user_consents;
drop policy if exists "Users can insert own consents" on public.user_consents;
drop policy if exists "Users can update own consents" on public.user_consents;
drop policy if exists "Users can delete own consents" on public.user_consents;
drop policy if exists "Users can read own workout review requests" on public.workout_review_requests;
drop policy if exists "Users can insert own workout review requests" on public.workout_review_requests;
drop policy if exists "Users can delete own workout review requests" on public.workout_review_requests;
drop policy if exists "Users can read own workouts" on public.workouts;
drop policy if exists "Users can insert own workouts" on public.workouts;
drop policy if exists "Users can update own workouts" on public.workouts;
drop policy if exists "Users can delete own workouts" on public.workouts;
drop policy if exists "Exercises are readable" on public.exercises;
drop policy if exists "Analytics blocked by default" on public.analytics_events;
drop policy if exists "Users can insert own analytics events" on public.analytics_events;
drop policy if exists "Users can read own analytics events" on public.analytics_events;
drop policy if exists "Users can delete own analytics events" on public.analytics_events;
drop policy if exists "Users can read own content recommendations" on public.content_recommendations;
drop policy if exists "Users can insert own content recommendations" on public.content_recommendations;
drop policy if exists "Users can update own content recommendations" on public.content_recommendations;
drop policy if exists "Users can delete own content recommendations" on public.content_recommendations;
drop policy if exists "Users can delete own row" on public.users;
drop policy if exists "Users can delete own answers" on public.user_answers;

create policy "Users can read own row"
  on public.users
  for select
  using (auth.uid() = id);

create policy "Users can insert own row"
  on public.users
  for insert
  with check (auth.uid() = id and role = 'user');

create policy "Users can update own row"
  on public.users
  for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (
      select existing.role
      from public.users as existing
      where existing.id = auth.uid()
    )
  );

create policy "Users can delete own row"
  on public.users
  for delete
  using (auth.uid() = id);

create policy "Users can read own answers"
  on public.user_answers
  for select
  using (auth.uid() = user_id);

create policy "Users can insert own answers"
  on public.user_answers
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update own answers"
  on public.user_answers
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own answers"
  on public.user_answers
  for delete
  using (auth.uid() = user_id);

create policy "Users can read own consents"
  on public.user_consents
  for select
  using (auth.uid() = user_id);

create policy "Users can insert own consents"
  on public.user_consents
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update own consents"
  on public.user_consents
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own consents"
  on public.user_consents
  for delete
  using (auth.uid() = user_id);

create policy "Users can read own workout review requests"
  on public.workout_review_requests
  for select
  using (auth.uid() = user_id);

create policy "Users can insert own workout review requests"
  on public.workout_review_requests
  for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own workout review requests"
  on public.workout_review_requests
  for delete
  using (auth.uid() = user_id);

create policy "Users can read own workouts"
  on public.workouts
  for select
  using (auth.uid() = user_id);

create policy "Users can insert own workouts"
  on public.workouts
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update own workouts"
  on public.workouts
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own workouts"
  on public.workouts
  for delete
  using (auth.uid() = user_id);

create policy "Exercises are readable"
  on public.exercises
  for select
  using (true);

create policy "Users can insert own analytics events"
  on public.analytics_events
  for insert
  with check (auth.uid() = user_id);

create policy "Users can read own analytics events"
  on public.analytics_events
  for select
  using (auth.uid() = user_id);

create policy "Users can delete own analytics events"
  on public.analytics_events
  for delete
  using (auth.uid() = user_id);

create policy "Users can read own content recommendations"
  on public.content_recommendations
  for select
  using (auth.uid() = user_id);

create policy "Users can insert own content recommendations"
  on public.content_recommendations
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update own content recommendations"
  on public.content_recommendations
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own content recommendations"
  on public.content_recommendations
  for delete
  using (auth.uid() = user_id);

alter table public.users add column if not exists deleted_at timestamptz;
alter table public.users add column if not exists anonymized_at timestamptz;
alter table public.users add column if not exists retention_hold boolean not null default false;
create index if not exists users_deleted_at_idx on public.users(deleted_at) where deleted_at is not null;

alter table public.user_answers add column if not exists deleted_at timestamptz;
alter table public.user_answers add column if not exists anonymized_at timestamptz;
alter table public.user_answers add column if not exists expires_at timestamptz;
alter table public.user_answers add column if not exists retention_hold boolean not null default false;
create index if not exists user_answers_deleted_at_idx on public.user_answers(deleted_at) where deleted_at is not null;
create index if not exists user_answers_expires_at_idx on public.user_answers(expires_at) where expires_at is not null;

alter table public.workouts add column if not exists deleted_at timestamptz;
alter table public.workouts add column if not exists anonymized_at timestamptz;
alter table public.workouts add column if not exists expires_at timestamptz;
alter table public.workouts add column if not exists retention_hold boolean not null default false;
create index if not exists workouts_deleted_at_idx on public.workouts(deleted_at) where deleted_at is not null;
create index if not exists workouts_expires_at_idx on public.workouts(expires_at) where expires_at is not null;

alter table public.analytics_events add column if not exists deleted_at timestamptz;
alter table public.analytics_events add column if not exists anonymized_at timestamptz;
alter table public.analytics_events add column if not exists expires_at timestamptz;
alter table public.analytics_events add column if not exists retention_hold boolean not null default false;
update public.analytics_events
set expires_at = coalesce(expires_at, created_at + interval '180 days')
where expires_at is null;
alter table public.analytics_events alter column expires_at set default (now() + interval '180 days');
alter table public.analytics_events alter column expires_at set not null;
create index if not exists analytics_events_expires_at_idx on public.analytics_events(expires_at) where retention_hold = false;

alter table public.content_recommendations add column if not exists deleted_at timestamptz;
alter table public.content_recommendations add column if not exists anonymized_at timestamptz;
alter table public.content_recommendations add column if not exists retention_hold boolean not null default false;
create index if not exists content_recommendations_expires_at_idx on public.content_recommendations(expires_at) where retention_hold = false;

alter table public.user_consents add column if not exists deleted_at timestamptz;
alter table public.user_consents add column if not exists anonymized_at timestamptz;
alter table public.user_consents add column if not exists expires_at timestamptz;
alter table public.user_consents add column if not exists retention_hold boolean not null default false;
create index if not exists user_consents_deleted_at_idx on public.user_consents(deleted_at) where deleted_at is not null;
create index if not exists user_consents_expires_at_idx on public.user_consents(expires_at) where expires_at is not null;

alter table public.workout_review_requests add column if not exists deleted_at timestamptz;
alter table public.workout_review_requests add column if not exists anonymized_at timestamptz;
alter table public.workout_review_requests add column if not exists expires_at timestamptz;
alter table public.workout_review_requests add column if not exists retention_hold boolean not null default false;
update public.workout_review_requests
set expires_at = coalesce(expires_at, updated_at + interval '730 days')
where expires_at is null;
alter table public.workout_review_requests alter column expires_at set default (now() + interval '730 days');
create index if not exists workout_review_requests_expires_at_idx on public.workout_review_requests(expires_at) where retention_hold = false;

alter table public.admin_audit_logs add column if not exists deleted_at timestamptz;
alter table public.admin_audit_logs add column if not exists anonymized_at timestamptz;
alter table public.admin_audit_logs add column if not exists expires_at timestamptz;
alter table public.admin_audit_logs add column if not exists retention_hold boolean not null default false;
update public.admin_audit_logs
set expires_at = coalesce(expires_at, created_at + interval '730 days')
where expires_at is null;
alter table public.admin_audit_logs alter column expires_at set default (now() + interval '730 days');
alter table public.admin_audit_logs alter column expires_at set not null;
create index if not exists admin_audit_logs_expires_at_idx on public.admin_audit_logs(expires_at) where retention_hold = false;

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
    and expires_at is not null
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
      and expires_at is not null
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
