// Abas de treino (A, B, C...) fora do treino do dia — plano free no app (AdMob).
// Assistir um vídeo libera TODAS as abas por 24 horas neste aparelho.

const UNLOCK_KEY_PREFIX = "hdt_workout_tabs_unlock_";
export const WORKOUT_TABS_UNLOCK_MS = 24 * 60 * 60 * 1000;

export function isWorkoutTabsUnlocked(userId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(UNLOCK_KEY_PREFIX + userId);
    const at = raw ? Number(raw) : 0;
    return Number.isFinite(at) && at > 0 && Date.now() - at < WORKOUT_TABS_UNLOCK_MS;
  } catch {
    return false;
  }
}

export function unlockWorkoutTabs(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(UNLOCK_KEY_PREFIX + userId, String(Date.now()));
  } catch {
    // sem armazenamento: libera só esta troca de aba
  }
}
