-- Tabela 1: histórico imutável de substituições de exercícios
create table public.workout_exercise_replacements (
  id                     uuid        primary key default gen_random_uuid(),
  user_id                uuid        not null references public.users(id) on delete cascade,
  workout_id             uuid        not null,
  workout_day_id         text        not null,
  original_exercise_id   text        not null,
  replacement_exercise_id text       not null,
  reason                 text        not null,
  plan_type_at_time      text        not null,
  created_at             timestamptz not null default now()
);

create index on public.workout_exercise_replacements (user_id, workout_id);
create index on public.workout_exercise_replacements (user_id, workout_id, workout_day_id);
create index on public.workout_exercise_replacements (user_id, original_exercise_id);

-- Tabela 2: exercícios bloqueados pelo usuário (fonte de verdade para o catálogo da IA)
create table public.user_excluded_exercises (
  user_id       uuid        not null references public.users(id) on delete cascade,
  exercise_id   text        not null,
  exercise_name text        not null,
  created_at    timestamptz not null default now(),
  primary key (user_id, exercise_id)
);
