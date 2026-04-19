-- =============================================
-- Tabela de assinaturas premium (Stripe)
-- Hora do Treino — abril de 2026
-- =============================================

create table public.subscriptions (
  id                      uuid        primary key default gen_random_uuid(),
  user_id                 uuid        not null references public.users(id) on delete cascade,

  -- IDs do Stripe
  stripe_customer_id      text        not null,
  stripe_subscription_id  text        unique,
  stripe_price_id         text,

  -- Plano e status
  plan                    text        not null check (plan in ('monthly', 'annual')),
  status                  text        not null check (status in ('active', 'canceled', 'past_due', 'unpaid', 'incomplete')),

  -- Período de cobrança atual
  current_period_start    timestamptz,
  current_period_end      timestamptz,

  -- Cancelamento
  canceled_at             timestamptz,
  cancel_at_period_end    boolean     not null default false,

  -- Dados do cliente para Nota Fiscal (coletados no checkout)
  customer_name           text,
  customer_cpf            text,
  customer_email          text,

  -- Método de pagamento
  payment_method          text        check (payment_method in ('card', 'pix')),

  -- Timestamps
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- =============================================
-- Índices
-- =============================================

-- Garante no máximo uma assinatura ativa por usuário
create unique index subscriptions_user_active_idx
  on public.subscriptions(user_id)
  where status in ('active', 'past_due');

-- Buscas frequentes
create index subscriptions_user_id_idx
  on public.subscriptions(user_id);

create index subscriptions_stripe_customer_id_idx
  on public.subscriptions(stripe_customer_id);

create index subscriptions_stripe_subscription_id_idx
  on public.subscriptions(stripe_subscription_id)
  where stripe_subscription_id is not null;

create index subscriptions_status_idx
  on public.subscriptions(status);

-- =============================================
-- Atualização automática de updated_at
-- =============================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row
  execute function public.set_updated_at();

-- =============================================
-- RLS — Segurança por linha
-- =============================================

alter table public.subscriptions enable row level security;

-- Usuário lê apenas a própria assinatura
create policy "Users can read own subscription"
  on public.subscriptions
  for select
  using (auth.uid() = user_id);

-- Apenas service_role pode inserir (webhook do Stripe)
create policy "Service role can insert subscriptions"
  on public.subscriptions
  for insert
  with check (auth.role() = 'service_role');

-- Apenas service_role pode atualizar (webhook do Stripe)
create policy "Service role can update subscriptions"
  on public.subscriptions
  for update
  using (auth.role() = 'service_role');

-- Apenas service_role pode deletar
create policy "Service role can delete subscriptions"
  on public.subscriptions
  for delete
  using (auth.role() = 'service_role');
