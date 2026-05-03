-- Sistema de XP e fases de evolução do usuário
-- 5 fases visuais: iniciante → pre_intermediario → intermediario → pre_avancado → avancado
-- Mapeamento para treino: iniciante/pre_intermediario → beginner | intermediario → intermediate | pre_avancado/avancado → advanced
-- Avanço: 250 XP + mínimo 6 meses na fase atual → avança e zera XP
-- Regressão: −2 XP/semana após 2 sem sem treinar | −1 fase após 60 dias sem treinar

alter table public.users
  add column if not exists xp_points          integer      not null default 0
    check (xp_points >= 0),
  add column if not exists current_phase      text         not null default 'iniciante'
    check (current_phase in ('iniciante','pre_intermediario','intermediario','pre_avancado','avancado')),
  add column if not exists phase_started_at   timestamptz  not null default now(),
  add column if not exists last_activity_at   timestamptz,
  -- Controle de bônus para evitar dupla-concessão
  add column if not exists last_perfect_week_at  timestamptz,
  add column if not exists last_monthly_xp_at    timestamptz,
  add column if not exists last_streak_xp_at     timestamptz,
  -- Controle do decaimento: aplicado no máximo 1× por dia
  add column if not exists last_decay_checked_at timestamptz;

comment on column public.users.xp_points          is 'Pontos de XP acumulados na fase atual. Zerado ao avançar de fase.';
comment on column public.users.current_phase       is 'Fase atual do usuário: iniciante | pre_intermediario | intermediario | pre_avancado | avancado';
comment on column public.users.phase_started_at    is 'Data em que o usuário entrou na fase atual. Usada para calcular o portão de 6 meses.';
comment on column public.users.last_activity_at    is 'Última vez que o usuário concluiu uma sessão. Base para calcular decaimento.';
comment on column public.users.last_perfect_week_at  is 'Semana ISO da última vez que o bônus de semana perfeita foi concedido.';
comment on column public.users.last_monthly_xp_at    is 'Mês da última vez que o bônus de consistência mensal foi concedido.';
comment on column public.users.last_streak_xp_at     is 'Data da última vez que o bônus de streak de 7 dias foi concedido.';
comment on column public.users.last_decay_checked_at is 'Última vez que o decaimento por inatividade foi verificado. Evita dupla-dedução.';
