-- Tabela de metas pessoais do usuario
CREATE TABLE public.user_goals (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_count  INT         NOT NULL CHECK (target_count > 0),
  period_days   INT         NOT NULL CHECK (period_days > 0),
  starts_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at       TIMESTAMPTZ NOT NULL,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indice para buscar metas ativas por usuario rapidamente
CREATE INDEX idx_user_goals_user_id ON public.user_goals (user_id, created_at DESC);

-- Row Level Security
ALTER TABLE public.user_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_own_goals"
  ON public.user_goals
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
