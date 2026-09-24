-- Adiciona/normaliza a coluna `location` nos treinos, viabilizando programas
-- paralelos por local (casa / condomínio / academia). Backfill 'home' garante que
-- todos os treinos existentes viram "casa" — sem regenerar nada. Idempotente.
-- (Aplicada no DEV em 2026-09-22; aplicar em produção junto com o deploy da feature.)

-- 1) coluna (cria se não existir)
alter table public.workouts add column if not exists location text;

-- 2) backfill dos existentes para 'home' (treinos atuais = casa)
update public.workouts set location = 'home' where location is null;

-- 3) default + not null
alter table public.workouts alter column location set default 'home';
alter table public.workouts alter column location set not null;

-- 4) constraint de valores válidos (idempotente)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.workouts'::regclass and conname = 'workouts_location_check'
  ) then
    alter table public.workouts
      add constraint workouts_location_check check (location in ('home','condo_gym','gym'));
  end if;
end $$;

-- 5) índice para buscar o treino ativo por usuário/tipo/local
create index if not exists workouts_user_type_location_idx
  on public.workouts(user_id, type, location);

-- 6) Unicidade por local: antes era 1 treino padrão por usuário
--    (workouts_user_standard_unique). Agora é 1 por (usuário, local), permitindo
--    programas paralelos casa/condomínio. Idempotente.
drop index if exists public.workouts_user_standard_unique;
create unique index if not exists workouts_user_standard_location_unique
  on public.workouts (user_id, location) where (type = 'standard');
