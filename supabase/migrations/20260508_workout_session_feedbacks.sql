-- Migration: workout_session_feedbacks
-- Armazena o feedback do usuário sobre cada sessão de treino concluída.

CREATE TABLE public.workout_session_feedbacks (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_log_id   uuid        NOT NULL REFERENCES public.workout_session_logs(id) ON DELETE CASCADE,
  liked            boolean     NOT NULL,
  intensity_level  smallint    NOT NULL CHECK (intensity_level BETWEEN 1 AND 5),
  created_at       timestamptz NOT NULL DEFAULT now(),

  -- Um session_log pode ter no máximo um feedback
  CONSTRAINT workout_session_feedbacks_session_log_id_key UNIQUE (session_log_id)
);

-- Índices
CREATE INDEX workout_session_feedbacks_user_id_idx
  ON public.workout_session_feedbacks (user_id);

CREATE INDEX workout_session_feedbacks_session_log_id_idx
  ON public.workout_session_feedbacks (session_log_id);

CREATE INDEX workout_session_feedbacks_created_at_idx
  ON public.workout_session_feedbacks (created_at DESC);

-- RLS
ALTER TABLE public.workout_session_feedbacks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own feedbacks"
  ON public.workout_session_feedbacks
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can select own feedbacks"
  ON public.workout_session_feedbacks
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
