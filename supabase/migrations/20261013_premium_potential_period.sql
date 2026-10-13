-- Lista "Potencial Premium" do admin (13/out/2026)
--
-- O que muda:
-- 1) Aceita um período em dias (p_days). Com p_days = 30, conta só os treinos
--    concluídos nos últimos 30 dias. Com p_days = null, conta o histórico todo
--    (comportamento antigo).
-- 2) Deixa de fora quem JÁ é Premium por outros caminhos além do Stripe:
--    - assinatura das lojas (App Store / Google Play) -> users.apple_premium_expires_at
--    - Premium ganho no Indique e Ganhe               -> users.referral_premium_until
--    e também contas excluídas (users.deleted_at).
-- 3) Devolve também o total de treinos da vida (total_sessions).

drop function if exists public.get_premium_potential_users();

create or replace function public.get_premium_potential_users(p_days integer default null)
returns json
language sql
stable
set search_path = public
as $$
  select coalesce(
    json_agg(
      json_build_object(
        'user_id',         s.user_id,
        'session_count',   s.sessions,
        'total_sessions',  s.total,
        'last_workout_at', s.last_at
      )
      order by s.sessions desc, s.last_at desc
    ),
    '[]'::json
  )
  from (
    select
      user_id,
      count(*) filter (
        where p_days is null
           or completed_at >= now() - make_interval(days => p_days)
      )                 as sessions,
      count(*)          as total,
      max(completed_at) as last_at
    from workout_session_logs
    where status = 'completed'
    group by user_id
  ) s
  join users u on u.id = s.user_id
  where s.sessions >= 5
    and u.deleted_at is null
    and (u.apple_premium_expires_at is null or u.apple_premium_expires_at <= now())
    and (u.referral_premium_until  is null or u.referral_premium_until  <= now())
    and not exists (
      select 1 from subscriptions sub
      where sub.user_id = s.user_id
        and sub.status in ('active', 'past_due')
    );
$$;

revoke execute on function public.get_premium_potential_users(integer) from public, anon, authenticated;
grant  execute on function public.get_premium_potential_users(integer) to service_role;

-- O número grande do card "Usuários free com potencial premium" (dashboard do admin)
-- passa a usar a mesma regra da lista: 5+ treinos nos ÚLTIMOS 30 DIAS e sem Premium
-- (Stripe, lojas ou Indique e Ganhe). Os demais contadores ficam iguais.
create or replace function public.get_feature_usage_counts()
returns json
language sql
stable
set search_path = public
as $$
  select json_build_object(
    'users_with_replacement', (
      select count(distinct user_id)
      from workout_exercise_replacements
    ),
    'users_with_completed_session', (
      select count(distinct user_id)
      from workout_session_logs
      where status = 'completed'
    ),
    'users_with_new_workout', (
      select count(distinct user_id)
      from analytics_events
      where event_name = 'workout_generated'
        and metadata->>'source' = 'profile_regenerate'
        and deleted_at is null
    ),
    'users_with_extra_workout', (
      select count(distinct user_id)
      from workouts
      where type = 'extra'
        and deleted_at is null
    ),
    'users_with_goals', (
      select count(distinct user_id)
      from user_goals
    ),
    'users_registered_via_referral', (
      select count(distinct referred_user_id)
      from referral_uses
    ),
    'premium_potential_count', (
      select json_array_length(public.get_premium_potential_users(30))
    )
  );
$$;

revoke execute on function public.get_feature_usage_counts() from public, anon, authenticated;
grant  execute on function public.get_feature_usage_counts() to service_role;
