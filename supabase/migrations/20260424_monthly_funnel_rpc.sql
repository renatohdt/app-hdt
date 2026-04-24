-- Função que agrega o funil mensal diretamente no banco de dados.
-- Motivo: o PostgREST do Supabase tem um max_rows padrão de 1000 linhas por query.
-- Com ~8000+ eventos/mês, queries via JS client (supabase.from().select()) ficam
-- truncadas, causando dados errados no CSV de métricas.
-- Chamadas via .rpc() não sofrem essa limitação de linhas.

CREATE OR REPLACE FUNCTION get_monthly_funnel_data(p_month_start timestamptz)
RETURNS TABLE (
  day_brt       date,
  home_count    bigint,
  quiz_count    bigint,
  signup_count  bigint,
  premium_count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH days AS (
    -- Dias com eventos
    SELECT DISTINCT
      (created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day_brt
    FROM analytics_events
    WHERE deleted_at IS NULL
      AND created_at >= p_month_start
    UNION
    -- Dias com novos usuários (cobre edge case de cadastros sem eventos de topo de funil)
    SELECT DISTINCT
      (created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day_brt
    FROM users
    WHERE deleted_at IS NULL
      AND created_at >= p_month_start
  ),
  event_counts AS (
    SELECT
      (created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day_brt,
      COUNT(DISTINCT CASE WHEN event_name IN ('home_view', 'page_view')
        THEN COALESCE(user_id::text, visitor_id) END) AS home_count,
      COUNT(DISTINCT CASE WHEN event_name IN ('quiz_started', 'quiz_start')
        THEN COALESCE(user_id::text, visitor_id) END) AS quiz_count,
      COUNT(DISTINCT CASE WHEN event_name IN ('signup', 'sign_up', 'quiz_completed')
        THEN COALESCE(user_id::text, visitor_id) END) AS signup_count,
      COUNT(DISTINCT CASE WHEN event_name IN ('premium_page_view', 'checkout_started')
        THEN COALESCE(user_id::text, visitor_id) END) AS premium_count
    FROM analytics_events
    WHERE deleted_at IS NULL
      AND created_at >= p_month_start
    GROUP BY (created_at AT TIME ZONE 'America/Sao_Paulo')::date
  )
  SELECT
    d.day_brt,
    COALESCE(e.home_count, 0)    AS home_count,
    COALESCE(e.quiz_count, 0)    AS quiz_count,
    COALESCE(e.signup_count, 0)  AS signup_count,
    COALESCE(e.premium_count, 0) AS premium_count
  FROM days d
  LEFT JOIN event_counts e ON d.day_brt = e.day_brt
  ORDER BY d.day_brt;
$$;
