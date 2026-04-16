-- Tabela de registro de cargas por exercício
CREATE TABLE public.exercise_weight_logs (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  exercise_name          text        NOT NULL,
  exercise_name_normalized text      NOT NULL,
  workout_session_log_id uuid        REFERENCES public.workout_session_logs(id) ON DELETE SET NULL,
  max_weight_kg          numeric     NOT NULL,
  sets_data              jsonb       NOT NULL DEFAULT '[]',
  workout_key            text,
  completed_at           timestamptz NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now()
);

-- Índices para buscas frequentes
CREATE INDEX exercise_weight_logs_user_exercise_idx
  ON public.exercise_weight_logs (user_id, exercise_name_normalized, completed_at DESC);

CREATE INDEX exercise_weight_logs_user_completed_at_idx
  ON public.exercise_weight_logs (user_id, completed_at DESC);

-- RLS
ALTER TABLE public.exercise_weight_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own weight logs"
  ON public.exercise_weight_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own weight logs"
  ON public.exercise_weight_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own weight logs"
  ON public.exercise_weight_logs FOR DELETE
  USING (auth.uid() = user_id);
