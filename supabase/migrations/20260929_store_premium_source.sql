-- Premium via lojas de app (Apple App Store e Google Play), gerenciado pelo RevenueCat.
-- A coluna `apple_premium_expires_at` guarda a expiração do premium de QUALQUER loja
-- (o nome ficou por histórico: a Apple veio primeiro). Estas colunas dizem DE ONDE
-- veio a assinatura, para o admin separar as contagens:
--   store_premium_source  = 'app_store' | 'play_store' (vem do campo `store` do evento)
--   store_premium_sandbox = true quando é compra de TESTE (TestFlight / testador de licença)
-- Não mudam quem é premium: isso continua sendo só `apple_premium_expires_at` no futuro.
alter table public.users
  add column if not exists store_premium_source text,
  add column if not exists store_premium_sandbox boolean;

comment on column public.users.store_premium_source is
  'Loja da assinatura via RevenueCat: app_store ou play_store.';
comment on column public.users.store_premium_sandbox is
  'true = compra de teste (sandbox). Não conta como receita no admin.';
