-- Oferta do preço do site (Stripe) por e-mail para usuários do app iOS/Android (nov/2026).
-- No app o Premium custa mais (preço da loja). Quando um usuário FREE do app abre o
-- popup de assinatura 3 vezes, o servidor coloca ele numa sequência do LeadLovers
-- que oferece os planos pelo site (mensal e anual). No máximo 1 e-mail a cada 30 dias.
--
-- popup_views        = aberturas do popup desde o último e-mail (zera ao enviar)
-- last_offer_sent_at = quando o último e-mail de oferta foi disparado
--
-- Só o servidor (service_role) lê e grava: sem policies para o usuário.
create table if not exists public.premium_offer_signals (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  popup_views         integer not null default 0,
  last_offer_sent_at  timestamptz,
  offers_sent         integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.premium_offer_signals enable row level security;

-- Soma +1 numa só operação (evita perder contagem se dois popups abrirem juntos)
-- e devolve a linha atualizada.
create or replace function public.increment_premium_offer_views(p_user_id uuid)
returns public.premium_offer_signals
language sql
security definer
set search_path = public
as $$
  insert into public.premium_offer_signals (user_id, popup_views, updated_at)
  values (p_user_id, 1, now())
  on conflict (user_id) do update
    set popup_views = public.premium_offer_signals.popup_views + 1,
        updated_at  = now()
  returning *;
$$;

revoke all on function public.increment_premium_offer_views(uuid) from public, anon, authenticated;
grant execute on function public.increment_premium_offer_views(uuid) to service_role;
