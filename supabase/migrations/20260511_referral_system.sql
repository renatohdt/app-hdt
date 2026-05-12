-- ─── Tabela: referral_codes ───────────────────────────────────────────────────
-- Cada usuário tem no máximo um código de indicação.
CREATE TABLE IF NOT EXISTS public.referral_codes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code          TEXT NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;

-- Usuário pode ler o próprio código
CREATE POLICY "referral_codes_select_own"
  ON public.referral_codes FOR SELECT
  USING (auth.uid() = user_id);

-- Apenas service_role pode inserir (via API route)
CREATE POLICY "referral_codes_insert_service"
  ON public.referral_codes FOR INSERT
  WITH CHECK (FALSE); -- bloqueado para usuário direto; service_role bypassa RLS

-- ─── Tabela: referral_uses ────────────────────────────────────────────────────
-- Registra cada novo cadastro que usou um código de indicação.
CREATE TABLE IF NOT EXISTS public.referral_uses (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code              TEXT NOT NULL,
  referrer_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (referred_user_id) -- cada novo usuário só pode usar um código
);

ALTER TABLE public.referral_uses ENABLE ROW LEVEL SECURITY;

-- Usuário pode ver quantas indicações fez (linhas onde é o referrer)
CREATE POLICY "referral_uses_select_own"
  ON public.referral_uses FOR SELECT
  USING (auth.uid() = referrer_user_id);

-- ─── Campo na tabela de usuários ──────────────────────────────────────────────
-- Adiciona suporte a premium gratuito por indicação.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS referral_premium_until  TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS referral_rewarded_count INTEGER NOT NULL DEFAULT 0;
  -- referral_rewarded_count: quantas vezes já recebeu o prêmio (para evitar duplicatas)
