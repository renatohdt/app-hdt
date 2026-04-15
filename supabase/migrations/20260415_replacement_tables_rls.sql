-- Habilitar RLS e criar políticas de acesso para as tabelas de substituição

-- ── workout_exercise_replacements ────────────────────────────────────────────

alter table public.workout_exercise_replacements enable row level security;

create policy "Users can read own replacements"
  on public.workout_exercise_replacements
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own replacements"
  on public.workout_exercise_replacements
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- ── user_excluded_exercises ──────────────────────────────────────────────────

alter table public.user_excluded_exercises enable row level security;

create policy "Users can read own excluded exercises"
  on public.user_excluded_exercises
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own excluded exercises"
  on public.user_excluded_exercises
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can delete own excluded exercises"
  on public.user_excluded_exercises
  for delete
  to authenticated
  using (auth.uid() = user_id);
