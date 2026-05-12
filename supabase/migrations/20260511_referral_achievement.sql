-- Adiciona flag para controlar exibição do AchievementPopup de indicação.
-- Setado para true quando grantReferralPremium é chamado com sucesso.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS referral_achievement_unlocked BOOLEAN NOT NULL DEFAULT FALSE;
