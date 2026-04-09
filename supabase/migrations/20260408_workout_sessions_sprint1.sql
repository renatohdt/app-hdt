alter table public.workouts add column if not exists total_sessions integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workouts_total_sessions_check'
  ) then
    alter table public.workouts
      add constraint workouts_total_sessions_check
      check (total_sessions is null or total_sessions > 0);
  end if;
end
$$;

update public.workouts w
set total_sessions = greatest(
  1,
  round(
    greatest(
      coalesce(nullif(ua.answers->>'days', '')::numeric, 0),
      coalesce(
        nullif(w.exercises->>'sessionCount', '')::numeric,
        case
          when jsonb_typeof(w.exercises->'sections') = 'array' then jsonb_array_length(w.exercises->'sections')::numeric
          else 0
        end,
        1
      )
    ) * 4.4
  )::integer
)
from public.user_answers ua
where ua.user_id = w.user_id
  and w.total_sessions is null;

update public.workouts w
set total_sessions = greatest(
  1,
  round(
    coalesce(
      nullif(w.exercises->>'sessionCount', '')::numeric,
      case
        when jsonb_typeof(w.exercises->'sections') = 'array' then jsonb_array_length(w.exercises->'sections')::numeric
        else 1
      end
    ) * 4.4
  )::integer
)
where w.total_sessions is null;

create table if not exists public.workout_session_logs (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  workout_hash text check (workout_hash is null or workout_hash ~ '^[a-f0-9]{64}$'),
  workout_key text check (workout_key is null or btrim(workout_key) <> ''),
  session_number integer not null check (session_number > 0),
  status text not null default 'completed' check (status in ('completed')),
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists workout_session_logs_unique_cycle_session_idx
  on public.workout_session_logs(workout_id, coalesce(workout_hash, ''), session_number);

create index if not exists workout_session_logs_workout_cycle_idx
  on public.workout_session_logs(workout_id, workout_hash, completed_at desc);

create index if not exists workout_session_logs_user_completed_at_idx
  on public.workout_session_logs(user_id, completed_at desc);

alter table public.workout_session_logs enable row level security;

drop policy if exists "Users can read own workout session logs" on public.workout_session_logs;
drop policy if exists "Users can insert own workout session logs" on public.workout_session_logs;
drop policy if exists "Users can update own workout session logs" on public.workout_session_logs;
drop policy if exists "Users can delete own workout session logs" on public.workout_session_logs;

create policy "Users can read own workout session logs"
  on public.workout_session_logs
  for select
  using (auth.uid() = user_id);

create policy "Users can insert own workout session logs"
  on public.workout_session_logs
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update own workout session logs"
  on public.workout_session_logs
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own workout session logs"
  on public.workout_session_logs
  for delete
  using (auth.uid() = user_id);
