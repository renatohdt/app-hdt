-- Histórico das notificações AUTOMÁTICAS enviadas para cada usuário (out/2026).
-- Serve para três coisas:
--   1) não mandar a mesma notificação duas vezes (dedupe_key único por usuário);
--   2) aplicar os limites de engajamento (1 por dia, 3 por semana);
--   3) guardar avisos de conta que caíram no horário de silêncio (status 'pending')
--      para o cron enviar às 8h.
-- Só o servidor (service_role) grava. O próprio usuário só LÊ o seu histórico
-- (usado na exportação de dados da LGPD, que roda com o login dele).
create table if not exists public.notification_log (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  type          text not null,          -- treino_do_dia, sem_treinar, medidas, indicacao, pagamento...
  category      text not null check (category in ('engagement', 'account')),
  dedupe_key    text not null,
  title         text not null,
  body          text not null,
  url           text not null default '/dashboard',
  status        text not null default 'sending'
                check (status in ('pending', 'sending', 'sent', 'failed', 'no_device')),
  send_after    timestamptz not null default now(),
  sent_count    integer,
  failed_count  integer,
  created_at    timestamptz not null default now(),
  sent_at       timestamptz,
  unique (user_id, dedupe_key)
);

create index if not exists notification_log_user_created_idx
  on public.notification_log (user_id, created_at desc);

create index if not exists notification_log_pending_idx
  on public.notification_log (send_after)
  where status = 'pending';

alter table public.notification_log enable row level security;

drop policy if exists "Usuário lê o próprio histórico de notificações" on public.notification_log;
create policy "Usuário lê o próprio histórico de notificações"
  on public.notification_log for select
  to authenticated
  using ((select auth.uid()) = user_id);
