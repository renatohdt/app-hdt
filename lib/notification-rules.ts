// Regras das notificações AUTOMÁTICAS (funções puras, sem banco).
// Usadas pelo motor (lib/notification-engine.ts), que roda de hora em hora.
//
// Tudo é calculado no horário de São Paulo. Dias da semana no padrão do app:
// 0 = segunda … 6 = domingo.

export const SP_TIMEZONE = "America/Sao_Paulo";

// Engajamento só entre 8h e 20h59 (silêncio das 21h às 8h).
export const QUIET_END_HOUR = 8; // primeiro horário permitido
export const QUIET_START_HOUR = 21; // a partir daqui, silêncio
export const LAST_ALLOWED_HOUR = QUIET_START_HOUR - 1; // 20h

// Limites de engajamento (avisos de conta NÃO contam).
export const ENGAGEMENT_MAX_PER_DAY = 1;
export const ENGAGEMENT_MAX_PER_WEEK = 3;

// "Treino do dia": quanto tempo antes do horário habitual.
export const REMINDER_LEAD_MINUTES = 60;
// Só manda "treino do dia" para quem treinou nos últimos X dias
// (quem parou recebe a escada de "dias sem treinar").
export const ACTIVE_WINDOW_DAYS = 14;

// Mesma regra da gamificação: com 14 dias sem treinar começa a perder XP.
export const XP_WARNING_DAY = 13;
export const INACTIVITY_LAST_DAY = 30;

export const MEASUREMENTS_INTERVAL_DAYS = 30;

// Mesma distribuição padrão da agenda do app (lib/app-workout.ts).
const DEFAULT_WEEKDAYS: Record<number, number[]> = {
  1: [1],
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 2, 4, 5],
  5: [0, 1, 3, 4, 5],
  6: [0, 1, 2, 3, 4, 5],
  7: [0, 1, 2, 3, 4, 5, 6]
};

// ── Datas em São Paulo ───────────────────────────────────────────────────────

export type SpClock = {
  dateKey: string; // YYYY-MM-DD
  hour: number;
  minutes: number; // minutos desde 00:00
  weekday: number; // 0 = seg … 6 = dom
};

export function spClock(date: Date): SpClock {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short"
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));
  const weekdayMap: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  return {
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
    hour,
    minutes: hour * 60 + minute,
    weekday: weekdayMap[get("weekday")] ?? 0
  };
}

function keyToUtc(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
}

/** Dias corridos entre duas datas YYYY-MM-DD (b - a). */
export function daysBetween(a: string, b: string) {
  return Math.round((keyToUtc(b) - keyToUtc(a)) / 86_400_000);
}

export function addDays(dateKey: string, days: number) {
  return new Date(keyToUtc(dateKey) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Dia da semana (0 = seg) de uma data YYYY-MM-DD. */
export function weekdayOf(dateKey: string) {
  const js = new Date(keyToUtc(dateKey)).getUTCDay(); // 0 = dom
  return (js + 6) % 7;
}

/** Domingo que abre a semana da data (semana do app = domingo a sábado). */
export function sundayOfWeek(dateKey: string) {
  const js = new Date(keyToUtc(dateKey)).getUTCDay();
  return addDays(dateKey, -js);
}

// ── Sessões de treino ────────────────────────────────────────────────────────

export type SessionRow = {
  completed_at: string;
  completed_day_sp: string | null;
  started_at: string | null;
  duration_seconds: number | null;
  end_reason: string | null;
  timing_reliable: boolean | null;
};

export function sessionDay(row: SessionRow) {
  return row.completed_day_sp ?? spClock(new Date(row.completed_at)).dateKey;
}

/**
 * Horário em que a pessoa costuma COMEÇAR a treinar (minutos desde 00:00, SP).
 * Mediana das últimas 10 sessões. Usa o início real quando existe; senão,
 * estima pelo fim − duração (ou fim − 45 min). Sessões finalizadas
 * automaticamente sem início registrado são ignoradas (o "fim" delas é a hora em
 * que o app foi reaberto, não a hora do treino).
 */
export function habitualStartMinutes(rows: SessionRow[]): number | null {
  const samples: number[] = [];
  const sorted = [...rows].sort((a, b) => b.completed_at.localeCompare(a.completed_at));
  for (const row of sorted) {
    if (samples.length >= 10) break;
    let start: Date | null = null;
    if (row.started_at && row.timing_reliable !== false) {
      start = new Date(row.started_at);
    } else if (row.end_reason !== "auto_idle") {
      const durationMs = (row.duration_seconds && row.duration_seconds > 0 ? row.duration_seconds : 45 * 60) * 1000;
      start = new Date(new Date(row.completed_at).getTime() - durationMs);
    }
    if (start && !Number.isNaN(start.getTime())) samples.push(spClock(start).minutes);
  }
  if (samples.length === 0) return null;
  samples.sort((a, b) => a - b);
  const mid = Math.floor(samples.length / 2);
  return samples.length % 2 ? samples[mid] : Math.round((samples[mid - 1] + samples[mid]) / 2);
}

export type ReminderSlot =
  | { kind: "same_day"; hour: number }
  // Quem treina antes das 9h recebe na véspera, às 20h (não acordamos ninguém).
  | { kind: "evening_before"; hour: number };

/** Em que hora mandar o "treino do dia" para quem começa a treinar em `habitMinutes`. */
export function reminderSlot(habitMinutes: number): ReminderSlot {
  const target = habitMinutes - REMINDER_LEAD_MINUTES;
  if (target < QUIET_END_HOUR * 60) return { kind: "evening_before", hour: LAST_ALLOWED_HOUR };
  return { kind: "same_day", hour: Math.min(Math.floor(target / 60), LAST_ALLOWED_HOUR) };
}

/** Hora para mensagens "sem dia certo" (inatividade): perto do horário habitual, dentro da janela. */
export function engagementHour(habitMinutes: number | null, fallbackHour = 18) {
  if (habitMinutes === null) return fallbackHour;
  const target = Math.floor((habitMinutes - REMINDER_LEAD_MINUTES) / 60);
  return Math.min(Math.max(target, QUIET_END_HOUR), LAST_ALLOWED_HOUR);
}

/**
 * Quantas vezes por semana a pessoa REALMENTE treina: treinos nas 4 semanas
 * que TERMINAM no último treino (assim, quem parou não "perde" a frequência
 * enquanto está parado). Com menos de 3 treinos, usa a meta do questionário.
 */
export function weeklyFrequency(dayKeys: string[], lastDay: string, quizDays: number | null) {
  const from = addDays(lastDay, -27);
  const count = dayKeys.filter((d) => d >= from && d <= lastDay).length;
  if (count >= 3) return clamp(Math.round(count / 4), 1, 7);
  return clamp(quizDays ?? 3, 1, 7);
}

/**
 * Em quais dias sem treinar mandar o lembrete, conforme a frequência semanal.
 * O 1º só sai quando a pessoa já passou do intervalo normal dela + 2 dias:
 *   1x/semana → 9, 13, 30 · 2x → 6, 10, 13, 30 · 3x → 5, 9, 13, 30 · 4x+ → 4, 8, 13, 30
 * (13 = véspera do XP começar a cair; 30 = último, depois disso para.)
 */
export function inactivityLevels(frequency: number) {
  const base = Math.ceil(7 / clamp(frequency, 1, 7));
  const first = Math.max(3, base + 2);
  const levels = [first];
  if (first + 4 < XP_WARNING_DAY) levels.push(first + 4);
  if (XP_WARNING_DAY > first) levels.push(XP_WARNING_DAY);
  levels.push(INACTIVITY_LAST_DAY);
  return levels;
}

/** Nível da escada que vale hoje (o maior já alcançado), ou null. */
export function currentInactivityLevel(daysSince: number, frequency: number) {
  const levels = inactivityLevels(frequency);
  let current: number | null = null;
  for (const level of levels) if (daysSince >= level) current = level;
  // Se o lembrete ficou muito para trás (ex.: cron parado), não manda atrasado.
  if (current === null || daysSince - current > 3) return null;
  return { level: current, index: levels.indexOf(current), total: levels.length };
}

/**
 * Dias de treino da pessoa:
 *  1) Premium com "Minha semana" → os dias escolhidos;
 *  2) histórico → dias da semana em que treinou 2+ vezes nas últimas 6 semanas;
 *  3) senão → agenda padrão do app para a meta semanal.
 */
export function trainingWeekdays(input: {
  chosenDays: number[] | null;
  dayKeys: string[];
  todayKey: string;
  quizDays: number | null;
}) {
  if (input.chosenDays && input.chosenDays.length > 0) return input.chosenDays;
  const from = addDays(input.todayKey, -42);
  const recent = input.dayKeys.filter((d) => d >= from && d < input.todayKey);
  if (recent.length >= 4) {
    const counts = new Map<number, number>();
    for (const d of recent) counts.set(weekdayOf(d), (counts.get(weekdayOf(d)) ?? 0) + 1);
    const habitual = [...counts.entries()].filter(([, n]) => n >= 2).map(([w]) => w);
    if (habitual.length > 0) return habitual.sort();
  }
  return DEFAULT_WEEKDAYS[clamp(input.quizDays ?? 3, 1, 7)];
}

export function parseWeekdays(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null;
  const days = raw.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6);
  return days.length > 0 ? [...new Set(days)] : null;
}

export function parseQuizDays(raw: unknown): number | null {
  const n = typeof raw === "string" ? Number(raw) : raw;
  return typeof n === "number" && Number.isFinite(n) ? clamp(Math.round(n), 1, 7) : null;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

/** Índice estável (0..n-1) para variar o texto sem repetir sempre o mesmo. */
export function pickVariant(seed: string, n: number) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % Math.max(n, 1);
}
