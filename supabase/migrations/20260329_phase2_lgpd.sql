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

alter table public.workout_review_requests enable row level security;

drop policy if exists "Users can read own workout review requests" on public.workout_review_requests;
drop policy if exists "Users can insert own workout review requests" on public.workout_review_requests;
drop policy if exists "Users can delete own workout review requests" on public.workout_review_requests;
drop policy if exists "Users can delete own row" on public.users;
drop policy if exists "Users can delete own answers" on public.user_answers;
drop policy if exists "Users can delete own consents" on public.user_consents;
drop policy if exists "Users can delete own workouts" on public.workouts;
drop policy if exists "Users can delete own analytics events" on public.analytics_events;
drop policy if exists "Users can delete own content recommendations" on public.content_recommendations;

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

create policy "Users can delete own row"
  on public.users
  for delete
  using (auth.uid() = id);

create policy "Users can delete own answers"
  on public.user_answers
  for delete
  using (auth.uid() = user_id);

create policy "Users can delete own consents"
  on public.user_consents
  for delete
  using (auth.uid() = user_id);

create policy "Users can delete own workouts"
  on public.workouts
  for delete
  using (auth.uid() = user_id);

create policy "Users can delete own analytics events"
  on public.analytics_events
  for delete
  using (auth.uid() = user_id);

create policy "Users can delete own content recommendations"
  on public.content_recommendations
  for delete
  using (auth.uid() = user_id);

notify pgrst, 'reload schema';
