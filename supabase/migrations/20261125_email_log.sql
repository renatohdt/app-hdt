-- Registro dos e-mails estratégicos enviados pelo app (Resend).
-- Serve para nunca mandar o mesmo e-mail duas vezes e para medir o que saiu.
-- Acesso só pelo servidor (service role): RLS ligado e sem políticas.

create table if not exists public.email_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null,
  dedupe_key text not null default 'once',
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  provider_id text,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create unique index if not exists email_log_user_kind_key_uidx
  on public.email_log (user_id, kind, dedupe_key);

create index if not exists email_log_kind_created_idx
  on public.email_log (kind, created_at desc);

alter table public.email_log enable row level security;
