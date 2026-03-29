alter table public.users add column if not exists deleted_at timestamptz;
alter table public.users add column if not exists anonymized_at timestamptz;
alter table public.users add column if not exists retention_hold boolean not null default false;
create index if not exists users_deleted_at_idx on public.users(deleted_at) where deleted_at is not null;

alter table public.user_answers add column if not exists deleted_at timestamptz;
alter table public.user_answers add column if not exists anonymized_at timestamptz;
alter table public.user_answers add column if not exists expires_at timestamptz;
alter table public.user_answers add column if not exists retention_hold boolean not null default false;
create index if not exists user_answers_deleted_at_idx on public.user_answers(deleted_at) where deleted_at is not null;
create index if not exists user_answers_expires_at_idx on public.user_answers(expires_at) where expires_at is not null;

alter table public.workouts add column if not exists deleted_at timestamptz;
alter table public.workouts add column if not exists anonymized_at timestamptz;
alter table public.workouts add column if not exists expires_at timestamptz;
alter table public.workouts add column if not exists retention_hold boolean not null default false;
create index if not exists workouts_deleted_at_idx on public.workouts(deleted_at) where deleted_at is not null;
create index if not exists workouts_expires_at_idx on public.workouts(expires_at) where expires_at is not null;

alter table public.analytics_events add column if not exists deleted_at timestamptz;
alter table public.analytics_events add column if not exists anonymized_at timestamptz;
alter table public.analytics_events add column if not exists expires_at timestamptz;
alter table public.analytics_events add column if not exists retention_hold boolean not null default false;
update public.analytics_events
set expires_at = coalesce(expires_at, created_at + interval '180 days')
where expires_at is null;
alter table public.analytics_events alter column expires_at set default (now() + interval '180 days');
alter table public.analytics_events alter column expires_at set not null;
create index if not exists analytics_events_expires_at_idx on public.analytics_events(expires_at) where retention_hold = false;

alter table public.content_recommendations add column if not exists deleted_at timestamptz;
alter table public.content_recommendations add column if not exists anonymized_at timestamptz;
alter table public.content_recommendations add column if not exists retention_hold boolean not null default false;
create index if not exists content_recommendations_expires_at_idx on public.content_recommendations(expires_at) where retention_hold = false;

alter table public.user_consents add column if not exists deleted_at timestamptz;
alter table public.user_consents add column if not exists anonymized_at timestamptz;
alter table public.user_consents add column if not exists expires_at timestamptz;
alter table public.user_consents add column if not exists retention_hold boolean not null default false;
create index if not exists user_consents_deleted_at_idx on public.user_consents(deleted_at) where deleted_at is not null;
create index if not exists user_consents_expires_at_idx on public.user_consents(expires_at) where expires_at is not null;

alter table public.workout_review_requests add column if not exists deleted_at timestamptz;
alter table public.workout_review_requests add column if not exists anonymized_at timestamptz;
alter table public.workout_review_requests add column if not exists expires_at timestamptz;
alter table public.workout_review_requests add column if not exists retention_hold boolean not null default false;
update public.workout_review_requests
set expires_at = coalesce(expires_at, updated_at + interval '730 days')
where expires_at is null;
alter table public.workout_review_requests alter column expires_at set default (now() + interval '730 days');
create index if not exists workout_review_requests_expires_at_idx on public.workout_review_requests(expires_at) where retention_hold = false;

alter table public.admin_audit_logs add column if not exists deleted_at timestamptz;
alter table public.admin_audit_logs add column if not exists anonymized_at timestamptz;
alter table public.admin_audit_logs add column if not exists expires_at timestamptz;
alter table public.admin_audit_logs add column if not exists retention_hold boolean not null default false;
update public.admin_audit_logs
set expires_at = coalesce(expires_at, created_at + interval '730 days')
where expires_at is null;
alter table public.admin_audit_logs alter column expires_at set default (now() + interval '730 days');
alter table public.admin_audit_logs alter column expires_at set not null;
create index if not exists admin_audit_logs_expires_at_idx on public.admin_audit_logs(expires_at) where retention_hold = false;

create or replace function public.run_retention_cleanup(
  p_run_at timestamptz default now(),
  p_dry_run boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_content_candidates integer := 0;
  v_content_processed integer := 0;
  v_analytics_candidates integer := 0;
  v_analytics_processed integer := 0;
  v_review_candidates integer := 0;
  v_review_processed integer := 0;
  v_admin_candidates integer := 0;
  v_admin_processed integer := 0;
  v_answers_candidates integer := 0;
  v_answers_processed integer := 0;
  v_workouts_candidates integer := 0;
  v_workouts_processed integer := 0;
  v_users_candidates integer := 0;
  v_users_processed integer := 0;
  v_consents_candidates integer := 0;
  v_consents_processed integer := 0;
begin
  select count(*) into v_content_candidates
  from public.content_recommendations
  where retention_hold = false
    and deleted_at is null
    and expires_at <= p_run_at;

  select count(*) into v_analytics_candidates
  from public.analytics_events
  where retention_hold = false
    and deleted_at is null
    and expires_at <= p_run_at;

  select count(*) into v_review_candidates
  from public.workout_review_requests
  where retention_hold = false
    and deleted_at is null
    and expires_at is not null
    and expires_at <= p_run_at
    and status in ('completed', 'cancelled', 'rejected');

  select count(*) into v_admin_candidates
  from public.admin_audit_logs
  where retention_hold = false
    and deleted_at is null
    and expires_at <= p_run_at;

  select count(*) into v_answers_candidates
  from public.user_answers
  where retention_hold = false
    and anonymized_at is null
    and deleted_at is not null
    and coalesce(expires_at, deleted_at + interval '30 days') <= p_run_at;

  select count(*) into v_workouts_candidates
  from public.workouts
  where retention_hold = false
    and anonymized_at is null
    and deleted_at is not null
    and coalesce(expires_at, deleted_at + interval '30 days') <= p_run_at;

  select count(*) into v_users_candidates
  from public.users
  where retention_hold = false
    and anonymized_at is null
    and deleted_at is not null
    and deleted_at <= p_run_at;

  select count(*) into v_consents_candidates
  from public.user_consents
  where retention_hold = false
    and deleted_at is not null
    and coalesce(expires_at, deleted_at + interval '30 days') <= p_run_at;

  if not p_dry_run then
    delete from public.content_recommendations
    where retention_hold = false
      and deleted_at is null
      and expires_at <= p_run_at;
    get diagnostics v_content_processed = row_count;

    delete from public.analytics_events
    where retention_hold = false
      and deleted_at is null
      and expires_at <= p_run_at;
    get diagnostics v_analytics_processed = row_count;

    delete from public.workout_review_requests
    where retention_hold = false
      and deleted_at is null
      and expires_at is not null
      and expires_at <= p_run_at
      and status in ('completed', 'cancelled', 'rejected');
    get diagnostics v_review_processed = row_count;

    delete from public.admin_audit_logs
    where retention_hold = false
      and deleted_at is null
      and expires_at <= p_run_at;
    get diagnostics v_admin_processed = row_count;

    update public.user_answers
    set answers = '{}'::jsonb,
        anonymized_at = p_run_at
    where retention_hold = false
      and anonymized_at is null
      and deleted_at is not null
      and coalesce(expires_at, deleted_at + interval '30 days') <= p_run_at;
    get diagnostics v_answers_processed = row_count;

    update public.workouts
    set exercises = '[]'::jsonb,
        hash = null,
        anonymized_at = p_run_at
    where retention_hold = false
      and anonymized_at is null
      and deleted_at is not null
      and coalesce(expires_at, deleted_at + interval '30 days') <= p_run_at;
    get diagnostics v_workouts_processed = row_count;

    update public.users
    set name = 'Conta removida',
        anonymized_at = p_run_at
    where retention_hold = false
      and anonymized_at is null
      and deleted_at is not null
      and deleted_at <= p_run_at;
    get diagnostics v_users_processed = row_count;

    delete from public.user_consents
    where retention_hold = false
      and deleted_at is not null
      and coalesce(expires_at, deleted_at + interval '30 days') <= p_run_at;
    get diagnostics v_consents_processed = row_count;
  else
    v_content_processed := v_content_candidates;
    v_analytics_processed := v_analytics_candidates;
    v_review_processed := v_review_candidates;
    v_admin_processed := v_admin_candidates;
    v_answers_processed := v_answers_candidates;
    v_workouts_processed := v_workouts_candidates;
    v_users_processed := v_users_candidates;
    v_consents_processed := v_consents_candidates;
  end if;

  return jsonb_build_object(
    'runAt', p_run_at,
    'dryRun', p_dry_run,
    'summary', jsonb_build_object(
      'content_recommendations', jsonb_build_object('strategy', 'delete', 'eligible', v_content_candidates, 'processed', v_content_processed),
      'analytics_events', jsonb_build_object('strategy', 'delete', 'eligible', v_analytics_candidates, 'processed', v_analytics_processed),
      'workout_review_requests', jsonb_build_object('strategy', 'delete', 'eligible', v_review_candidates, 'processed', v_review_processed),
      'admin_audit_logs', jsonb_build_object('strategy', 'delete', 'eligible', v_admin_candidates, 'processed', v_admin_processed),
      'user_answers', jsonb_build_object('strategy', 'anonymize', 'eligible', v_answers_candidates, 'processed', v_answers_processed),
      'workouts', jsonb_build_object('strategy', 'anonymize', 'eligible', v_workouts_candidates, 'processed', v_workouts_processed),
      'users', jsonb_build_object('strategy', 'anonymize', 'eligible', v_users_candidates, 'processed', v_users_processed),
      'user_consents', jsonb_build_object('strategy', 'delete_when_marked', 'eligible', v_consents_candidates, 'processed', v_consents_processed)
    )
  );
end;
$$;

revoke all on function public.run_retention_cleanup(timestamptz, boolean) from public;
revoke all on function public.run_retention_cleanup(timestamptz, boolean) from anon;
revoke all on function public.run_retention_cleanup(timestamptz, boolean) from authenticated;
grant execute on function public.run_retention_cleanup(timestamptz, boolean) to service_role;

notify pgrst, 'reload schema';
