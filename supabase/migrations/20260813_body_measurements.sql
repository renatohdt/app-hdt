-- Historico de medicoes corporais do usuario (evolucao).
-- Uma linha por coleta; todos os campos de medida sao opcionais (o usuario
-- preenche o que tiver). Usado nos graficos de evolucao e no calculo de
-- composicao corporal (% gordura US Navy) e zonas de FC (Karvonen).
CREATE TABLE public.body_measurements (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  measured_at    DATE         NOT NULL DEFAULT current_date,
  weight_kg      NUMERIC(5,2) CHECK (weight_kg     IS NULL OR (weight_kg     > 0   AND weight_kg     < 500)),
  body_fat_pct   NUMERIC(4,1) CHECK (body_fat_pct  IS NULL OR (body_fat_pct  >= 0  AND body_fat_pct  <= 75)),
  lean_mass_pct  NUMERIC(4,1) CHECK (lean_mass_pct IS NULL OR (lean_mass_pct >= 0  AND lean_mass_pct <= 100)),
  resting_hr     INT          CHECK (resting_hr    IS NULL OR (resting_hr    >= 30 AND resting_hr    <= 150)),
  neck_cm        NUMERIC(4,1) CHECK (neck_cm       IS NULL OR (neck_cm       > 0   AND neck_cm       < 100)),
  chest_cm       NUMERIC(5,1) CHECK (chest_cm      IS NULL OR (chest_cm      > 0   AND chest_cm      < 200)),
  waist_cm       NUMERIC(5,1) CHECK (waist_cm      IS NULL OR (waist_cm      > 0   AND waist_cm      < 200)),
  hip_cm         NUMERIC(5,1) CHECK (hip_cm        IS NULL OR (hip_cm        > 0   AND hip_cm        < 200)),
  arm_cm         NUMERIC(4,1) CHECK (arm_cm        IS NULL OR (arm_cm        > 0   AND arm_cm        < 100)),
  forearm_cm     NUMERIC(4,1) CHECK (forearm_cm    IS NULL OR (forearm_cm    > 0   AND forearm_cm    < 100)),
  thigh_cm       NUMERIC(4,1) CHECK (thigh_cm      IS NULL OR (thigh_cm      > 0   AND thigh_cm      < 120)),
  calf_cm        NUMERIC(4,1) CHECK (calf_cm       IS NULL OR (calf_cm       > 0   AND calf_cm       < 100)),
  notes          TEXT         CHECK (notes         IS NULL OR char_length(notes) <= 500),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Busca rapida do historico por usuario, do mais recente para o mais antigo.
CREATE INDEX idx_body_measurements_user ON public.body_measurements (user_id, measured_at DESC);

-- Row Level Security: cada usuario so acessa as proprias medicoes.
ALTER TABLE public.body_measurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_own_measurements"
  ON public.body_measurements
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
