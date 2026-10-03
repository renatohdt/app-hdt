-- Tempo real do treino ("Treino em andamento").
-- Colunas opcionais: sessões antigas ficam NULL e nada quebra.
-- end_reason: 'manual' (tocou em Finalizar), 'all_done' (marcou tudo),
--             'auto_idle' (fechado automaticamente após 50 min sem atividade).
-- timing_reliable: false quando o tempo é estimado (fechamento automático sem
-- nenhuma série marcada). A IA só usa sessões com timing_reliable = true.

alter table public.workout_session_logs
  add column if not exists started_at timestamptz,
  add column if not exists duration_seconds integer,
  add column if not exists completion_ratio numeric(4,3),
  add column if not exists sets_done smallint,
  add column if not exists sets_total smallint,
  add column if not exists end_reason text,
  add column if not exists timing_reliable boolean;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'workout_session_logs_duration_check') then
    alter table public.workout_session_logs
      add constraint workout_session_logs_duration_check
      check (duration_seconds is null or (duration_seconds >= 0 and duration_seconds <= 43200));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'workout_session_logs_completion_ratio_check') then
    alter table public.workout_session_logs
      add constraint workout_session_logs_completion_ratio_check
      check (completion_ratio is null or (completion_ratio >= 0 and completion_ratio <= 1));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'workout_session_logs_end_reason_check') then
    alter table public.workout_session_logs
      add constraint workout_session_logs_end_reason_check
      check (end_reason is null or end_reason in ('manual', 'all_done', 'auto_idle'));
  end if;
end $$;
