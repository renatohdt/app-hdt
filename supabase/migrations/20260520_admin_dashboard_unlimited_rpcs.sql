-- Função 1: retorna todos os user_answers como JSON.
-- Motivo: queries via .select() sofrem o limite padrão de 1000 linhas do PostgREST.
-- Chamadas via .rpc() retornam um único valor JSON e não sofrem essa limitação,
-- garantindo que 100% dos registros sejam considerados nos gráficos de distribuição.
CREATE OR REPLACE FUNCTION get_all_user_answers()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    json_agg(
      json_build_object(
        'user_id',    user_id,
        'answers',    answers,
        'created_at', created_at
      )
      ORDER BY created_at DESC
    ),
    '[]'::json
  )
  FROM user_answers
  WHERE deleted_at IS NULL;
$$;

-- Função 2: contagens distintas de feature usage diretamente no banco.
-- Elimina 3 queries separadas que também sofriam com o limite de 1000 linhas,
-- e garante contagem de user_id DISTINCT sem precisar baixar todas as linhas.
CREATE OR REPLACE FUNCTION get_feature_usage_counts()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'users_with_replacement', (
      SELECT COUNT(DISTINCT user_id)
      FROM workout_exercise_replacements
    ),
    'users_with_completed_session', (
      SELECT COUNT(DISTINCT user_id)
      FROM workout_session_logs
      WHERE status = 'completed'
    ),
    'users_with_new_workout', (
      SELECT COUNT(DISTINCT user_id)
      FROM analytics_events
      WHERE event_name = 'workout_generated'
        AND metadata->>'source' = 'profile_regenerate'
        AND deleted_at IS NULL
    )
  );
$$;
