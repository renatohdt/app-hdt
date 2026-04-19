-- =============================================
-- Campos de cobrança na tabela users
-- Armazenados aqui para NÃO trafegar pelo Stripe
-- Hora do Treino — abril de 2026
-- =============================================

alter table public.users
  add column if not exists billing_name text,
  add column if not exists billing_cpf  text;

comment on column public.users.billing_name is 'Nome completo informado no checkout — usado para Nota Fiscal';
comment on column public.users.billing_cpf  is 'CPF informado no checkout — nunca enviado ao Stripe';
