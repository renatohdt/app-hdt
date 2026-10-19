import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logAndSend } from "@/lib/notify-user";
import { medidasText, semTreinarText, treinoAmanhaCedoText, treinoDoDiaText, type NotificationText } from "@/lib/notification-copy";
import {
  ACTIVE_WINDOW_DAYS,
  ENGAGEMENT_MAX_PER_DAY,
  ENGAGEMENT_MAX_PER_WEEK,
  LAST_ALLOWED_HOUR,
  MEASUREMENTS_INTERVAL_DAYS,
  QUIET_END_HOUR,
  addDays,
  currentInactivityLevel,
  daysBetween,
  engagementHour,
  habitualStartMinutes,
  parseQuizDays,
  parseWeekdays,
  reminderSlot,
  sessionDay,
  spClock,
  sundayOfWeek,
  trainingWeekdays,
  weekdayOf,
  weeklyFrequency,
  type SessionRow
} from "@/lib/notification-rules";

// ─────────────────────────────────────────────────────────────────────────────
// Motor das notificações de ENGAJAMENTO. Roda de hora em hora (cron).
//
// Para cada pessoa com notificação ativa (algum aparelho registrado), decide no
// máximo UMA mensagem por execução, nesta prioridade:
//   1) Dias sem treinar (escada conforme a frequência semanal dela)
//   2) Treino do dia (perto do horário em que ela costuma treinar)
//   3) Medidas do mês (só em dia de descanso, às 10h)
//
// Regras: silêncio das 21h às 8h · máx. 1 por dia e 3 por semana · nada para quem
// já treinou hoje. Avisos de conta NÃO passam por aqui (lib/notify-user.ts).
// Leitura em lote (poucas consultas por execução), sem percorrer o banco inteiro.
// ─────────────────────────────────────────────────────────────────────────────

const LOOKBACK_DAYS = 60;
const MEASUREMENTS_HOUR = 10;
const CHUNK = 100;
const PAGE = 1000;
const SEND_CONCURRENCY = 8;

type Candidate = { userId: string; type: string; dedupeKey: string; text: NotificationText };

export type EngineResult = {
  now: string;
  spHour: number;
  usersWithDevice: number;
  candidates: number;
  sent: number;
  skipped: Record<string, number>;
  preview?: Candidate[];
};

async function fetchAllPages<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

function chunks<T>(list: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export async function runNotificationEngine(
  supabase: SupabaseClient,
  options: { dryRun?: boolean; now?: Date; onlyUserId?: string } = {}
): Promise<EngineResult> {
  const now = options.now ?? new Date();
  const clock = spClock(now);
  const today = clock.dateKey;
  const skipped: Record<string, number> = {};
  const skip = (reason: string) => (skipped[reason] = (skipped[reason] ?? 0) + 1);

  const base: EngineResult = { now: now.toISOString(), spHour: clock.hour, usersWithDevice: 0, candidates: 0, sent: 0, skipped };

  // Fora da janela (21h–8h) não há nada de engajamento para mandar.
  if (clock.hour < QUIET_END_HOUR || clock.hour > LAST_ALLOWED_HOUR) {
    skip("quiet_hours");
    return base;
  }

  // 1) Quem pode receber: tem pelo menos um aparelho registrado.
  const [webIds, nativeIds] = await Promise.all([
    fetchAllPages<{ user_id: string }>((a, b) => supabase.from("push_subscriptions").select("user_id").range(a, b)),
    fetchAllPages<{ user_id: string }>((a, b) => supabase.from("native_push_tokens").select("user_id").range(a, b))
  ]);
  let userIds = [...new Set([...webIds, ...nativeIds].map((r) => r.user_id))];
  if (options.onlyUserId) userIds = userIds.filter((id) => id === options.onlyUserId);
  base.usersWithDevice = userIds.length;
  if (userIds.length === 0) return base;

  const sinceIso = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000).toISOString();
  const logSinceIso = new Date(now.getTime() - 35 * 86_400_000).toISOString();
  const nowIso = now.toISOString();

  type UserRow = { id: string; deleted_at: string | null; referral_premium_until: string | null; apple_premium_expires_at: string | null };
  type AnswersRow = { user_id: string; days: unknown; weeklyPlanDays: unknown };
  type LogRow = { user_id: string; dedupe_key: string; category: string; status: string; created_at: string };

  const users: UserRow[] = [];
  const answers: AnswersRow[] = [];
  const stripePremium = new Set<string>();
  const sessions = new Map<string, SessionRow[]>();
  const lastMeasured = new Map<string, string>();
  const logs = new Map<string, LogRow[]>();

  // 2) Dados em lote (blocos de 100 pessoas).
  for (const ids of chunks(userIds, CHUNK)) {
    const [u, ans, subs, sess, meas, lg] = await Promise.all([
      supabase.from("users").select("id, deleted_at, referral_premium_until, apple_premium_expires_at").in("id", ids),
      supabase
        .from("user_answers")
        .select("user_id, days:answers->days, weeklyPlanDays:answers->weeklyPlanDays")
        .in("user_id", ids)
        .is("deleted_at", null),
      supabase.from("subscriptions").select("user_id").in("user_id", ids).in("status", ["active", "past_due"]),
      fetchAllPages<SessionRow & { user_id: string }>((a, b) =>
        supabase
          .from("workout_session_logs")
          .select("user_id, completed_at, completed_day_sp, started_at, duration_seconds, end_reason, timing_reliable")
          .in("user_id", ids)
          .gte("completed_at", sinceIso)
          .order("completed_at", { ascending: true })
          .range(a, b)
      ),
      fetchAllPages<{ user_id: string; measured_at: string }>((a, b) =>
        supabase.from("body_measurements").select("user_id, measured_at").in("user_id", ids).range(a, b)
      ),
      fetchAllPages<LogRow>((a, b) =>
        supabase
          .from("notification_log")
          .select("user_id, dedupe_key, category, status, created_at")
          .in("user_id", ids)
          .gte("created_at", logSinceIso)
          .range(a, b)
      )
    ]);
    for (const res of [u, ans, subs]) if (res.error) throw new Error(res.error.message);
    users.push(...((u.data ?? []) as UserRow[]));
    answers.push(...((ans.data ?? []) as AnswersRow[]));
    for (const r of subs.data ?? []) stripePremium.add(r.user_id as string);
    for (const r of sess) sessions.set(r.user_id, [...(sessions.get(r.user_id) ?? []), r]);
    for (const r of meas) {
      const prev = lastMeasured.get(r.user_id);
      if (!prev || r.measured_at > prev) lastMeasured.set(r.user_id, r.measured_at);
    }
    for (const r of lg) logs.set(r.user_id, [...(logs.get(r.user_id) ?? []), r]);
  }

  const answersBy = new Map(answers.map((a) => [a.user_id, a]));
  const weekStartIso = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const candidates: Candidate[] = [];

  // 3) Decide (no máximo) uma mensagem por pessoa.
  for (const user of users) {
    if (user.deleted_at) { skip("deleted"); continue; }
    const userId = user.id;
    const rows = sessions.get(userId) ?? [];
    const dayKeys = rows.map(sessionDay);
    const userLogs = logs.get(userId) ?? [];
    const sentKeys = new Set(userLogs.map((l) => l.dedupe_key));

    // Limites de engajamento (só o que de fato saiu ou está saindo).
    const engagement = userLogs.filter((l) => l.category === "engagement" && l.status !== "no_device");
    const todayCount = engagement.filter((l) => spClock(new Date(l.created_at)).dateKey === today).length;
    const weekCount = engagement.filter((l) => l.created_at >= weekStartIso).length;
    if (todayCount >= ENGAGEMENT_MAX_PER_DAY) { skip("daily_cap"); continue; }
    if (weekCount >= ENGAGEMENT_MAX_PER_WEEK) { skip("weekly_cap"); continue; }

    if (dayKeys.includes(today)) { skip("trained_today"); continue; }
    if (dayKeys.length === 0) { skip("no_recent_workouts"); continue; }

    const lastDay = dayKeys.reduce((a, b) => (b > a ? b : a));
    const daysSince = daysBetween(lastDay, today);
    const ans = answersBy.get(userId);
    const quizDays = parseQuizDays(ans?.days);
    const isPremium =
      stripePremium.has(userId) ||
      Boolean(user.apple_premium_expires_at && user.apple_premium_expires_at > nowIso) ||
      Boolean(user.referral_premium_until && user.referral_premium_until > nowIso);
    const chosenDays = isPremium ? parseWeekdays(ans?.weeklyPlanDays) : null;
    const habit = habitualStartMinutes(rows);

    const want = (type: string, dedupeKey: string, text: NotificationText) => {
      if (sentKeys.has(dedupeKey)) return false;
      candidates.push({ userId, type, dedupeKey, text });
      return true;
    };

    // ① Dias sem treinar
    const frequency = weeklyFrequency(dayKeys, lastDay, quizDays);
    const inactivity = currentInactivityLevel(daysSince, frequency);
    if (inactivity && clock.hour >= engagementHour(habit)) {
      const key = `sem_treinar:${lastDay}:${inactivity.level}`;
      const isLast = inactivity.index === inactivity.total - 1;
      if (want("sem_treinar", key, semTreinarText(`${userId}:${key}`, inactivity.level, isLast))) continue;
    }

    // ② Treino do dia (só para quem está treinando: últimos 14 dias)
    const active = daysSince <= ACTIVE_WINDOW_DAYS;
    const weekdays = trainingWeekdays({ chosenDays, dayKeys, todayKey: today, quizDays });
    const weeklyTarget = chosenDays?.length ?? quizDays ?? frequency;
    const doneThisWeek = (fromDay: string, untilDay: string) =>
      dayKeys.filter((d) => d >= sundayOfWeek(fromDay) && d <= untilDay).length;
    if (active && habit !== null) {
      const slot = reminderSlot(habit);
      if (slot.kind === "same_day") {
        const due = clock.hour === slot.hour || clock.hour === slot.hour + 1;
        const trainingDay = weekdays.includes(clock.weekday);
        const goalReached = doneThisWeek(today, today) >= weeklyTarget;
        if (due && trainingDay && !goalReached) {
          if (want("treino_do_dia", `treino_do_dia:${today}`, treinoDoDiaText(`${userId}:${today}`))) continue;
        }
      } else if (clock.hour === slot.hour) {
        // Treina cedo: aviso na véspera, às 20h, sobre o treino de amanhã.
        const tomorrow = addDays(today, 1);
        const trainingTomorrow = weekdays.includes(weekdayOf(tomorrow));
        const goalReached = doneThisWeek(tomorrow, today) >= weeklyTarget;
        if (trainingTomorrow && !goalReached) {
          if (want("treino_do_dia", `treino_do_dia:${tomorrow}`, treinoAmanhaCedoText(`${userId}:${tomorrow}`))) continue;
        }
      }
    }

    // ③ Medidas do mês (pessoa ativa, em dia de descanso, às 10h)
    const restDay = !weekdays.includes(clock.weekday);
    if (active && restDay && clock.hour === MEASUREMENTS_HOUR) {
      const last = lastMeasured.get(userId);
      if (last) {
        if (daysBetween(last, today) >= MEASUREMENTS_INTERVAL_DAYS) {
          want("medidas", `medidas:${last}`, medidasText(true));
        }
      } else if (dayKeys.length >= 3) {
        want("medidas", "medidas:primeira", medidasText(false));
      }
    }
  }

  base.candidates = candidates.length;
  if (options.dryRun) {
    base.preview = candidates;
    return base;
  }

  // 4) Envia (algumas em paralelo).
  for (const group of chunks(candidates, SEND_CONCURRENCY)) {
    const results = await Promise.all(
      group.map((c) =>
        logAndSend(supabase, { userId: c.userId, type: c.type, category: "engagement", dedupeKey: c.dedupeKey, text: c.text }).catch(
          () => "failed" as const
        )
      )
    );
    for (const r of results) {
      if (r === "sent") base.sent++;
      else skip(`send_${r}`);
    }
  }
  return base;
}
