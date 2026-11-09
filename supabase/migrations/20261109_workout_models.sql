-- Modelos de treino (nov/2026): o Renato monta pelo admin; o app escolhe 1 modelo por plano
-- e usa os mesmos treinos A, B, C... dele (modelos ligados entre os dias).
--   split_type       : divisão (full_body_ab, upper_lower...) — código da estratégia do app
--   level            : beginner | intermediate | advanced
--   training_styles  : estilos que o modelo atende (musculacao, funcional, personal...)
--   goals            : hypertrophy | recomposition (Definição) | fat_loss | conditioning
--   durations        : tempos atendidos em minutos (15..90). Vazio = qualquer tempo
--   days             : { "A": [vagas...], "B": [vagas...] } — mesmo formato de TemplateSlot
--   status           : draft (rascunho, não vale no app) | ready (vale no app)
-- Só o servidor (service_role) lê e grava: RLS ligada e sem política para usuários.
-- Rodar primeiro no DEV. Produção só com ordem explícita.
create table if not exists public.workout_models (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  name            text not null,
  split_type      text not null,
  level           text not null check (level in ('beginner', 'intermediate', 'advanced')),
  training_styles text[] not null default '{}',
  goals           text[] not null default '{}',
  durations       integer[] not null default '{}',
  days            jsonb not null default '{}'::jsonb,
  status          text not null default 'draft' check (status in ('draft', 'ready')),
  notes           text,
  created_at      timestamp with time zone not null default now(),
  updated_at      timestamp with time zone not null default now()
);

create index if not exists workout_models_lookup_idx
  on public.workout_models (status, split_type, level);

alter table public.workout_models enable row level security;
