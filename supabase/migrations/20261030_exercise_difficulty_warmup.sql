-- Dificuldade (1 a 5) e marca "pode ser aquecimento" nos exercícios (out/2026).
--   difficulty : o que a pessoa precisa para EXECUTAR o exercício (técnica, força,
--                coordenação, equilíbrio). Não mede carga. 1 = qualquer pessoa
--                consegue, 2 = fácil, 3 = fácil mas requer atenção, 4 = desafiador,
--                5 = avançado. Fica vazia (null) nos exercícios ainda não avaliados;
--                o admin passa a exigir a nota em todo cadastro novo ou editado.
--   can_warmup : o exercício pode entrar na vaga de aquecimento do treino.
-- Rodar primeiro no DEV. Produção só com ordem explícita.
alter table public.exercises
  add column if not exists difficulty smallint,
  add column if not exists can_warmup boolean not null default false;

alter table public.exercises drop constraint if exists exercises_difficulty_range;
alter table public.exercises
  add constraint exercises_difficulty_range check (difficulty is null or difficulty between 1 and 5);
