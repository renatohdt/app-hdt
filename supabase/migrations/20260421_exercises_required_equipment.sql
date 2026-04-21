-- Adiciona coluna required_equipment na tabela exercises.
-- Armazena os equipamentos que o usuário PRECISA ter TODOS ao mesmo tempo
-- para realizar o exercício (lógica AND).
-- Exemplos: ["halteres", "fitball"] para "Press na Fitball".
-- Quando vazio, o filtro padrão (OR) é usado — comportamento atual inalterado.

alter table exercises
  add column if not exists required_equipment text[] not null default '{}';
