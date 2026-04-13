alter table public.workout_session_logs
  add column if not exists completed_day_sp date;

create unique index if not exists workout_session_logs_user_completed_day_sp_key
  on public.workout_session_logs(user_id, completed_day_sp)
  where completed_day_sp is not null;
