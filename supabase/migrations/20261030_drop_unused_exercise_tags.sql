-- Remove a coluna exercises.tags (out/2026).
-- Ela nunca foi usada: em produção os 211 exercícios têm tags vazio, e nenhum índice
-- ou view depende dela. Foi substituída por difficulty e can_warmup
-- (20261030_exercise_difficulty_warmup.sql). No DEV a coluna já não existe (no-op).
-- Aplicar só na produção, junto com a liberação da nova versão do gerador de treino.
alter table public.exercises drop column if exists tags;
