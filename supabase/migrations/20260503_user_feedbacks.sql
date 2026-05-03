-- Migration: user_feedbacks
-- Tabela para armazenar os feedbacks rápidos dos usuários coletados pelo modal in-app.
--
-- Campos:
--   rating             → nota de 1 a 5 estrelas
--   improvement_reason → motivo de insatisfação (só preenchido quando rating <= 3)
--   comment            → campo livre opcional, visível para todos
--   page_count_at_trigger → quantas páginas o usuário havia visitado quando o modal apareceu

create table if not exists public.user_feedbacks (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  rating                smallint not null check (rating between 1 and 5),
  improvement_reason    text check (
    improvement_reason is null or improvement_reason in (
      'treinos_nao_sao_para_mim',
      'dificil_de_usar',
      'falta_algo_que_preciso',
      'outro'
    )
  ),
  comment               text check (comment is null or char_length(comment) <= 1000),
  page_count_at_trigger integer,
  created_at            timestamptz not null default now()
);

-- Índice para facilitar consultas no admin (ordenar por data, filtrar por usuário)
create index if not exists user_feedbacks_user_id_idx    on public.user_feedbacks (user_id);
create index if not exists user_feedbacks_created_at_idx on public.user_feedbacks (created_at desc);

-- RLS: usuários só podem inserir os próprios feedbacks; admin lê tudo via service role
alter table public.user_feedbacks enable row level security;

create policy "Usuário insere próprio feedback"
  on public.user_feedbacks
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Usuário lê próprios feedbacks"
  on public.user_feedbacks
  for select
  to authenticated
  using (auth.uid() = user_id);
