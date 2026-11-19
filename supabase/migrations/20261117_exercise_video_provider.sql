-- Vídeo de fornecedor externo nos exercícios (nov/2026) — usado para liberar a Academia
-- com vídeos licenciados (YMove) enquanto o Renato grava os próprios.
--   video_provider    : fornecedor do vídeo externo ('ymove'). Null = só vídeo próprio (YouTube).
--   video_provider_id : ID estável do exercício/vídeo no fornecedor. NUNCA guardar o link
--                       do vídeo (os links da YMove vencem em 48h e não podem ser salvos).
--   video_thumb_url   : capa do vídeo (as capas da YMove não vencem e podem ser salvas).
-- Regra de exibição: se video_url (YouTube próprio) existir, ele tem prioridade.
-- Rodar primeiro no DEV. Produção só com ordem explícita.
alter table public.exercises
  add column if not exists video_provider text,
  add column if not exists video_provider_id text,
  add column if not exists video_thumb_url text;

alter table public.exercises drop constraint if exists exercises_video_provider_check;
alter table public.exercises
  add constraint exercises_video_provider_check
  check (video_provider is null or video_provider in ('ymove'));

alter table public.exercises drop constraint if exists exercises_video_provider_pair;
alter table public.exercises
  add constraint exercises_video_provider_pair
  check ((video_provider is null) = (video_provider_id is null));
