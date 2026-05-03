-- Adiciona coluna de estilos de treino na tabela de exercícios
-- Permite categorizar cada exercício por metodologia (musculação, HIIT, funcional, etc.)
-- Usa array para suportar múltiplos estilos por exercício (ex: funcional + hiit)

alter table public.exercises
  add column if not exists training_styles text[] not null default '{}';

-- Índice GIN para buscas eficientes dentro do array (mesmo padrão de muscle_groups)
create index if not exists exercises_training_styles_idx
  on public.exercises
  using gin (training_styles);
