-- Premium via assinatura da Apple (In-App Purchase), gerenciado pelo RevenueCat.
-- Espelha o padrão de `referral_premium_until`: guardamos apenas a data de
-- expiração do direito. O webhook do RevenueCat atualiza esse campo quando a
-- assinatura é comprada, renovada, cancelada, expira ou é reembolsada.
-- Se `apple_premium_expires_at` estiver no futuro, o usuário é premium.
alter table public.users
  add column if not exists apple_premium_expires_at timestamptz;

comment on column public.users.apple_premium_expires_at is
  'Expiração do premium via assinatura Apple (IAP/RevenueCat). Futuro = premium ativo.';
