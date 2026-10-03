// "Treino em andamento" — estado guardado no próprio aparelho (localStorage).
//
// Por que no aparelho e não só na memória da tela? Porque o iOS/Android
// congelam ou fecham o app quando ele vai para segundo plano. Guardando aqui,
// o treino sobrevive a isso e qualquer tela do app consegue saber que existe
// um treino aberto (pílula nas outras abas, pergunta dos 15 min e fechamento
// automático após 50 min sem atividade).
//
// Nada aqui chama a rede.

export const ACTIVE_WORKOUT_STORAGE_KEY = "hdt-active-workout";
export const ACTIVE_WORKOUT_EVENT = "hdt-active-workout-change";
/** Pedido para abrir a confirmação de finalizar (ex.: "Já terminei" na pergunta dos 15 min). */
export const REQUEST_FINISH_EVENT = "hdt-request-finish-workout";
/** Disparado depois que um treino é fechado automaticamente e registrado. */
export const AUTO_FINISHED_EVENT = "hdt-workout-auto-finished";
/** Abre a tela do Treino Extra (já existente no ExtraWorkoutButton). */
export const OPEN_EXTRA_WORKOUT_EVENT = "hdt-open-extra-workout";

export const WORKOUT_IDLE_PROMPT_MS = 15 * 60 * 1000;
export const WORKOUT_AUTO_FINISH_MS = 50 * 60 * 1000;

const EXERCISE_DRAFT_PREFIX = "hdt-exercise-draft:";

export type ActiveWorkoutSession = {
  v: 1;
  userId: string;
  /** "extra" = Treino Extra (tela própria); "regular" = treino do programa. */
  workoutType: "regular" | "extra";
  /** ID do treino extra (necessário para registrar a conclusão dele). */
  workoutId: string | null;
  workoutKey: string;
  workoutTitle: string;
  /** Rótulo do tempo estimado do treino (usado quando o tempo real é desconhecido). */
  estimatedLabel: string | null;
  startedAt: number;
  lastActivityAt: number;
  /** true depois que a pessoa marcou pelo menos uma série. */
  hadActivity: boolean;
  setsDone: number;
  setsTotal: number;
  exercisesDone: number;
  exercisesTotal: number;
  exercises: { id: string; name: string }[];
};

export type WorkoutEndReason = "manual" | "all_done" | "auto_idle";

export type WorkoutTimingPayload = {
  startedAt: string;
  endedAt: string;
  setsDone: number;
  setsTotal: number;
  hadActivity: boolean;
  endReason: WorkoutEndReason;
};

function hasWindow() {
  return typeof window !== "undefined";
}

function notifyChange() {
  if (!hasWindow()) return;
  window.dispatchEvent(new Event(ACTIVE_WORKOUT_EVENT));
}

export function readActiveWorkout(): ActiveWorkoutSession | null {
  if (!hasWindow()) return null;
  try {
    const raw = window.localStorage.getItem(ACTIVE_WORKOUT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ActiveWorkoutSession>;
    if (
      parsed?.v !== 1 ||
      typeof parsed.userId !== "string" ||
      typeof parsed.workoutKey !== "string" ||
      typeof parsed.startedAt !== "number" ||
      typeof parsed.lastActivityAt !== "number"
    ) {
      return null;
    }
    return {
      v: 1,
      userId: parsed.userId,
      workoutType: parsed.workoutType === "extra" ? "extra" : "regular",
      workoutId: typeof parsed.workoutId === "string" ? parsed.workoutId : null,
      workoutKey: parsed.workoutKey,
      workoutTitle: typeof parsed.workoutTitle === "string" ? parsed.workoutTitle : "Treino",
      estimatedLabel: typeof parsed.estimatedLabel === "string" ? parsed.estimatedLabel : null,
      startedAt: parsed.startedAt,
      lastActivityAt: parsed.lastActivityAt,
      hadActivity: parsed.hadActivity === true,
      setsDone: Number(parsed.setsDone) || 0,
      setsTotal: Number(parsed.setsTotal) || 0,
      exercisesDone: Number(parsed.exercisesDone) || 0,
      exercisesTotal: Number(parsed.exercisesTotal) || 0,
      exercises: Array.isArray(parsed.exercises) ? parsed.exercises : []
    };
  } catch {
    return null;
  }
}

export function writeActiveWorkout(session: ActiveWorkoutSession) {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(ACTIVE_WORKOUT_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // armazenamento cheio/bloqueado: segue sem persistir
  }
  notifyChange();
}

export function clearActiveWorkout() {
  if (!hasWindow()) return;
  try {
    window.localStorage.removeItem(ACTIVE_WORKOUT_STORAGE_KEY);
  } catch {
    // ignora
  }
  notifyChange();
}

/** Escuta mudanças no treino ativo (nesta aba e em outras). Retorna a função de cancelar. */
export function subscribeActiveWorkout(callback: () => void) {
  if (!hasWindow()) return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === ACTIVE_WORKOUT_STORAGE_KEY) callback();
  };
  window.addEventListener(ACTIVE_WORKOUT_EVENT, callback);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(ACTIVE_WORKOUT_EVENT, callback);
    window.removeEventListener("storage", onStorage);
  };
}

export function isAutoFinishDue(session: ActiveWorkoutSession, now = Date.now()) {
  return now - session.lastActivityAt >= WORKOUT_AUTO_FINISH_MS;
}

export function isIdlePromptDue(session: ActiveWorkoutSession, now = Date.now()) {
  const idle = now - session.lastActivityAt;
  return idle >= WORKOUT_IDLE_PROMPT_MS && idle < WORKOUT_AUTO_FINISH_MS;
}

export function buildTimingPayload(
  session: ActiveWorkoutSession,
  endReason: WorkoutEndReason,
  now = Date.now()
): WorkoutTimingPayload {
  // No fechamento automático o fim é a ÚLTIMA atividade, não "agora":
  // senão um treino de 40 min viraria um de 3 horas.
  const endedAt = endReason === "auto_idle" ? session.lastActivityAt : now;
  return {
    startedAt: new Date(session.startedAt).toISOString(),
    endedAt: new Date(Math.max(endedAt, session.startedAt)).toISOString(),
    setsDone: session.setsDone,
    setsTotal: session.setsTotal,
    hadActivity: session.hadActivity,
    endReason
  };
}

/** Duração em segundos que será mostrada ao usuário (null = desconhecida). */
export function getSessionDurationSeconds(session: ActiveWorkoutSession, endReason: WorkoutEndReason, now = Date.now()) {
  if (endReason === "auto_idle" && !session.hadActivity) return null;
  const end = endReason === "auto_idle" ? session.lastActivityAt : now;
  return Math.max(0, Math.round((end - session.startedAt) / 1000));
}

export function formatElapsedClock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function formatDurationMinutes(seconds: number | null, fallback: string | null = null) {
  if (seconds === null) return fallback ? `~${fallback}` : "—";
  if (seconds < 60) return "<1 min";
  return `${Math.round(seconds / 60)} min`;
}

// ── Rascunhos de execução (séries marcadas, cargas) ─────────────────────────
// Antes ficavam no sessionStorage, que some quando o sistema fecha o app.
// Agora ficam no localStorage; o sessionStorage ainda é lido como fallback
// para não perder o que já estava marcado na hora da atualização.

export function exerciseDraftKey(userId: string, workoutKey: string, exerciseId: string) {
  return `${EXERCISE_DRAFT_PREFIX}${userId}:${workoutKey}:${exerciseId}`;
}

export function readExerciseDraftRaw(key: string): string | null {
  if (!hasWindow()) return null;
  try {
    return window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeExerciseDraftRaw(key: string, value: string) {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(key, value);
    window.sessionStorage.removeItem(key);
  } catch {
    try {
      window.sessionStorage.setItem(key, value);
    } catch {
      // ignora
    }
  }
}

export function removeExerciseDraftRaw(key: string) {
  if (!hasWindow()) return;
  try {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  } catch {
    // ignora
  }
}

/** Apaga os rascunhos de um treino (depois de finalizado), para não reaparecerem marcados. */
export function clearExerciseDrafts(userId: string, workoutKey: string) {
  if (!hasWindow()) return;
  const prefix = `${EXERCISE_DRAFT_PREFIX}${userId}:${workoutKey}:`;
  for (const storage of [window.localStorage, window.sessionStorage]) {
    try {
      const keys: string[] = [];
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (key?.startsWith(prefix)) keys.push(key);
      }
      keys.forEach((key) => storage.removeItem(key));
    } catch {
      // ignora
    }
  }
}

export type ExerciseWeightPayload = {
  exerciseName: string;
  sets: { setNumber: number; weightKg: string; reps: string; completed: boolean }[];
};

/** Monta as cargas registradas a partir dos rascunhos (mesmo formato da API de conclusão). */
export function collectWeightsFromDrafts(
  userId: string,
  workoutKey: string,
  exercises: { id: string; name: string }[]
): ExerciseWeightPayload[] {
  return exercises.flatMap((exercise) => {
    const raw = readExerciseDraftRaw(exerciseDraftKey(userId, workoutKey, exercise.id));
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as {
        setEntries?: { weightKg?: string; reps?: string; completed?: boolean }[];
      };
      const sets = Array.isArray(parsed.setEntries) ? parsed.setEntries : [];
      if (!sets.length) return [];
      return [
        {
          exerciseName: exercise.name,
          sets: sets.map((s, i) => ({
            setNumber: i + 1,
            weightKg: s.weightKg ?? "",
            reps: s.reps ?? "",
            completed: s.completed ?? false
          }))
        }
      ];
    } catch {
      return [];
    }
  });
}

/** Mantém a tela acesa durante o treino (quando o aparelho permite). */
export async function requestScreenWakeLock(): Promise<{ release: () => Promise<void> } | null> {
  if (!hasWindow()) return null;
  const nav = navigator as Navigator & {
    wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
  };
  if (!nav.wakeLock?.request) return null;
  try {
    return await nav.wakeLock.request("screen");
  } catch {
    return null;
  }
}

// ── Regra de 1 treino por dia (programa OU extra) ───────────────────────────
// O banco já recusa um segundo registro no mesmo dia (fuso de São Paulo).
// Guardamos no aparelho o dia do último treino concluído para avisar ANTES de
// começar — inclusive logo após concluir um extra, antes de a tela recarregar.

const LAST_TRAINED_DAY_KEY = "hdt-last-trained-day";

export function saoPauloDayKey(at: number = Date.now()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(at));
}

export function markTrainedToday(userId: string, at: number = Date.now()) {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(LAST_TRAINED_DAY_KEY, JSON.stringify({ userId, day: saoPauloDayKey(at) }));
  } catch {
    // ignora
  }
}

export function hasTrainedTodayLocally(userId: string) {
  if (!hasWindow()) return false;
  try {
    const raw = window.localStorage.getItem(LAST_TRAINED_DAY_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { userId?: string; day?: string };
    return parsed.userId === userId && parsed.day === saoPauloDayKey();
  } catch {
    return false;
  }
}
