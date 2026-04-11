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

create or replace function public.normalize_exercise_name(input text)
returns text
language sql
immutable
as $$
  select trim(
    regexp_replace(
      lower(
        translate(
          coalesce(input, ''),
          'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñÝŸýÿ',
          'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNnYYyy'
        )
      ),
      '\s+',
      ' ',
      'g'
    )
  );
$$;

create or replace function public.normalize_exercise_muscle_group(input text)
returns text
language sql
immutable
as $$
  with prepared as (
    select
      nullif(
        trim(
          regexp_replace(
            regexp_replace(
              lower(
                translate(
                  coalesce(input, ''),
                  'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñÝŸýÿ',
                  'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNnYYyy'
                )
              ),
              '[_-]+',
              ' ',
              'g'
            ),
            '\s+',
            ' ',
            'g'
          )
        ),
        ''
      ) as normalized,
      nullif(btrim(coalesce(input, '')), '') as original
  )
  select case
    when normalized in ('chest', 'peito', 'peitoral') then 'chest'
    when normalized in ('back', 'costas', 'dorsal', 'dorsais') then 'back'
    when normalized in ('shoulders', 'ombro', 'ombros', 'deltoide', 'deltoides') then 'shoulders'
    when normalized in ('biceps', 'bicep') then 'biceps'
    when normalized in ('triceps', 'tricep') then 'triceps'
    when normalized in ('abs', 'abdomen', 'abdominal', 'abdominais', 'core') then 'abs'
    when normalized in ('lower back', 'lombar', 'lombares', 'lumbar') then 'lower_back'
    when normalized in ('quadriceps') then 'quadriceps'
    when normalized in ('glutes', 'gluteo', 'gluteos') then 'glutes'
    when normalized in ('hamstrings', 'posterior', 'posterior de coxa') then 'hamstrings'
    when normalized in ('calves', 'gemeos', 'panturrilha', 'panturrilhas') then 'calves'
    when normalized in ('forearms', 'antebraco', 'antebracos') then 'forearms'
    when normalized in ('adductors', 'adutor', 'adutores') then 'adductors'
    when normalized in ('abductors', 'abdutor', 'abdutores') then 'abductors'
    when normalized in ('tibial', 'tibiais', 'tibialis') then 'tibialis'
    when normalized in (
      'hip flexor',
      'hip flexors',
      'flexor de quadril',
      'flexores de quadril',
      'flexor do quadril',
      'flexores do quadril',
      'iliopsoas'
    ) then 'hip_flexors'
    else original
  end
  from prepared;
$$;

create or replace function public.normalize_exercise_muscle_group_array(input text[])
returns text[]
language sql
immutable
as $$
  with normalized as (
    select
      public.normalize_exercise_muscle_group(item) as value,
      ord
    from unnest(coalesce(input, '{}'::text[])) with ordinality as item(item, ord)
  ),
  deduped as (
    select value, min(ord) as first_ord
    from normalized
    where value is not null
      and btrim(value) <> ''
    group by value
  )
  select coalesce(array(select value from deduped order by first_ord), '{}'::text[]);
$$;

create or replace function public.set_exercise_name_normalized()
returns trigger
language plpgsql
as $$
declare
  next_metadata jsonb;
  next_muscle_groups text[];
begin
  new.name_normalized = public.normalize_exercise_name(new.name);

  next_muscle_groups = public.normalize_exercise_muscle_group_array(
    case
      when coalesce(array_length(new.muscle_groups, 1), 0) > 0 then new.muscle_groups
      when jsonb_typeof(coalesce(new.metadata, '{}'::jsonb)->'muscle_groups') = 'array' then
        array(select jsonb_array_elements_text(coalesce(new.metadata, '{}'::jsonb)->'muscle_groups'))
      when jsonb_typeof(coalesce(new.metadata, '{}'::jsonb)->'muscles') = 'array' then
        array(select jsonb_array_elements_text(coalesce(new.metadata, '{}'::jsonb)->'muscles'))
      when coalesce(btrim(new.muscle), '') <> '' then array[new.muscle]
      when coalesce(btrim(coalesce(new.metadata, '{}'::jsonb)->>'muscle'), '') <> '' then
        array[coalesce(new.metadata, '{}'::jsonb)->>'muscle']
      else '{}'::text[]
    end
  );

  new.muscle_groups = next_muscle_groups;
  new.muscle = coalesce(
    next_muscle_groups[1],
    public.normalize_exercise_muscle_group(new.muscle),
    public.normalize_exercise_muscle_group(coalesce(new.metadata, '{}'::jsonb)->>'muscle')
  );

  next_metadata = coalesce(new.metadata, '{}'::jsonb);
  next_metadata = jsonb_set(next_metadata, '{muscle}', to_jsonb(coalesce(new.muscle, '')), true);
  next_metadata = jsonb_set(next_metadata, '{muscle_groups}', to_jsonb(new.muscle_groups), true);
  next_metadata = jsonb_set(next_metadata, '{muscles}', to_jsonb(new.muscle_groups), true);
  new.metadata = next_metadata;

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
  name_normalized text not null,
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
  total_sessions integer check (total_sessions is null or total_sessions > 0),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  anonymized_at timestamptz,
  expires_at timestamptz,
  retention_hold boolean not null default false
);

create table if not exists public.workout_session_logs (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  plan_cycle_id text check (plan_cycle_id is null or btrim(plan_cycle_id) <> ''),
  workout_hash text check (workout_hash is null or workout_hash ~ '^[a-f0-9]{64}$'),
  workout_key text check (workout_key is null or btrim(workout_key) <> ''),
  session_number integer not null check (session_number > 0),
  status text not null default 'completed' check (status in ('completed')),
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
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
alter table public.exercises add column if not exists name_normalized text;

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

update public.exercises
set name_normalized = public.normalize_exercise_name(name)
where coalesce(name_normalized, '') <> public.normalize_exercise_name(name);

drop trigger if exists set_exercises_name_normalized on public.exercises;

create trigger set_exercises_name_normalized
before insert or update of name, muscle, muscle_groups, metadata
on public.exercises
for each row
execute function public.set_exercise_name_normalized();

update public.exercises
set muscle = muscle,
    muscle_groups = muscle_groups,
    metadata = metadata;

alter table public.exercises
  alter column name_normalized set not null;

do $$
declare
  duplicate_names text;
begin
  select string_agg(format('%s (%s)', normalized_name, total), '; ' order by normalized_name)
    into duplicate_names
  from (
    select name_normalized as normalized_name, count(*) as total
    from public.exercises
    where coalesce(name_normalized, '') <> ''
    group by name_normalized
    having count(*) > 1
  ) duplicates;

  if duplicate_names is not null then
    raise exception 'Não foi possível criar o índice único de exercícios. Resolva os duplicados antes: %', duplicate_names;
  end if;
end;
$$;

update public.workouts
set hash = null
where hash is not null
  and hash !~ '^[a-f0-9]{64}$';

alter table public.workout_session_logs
  add column if not exists plan_cycle_id text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workout_session_logs_plan_cycle_id_check'
  ) then
    alter table public.workout_session_logs
      add constraint workout_session_logs_plan_cycle_id_check
      check (plan_cycle_id is null or btrim(plan_cycle_id) <> '');
  end if;
end
$$;

create unique index if not exists user_answers_user_id_key on public.user_answers(user_id);
create unique index if not exists workouts_user_id_key on public.workouts(user_id);
create unique index if not exists user_consents_user_scope_key on public.user_consents(user_id, scope);
create unique index if not exists content_recommendations_user_id_key on public.content_recommendations(user_id);

create index if not exists users_created_at_idx on public.users(created_at desc);
create index if not exists users_deleted_at_idx on public.users(deleted_at) where deleted_at is not null;

create index if not exists exercises_name_idx on public.exercises(name);
create unique index if not exists exercises_name_normalized_key on public.exercises(name_normalized)
  where coalesce(name_normalized, '') <> '';
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
drop index if exists workout_session_logs_unique_cycle_session_idx;
drop index if exists workout_session_logs_workout_cycle_idx;
create unique index if not exists workout_session_logs_unique_plan_cycle_session_idx
  on public.workout_session_logs(workout_id, plan_cycle_id, session_number)
  where plan_cycle_id is not null;
create unique index if not exists workout_session_logs_unique_legacy_cycle_session_idx
  on public.workout_session_logs(workout_id, coalesce(workout_hash, ''), session_number)
  where plan_cycle_id is null;
create index if not exists workout_session_logs_workout_plan_cycle_idx
  on public.workout_session_logs(workout_id, plan_cycle_id, completed_at desc)
  where plan_cycle_id is not null;
create index if not exists workout_session_logs_workout_hash_cycle_idx
  on public.workout_session_logs(workout_id, workout_hash, completed_at desc)
  where plan_cycle_id is null and workout_hash is not null;
create index if not exists workout_session_logs_workout_completed_at_idx
  on public.workout_session_logs(workout_id, completed_at desc);
create index if not exists workout_session_logs_user_completed_at_idx
  on public.workout_session_logs(user_id, completed_at desc);

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
alter table public.workout_session_logs enable row level security;
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
drop policy if exists "Users can read own workout session logs" on public.workout_session_logs;
drop policy if exists "Users can insert own workout session logs" on public.workout_session_logs;
drop policy if exists "Users can update own workout session logs" on public.workout_session_logs;
drop policy if exists "Users can delete own workout session logs" on public.workout_session_logs;

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

create policy "Users can read own workout session logs"
  on public.workout_session_logs
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own workout session logs"
  on public.workout_session_logs
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own workout session logs"
  on public.workout_session_logs
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own workout session logs"
  on public.workout_session_logs
  for delete
  to authenticated
  using (auth.uid() = user_id);

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
