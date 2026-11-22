-- Migration: cancellation_feedbacks
-- Guarda as respostas do questionário que aparece quando o usuário clica em
-- "Cancelar assinatura". Objetivo: entender por que as pessoas saem do Premium.
--
-- Campos:
--   reason        → motivo principal escolhido (null = pessoa clicou em "Pular")
--   comment       → texto livre opcional (obrigatório quando reason = 'outro')
--   source        → por onde a pessoa assinou: stripe_web, stripe_app, app_store, play_store
--   plan          → plano no momento do cancelamento: monthly ou annual
--   cancelled_at  → quando o cancelamento foi CONFIRMADO de verdade.
--                   Stripe: preenchido na hora pelo /api/stripe/manage.
--                   Lojas: preenchido pelo webhook do RevenueCat (evento CANCELLATION).
--                   Continua null se a pessoa respondeu mas desistiu de cancelar.

create table if not exists public.cancellation_feedbacks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  reason        text check (
    reason is null or reason in (
      'sem_tempo',
      'caro',
      'treinos_nao_combinam',
      'sem_resultado',
      'personal_ou_outro_app',
      'problemas_no_app',
      'so_testando',
      'outro'
    )
  ),
  comment       text check (comment is null or char_length(comment) <= 1000),
  source        text not null check (source in ('stripe_web', 'stripe_app', 'app_store', 'play_store')),
  plan          text check (plan is null or plan in ('monthly', 'annual')),
  cancelled_at  timestamptz,
  created_at    timestamptz not null default now(),

  -- "Outro motivo" exige que a pessoa escreva algo.
  constraint cancellation_feedbacks_outro_requires_comment
    check (reason is distinct from 'outro' or char_length(coalesce(trim(comment), '')) > 0)
);

-- Índices para o admin (ordenar por data) e para o webhook achar a resposta do usuário.
create index if not exists cancellation_feedbacks_user_id_idx    on public.cancellation_feedbacks (user_id, created_at desc);
create index if not exists cancellation_feedbacks_created_at_idx on public.cancellation_feedbacks (created_at desc);

-- RLS: usuário só insere e lê as próprias respostas.
-- Atualizar cancelled_at e ler tudo (admin) é feito no servidor com a service role.
alter table public.cancellation_feedbacks enable row level security;

create policy "Usuário insere própria resposta de cancelamento"
  on public.cancellation_feedbacks
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Usuário lê próprias respostas de cancelamento"
  on public.cancellation_feedbacks
  for select
  to authenticated
  using (auth.uid() = user_id);
