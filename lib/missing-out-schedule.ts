// Regras de quando mostrar o pop-up "o que você está perdendo" (plano free).
// - 1ª vez: a partir do 3º dia de uso. 2ª vez: a partir do 7º dia.
// - Depois: no máximo a cada 14 dias.
// - Nunca duas vezes em menos de 3 dias.
// Tudo guardado no próprio aparelho (localStorage), sem tocar no banco.

const DAY_MS = 24 * 60 * 60 * 1000;
const FIRST_SEEN_PREFIX = "hora-do-treino-first-seen";
const STATE_PREFIX = "hora-do-treino-missing-out";

type MissingOutState = { count: number; lastShownAt: number | null };

function readState(userId: string): MissingOutState {
  try {
    const raw = window.localStorage.getItem(`${STATE_PREFIX}:${userId}`);
    if (!raw) return { count: 0, lastShownAt: null };
    const parsed = JSON.parse(raw) as Partial<MissingOutState>;
    return { count: Number(parsed.count) || 0, lastShownAt: parsed.lastShownAt ?? null };
  } catch {
    return { count: 0, lastShownAt: null };
  }
}

// Primeiro dia de uso: o mais antigo entre o registro local e o 1º treino feito
// (assim quem já usa o app há semanas não precisa esperar mais 3 dias).
export function getFirstSeenAt(userId: string, earliestSessionAt: string | null, now = Date.now()) {
  let firstSeen = now;
  try {
    const key = `${FIRST_SEEN_PREFIX}:${userId}`;
    const stored = Number(window.localStorage.getItem(key));
    if (stored > 0) firstSeen = stored;
    else window.localStorage.setItem(key, String(now));
  } catch {
    // sem storage: usa só o histórico de treinos
  }
  const sessionTime = earliestSessionAt ? new Date(earliestSessionAt).getTime() : NaN;
  if (Number.isFinite(sessionTime) && sessionTime < firstSeen) firstSeen = sessionTime;
  return firstSeen;
}

export function shouldShowMissingOut(userId: string, firstSeenAt: number, now = Date.now()) {
  const { count, lastShownAt } = readState(userId);
  const daysUsing = (now - firstSeenAt) / DAY_MS;
  const daysSinceLast = lastShownAt ? (now - lastShownAt) / DAY_MS : Infinity;

  if (daysSinceLast < 3) return false;
  if (count === 0) return daysUsing >= 3;
  if (count === 1) return daysUsing >= 7;
  return daysSinceLast >= 14;
}

export function markMissingOutShown(userId: string, now = Date.now()) {
  try {
    const { count } = readState(userId);
    window.localStorage.setItem(`${STATE_PREFIX}:${userId}`, JSON.stringify({ count: count + 1, lastShownAt: now }));
  } catch {
    // ignora
  }
}

export function getDaysUsing(firstSeenAt: number, now = Date.now()) {
  return Math.max(1, Math.floor((now - firstSeenAt) / DAY_MS) + 1);
}
