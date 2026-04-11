alter table public.workout_session_logs
  add column if not exists plan_cycle_id text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workout_session_logs_plan_cycle_id_check'
  ) then
    alter table public.workout_session_logs
      add constraint workout_session_logs_plan_cycle_id_check
      check (plan_cycle_id is null or btrim(plan_cycle_id) <> '');
  end if;
end
$$;

drop index if exists workout_session_logs_unique_cycle_session_idx;
drop index if exists workout_session_logs_workout_cycle_idx;

create unique index if not exists workout_session_logs_unique_plan_cycle_session_idx
  on public.workout_session_logs(workout_id, plan_cycle_id, session_number)
  where plan_cycle_id is not null;

create unique index if not exists workout_session_logs_unique_legacy_cycle_session_idx
  on public.workout_session_logs(workout_id, coalesce(workout_hash, ''), session_number)
  where plan_cycle_id is null;

create index if not exists workout_session_logs_workout_plan_cycle_idx
  on public.workout_session_logs(workout_id, plan_cycle_id, completed_at desc)
  where plan_cycle_id is not null;

create index if not exists workout_session_logs_workout_hash_cycle_idx
  on public.workout_session_logs(workout_id, workout_hash, completed_at desc)
  where plan_cycle_id is null and workout_hash is not null;

create index if not exists workout_session_logs_workout_completed_at_idx
  on public.workout_session_logs(workout_id, completed_at desc);

with source as (
  select
    w.id,
    w.hash,
    coalesce(nullif(w.exercises->>'planCycleId', ''), null) as existing_plan_cycle_id,
    greatest(
      1,
      least(
        7,
        coalesce(
          nullif(ua.answers->>'days', '')::integer,
          nullif(w.exercises->>'sessionCount', '')::integer,
          case
            when jsonb_typeof(w.exercises->'sections') = 'array' then jsonb_array_length(w.exercises->'sections')
            else 1
          end,
          1
        )
      )
    ) as weekly_frequency,
    coalesce(nullif(ua.answers->>'goal', ''), 'lose_weight') as goal,
    coalesce(nullif(ua.answers->>'experience', ''), 'no_training') as experience
  from public.workouts w
  left join public.user_answers ua
    on ua.user_id = w.user_id
),
computed as (
  select
    source.*,
    case
      when source.experience = '6_to_12_months' then 'intermediate'
      when source.experience = 'gt_1_year' then 'advanced'
      else 'beginner'
    end as experience_band,
    case
      when source.experience = '6_to_12_months' then 3
      when source.experience = 'gt_1_year' then 2
      else 4
    end as min_weeks,
    case
      when source.experience = '6_to_12_months' then 5
      when source.experience = 'gt_1_year' then 4
      else 6
    end as max_weeks,
    case
      when source.experience = '6_to_12_months' then
        case
          when source.weekly_frequency <= 2 then 5
          when source.weekly_frequency >= 5 then 3
          else 4
        end
      when source.experience = 'gt_1_year' then
        case
          when source.weekly_frequency <= 2 then 4
          when source.weekly_frequency >= 5 then 2
          else 3
        end
      else
        case
          when source.weekly_frequency <= 2 then 6
          when source.weekly_frequency >= 5 then 4
          else 5
        end
    end as base_weeks,
    case
      when source.goal = 'gain_muscle' and source.weekly_frequency <= 3 then 1
      when source.goal = 'improve_conditioning' and source.weekly_frequency >= 4 then -1
      when source.goal = 'lose_weight' and source.weekly_frequency >= 5 then -1
      else 0
    end as goal_delta
  from source
),
prepared as (
  select
    computed.id,
    computed.hash,
    computed.weekly_frequency,
    computed.goal,
    computed.experience_band,
    greatest(computed.min_weeks, least(computed.max_weeks, computed.base_weeks + computed.goal_delta)) as block_duration_weeks,
    coalesce(computed.existing_plan_cycle_id, case when computed.hash is not null then gen_random_uuid()::text else null end) as plan_cycle_id
  from computed
),
finalized as (
  select
    prepared.*,
    least(24, greatest(8, prepared.weekly_frequency * prepared.block_duration_weeks)) as total_sessions,
    prepared.weekly_frequency * prepared.block_duration_weeks as raw_total_sessions,
    format(
      'Frequencia semanal de %s treino(s), nivel %s e objetivo %s definem bloco de %s semana(s). Total do plano: %s x %s = %s%s',
      prepared.weekly_frequency,
      case
        when prepared.experience_band = 'intermediate' then 'intermediario'
        when prepared.experience_band = 'advanced' then 'avancado'
        else 'iniciante'
      end,
      case
        when prepared.goal = 'gain_muscle' then 'hipertrofia'
        when prepared.goal = 'body_recomposition' then 'recomposicao corporal'
        when prepared.goal = 'improve_conditioning' then 'condicionamento'
        else 'emagrecimento'
      end,
      prepared.block_duration_weeks,
      prepared.weekly_frequency,
      prepared.block_duration_weeks,
      prepared.weekly_frequency * prepared.block_duration_weeks,
      case
        when prepared.weekly_frequency * prepared.block_duration_weeks = least(24, greatest(8, prepared.weekly_frequency * prepared.block_duration_weeks))
          then '.'
        when least(24, greatest(8, prepared.weekly_frequency * prepared.block_duration_weeks)) = 8
          then ', ajustado para 8 pelo minimo de sessoes.'
        else ', ajustado para 24 pelo maximo de sessoes.'
      end
    ) as session_strategy_reason
  from prepared
)
update public.workouts w
set total_sessions = finalized.total_sessions,
    exercises = case
      when finalized.plan_cycle_id is null then
        jsonb_set(
          jsonb_set(
            jsonb_set(coalesce(w.exercises, '{}'::jsonb), '{blockDurationWeeks}', to_jsonb(finalized.block_duration_weeks), true),
            '{totalSessions}',
            to_jsonb(finalized.total_sessions),
            true
          ),
          '{sessionStrategyReason}',
          to_jsonb(finalized.session_strategy_reason),
          true
        )
      else
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(coalesce(w.exercises, '{}'::jsonb), '{blockDurationWeeks}', to_jsonb(finalized.block_duration_weeks), true),
              '{totalSessions}',
              to_jsonb(finalized.total_sessions),
              true
            ),
            '{sessionStrategyReason}',
            to_jsonb(finalized.session_strategy_reason),
            true
          ),
          '{planCycleId}',
          to_jsonb(finalized.plan_cycle_id),
          true
        )
    end
from finalized
where finalized.id = w.id;

with current_cycles as (
  select
    w.id as workout_id,
    w.hash,
    nullif(w.exercises->>'planCycleId', '') as plan_cycle_id
  from public.workouts w
  where w.hash is not null
    and nullif(w.exercises->>'planCycleId', '') is not null
)
update public.workout_session_logs l
set plan_cycle_id = current_cycles.plan_cycle_id
from current_cycles
where l.workout_id = current_cycles.workout_id
  and l.plan_cycle_id is null
  and l.workout_hash = current_cycles.hash;
