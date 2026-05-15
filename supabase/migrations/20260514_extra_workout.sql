-- Adiciona coluna `type` na tabela workouts para distinguir treinos padrão de treinos extras.
-- O valor padrão 'standard' garante que todos os registros existentes sejam compatíveis.
-- Treinos extras expiram automaticamente via `expires_at` (campo já existente).
alter table public.workouts
  add column if not exists type text not null default 'standard'
  check (type in ('standard', 'extra'));

create index if not exists workouts_type_idx on public.workouts(type);
create index if not exists workouts_user_type_idx on public.workouts(user_id, type);
