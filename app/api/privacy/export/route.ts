import { DATA_RETENTION_POLICY_VERSION } from "@/lib/data-retention-policy";
import { stripLegacyQuizFields } from "@/lib/quiz-answers";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { jsonError } from "@/lib/server-response";
import { createSupabaseUserClient } from "@/lib/supabase-user";

export const dynamic = "force-dynamic";

type ExportPayload = {
  exportedAt: string;
  profile: {
    id: string;
    name: string;
    email: string | null;
    createdAt: string | null;
  } | null;
  quizAnswers: Record<string, unknown> | null;
  workouts: Array<{
    id: string;
    createdAt: string;
    data: unknown;
  }>;
  workoutSessionLogs: Array<{
    id: string;
    workoutId: string;
    workoutKey: string | null;
    sessionNumber: number;
    status: string;
    completedAt: string;
    createdAt: string;
  }>;
  consents: Array<{
    scope: string;
    granted: boolean;
    version: string;
    source: string | null;
    grantedAt: string | null;
    revokedAt: string | null;
    createdAt: string | null;
  }>;
  analyticsEvents: Array<{
    id: string;
    eventName: string;
    metadata: Record<string, unknown>;
    createdAt: string;
  }>;
  contentRecommendations: Array<{
    id: string;
    articles: unknown;
    generatedAt: string;
    expiresAt: string;
    updatedAt: string;
  }>;
  bodyMeasurements: Array<{
    id: string;
    measuredAt: string;
    weightKg: number | null;
    bodyFatPct: number | null;
    leanMassPct: number | null;
    restingHr: number | null;
    neckCm: number | null;
    chestCm: number | null;
    waistCm: number | null;
    hipCm: number | null;
    armCm: number | null;
    forearmCm: number | null;
    thighCm: number | null;
    calfCm: number | null;
    notes: string | null;
    createdAt: string;
  }>;
  // Aparelhos cadastrados para receber notificações. O token/endereço técnico
  // não é exportado: é uma credencial de envio, não um dado sobre a pessoa.
  notificationDevices: Array<{
    platform: "web" | "ios" | "android";
    registeredAt: string;
  }>;
  // Notificações automáticas que o app enviou (ou tentou enviar).
  notificationHistory: Array<{
    type: string;
    category: string;
    title: string;
    body: string;
    status: string;
    createdAt: string;
    sentAt: string | null;
  }>;
  metadata: {
    userId: string;
    exportFormat: "json";
    consentVersionCurrent: string;
    retentionPolicyVersion: string;
  };
};

export async function GET(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response || !auth.user) {
    return auth.response ?? jsonError("Sua sessão expirou. Faça login novamente.", 401);
  }

  const supabase = createSupabaseUserClient(request);
  if (!supabase) {
    return jsonError("Não foi possível preparar a exportação dos seus dados.", 500);
  }

  const userId = auth.user.id;

  const [
    userRowResult,
    answersResult,
    workoutsResult,
    workoutSessionLogsResult,
    consentsResult,
    analyticsEventsResult,
    contentRecommendationsResult,
    bodyMeasurementsResult,
    webPushResult,
    nativePushResult,
    notificationLogResult
  ] = await Promise.all([
    supabase.from("users").select("id, name, created_at").eq("id", userId).maybeSingle(),
    supabase.from("user_answers").select("answers").eq("user_id", userId).maybeSingle(),
    supabase.from("workouts").select("id, created_at, exercises").eq("user_id", userId).order("created_at", { ascending: false }),
    supabase
      .from("workout_session_logs")
      .select("id, workout_id, workout_key, session_number, status, completed_at, created_at")
      .eq("user_id", userId)
      .order("completed_at", { ascending: false }),
    supabase
      .from("user_consents")
      .select("scope, granted, version, source, granted_at, revoked_at, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("analytics_events")
      .select("id, event_name, metadata, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("content_recommendations")
      .select("id, articles, generated_at, expires_at, updated_at")
      .eq("user_id", userId)
      .order("generated_at", { ascending: false }),
    supabase
      .from("body_measurements")
      .select(
        "id, measured_at, weight_kg, body_fat_pct, lean_mass_pct, resting_hr, neck_cm, chest_cm, waist_cm, hip_cm, arm_cm, forearm_cm, thigh_cm, calf_cm, notes, created_at"
      )
      .eq("user_id", userId)
      .order("measured_at", { ascending: false }),
    supabase.from("push_subscriptions").select("created_at").eq("user_id", userId),
    supabase.from("native_push_tokens").select("platform, created_at").eq("user_id", userId),
    supabase
      .from("notification_log")
      .select("type, category, title, body, status, created_at, sent_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
  ]);

  const errors = [
    userRowResult.error,
    answersResult.error,
    workoutsResult.error,
    workoutSessionLogsResult.error,
    consentsResult.error,
    analyticsEventsResult.error,
    contentRecommendationsResult.error,
    bodyMeasurementsResult.error,
    webPushResult.error,
    nativePushResult.error,
    notificationLogResult.error
  ].filter(Boolean);

  if (errors.length) {
    return jsonError("Não foi possível exportar seus dados no momento.", 500);
  }

  const quizAnswers = stripLegacyQuizFields((answersResult.data?.answers ?? null) as Record<string, unknown> | null);
  const payload: ExportPayload = {
    exportedAt: new Date().toISOString(),
    profile: userRowResult.data
      ? {
          id: userRowResult.data.id,
          name: userRowResult.data.name,
          email: auth.user.email,
          createdAt: userRowResult.data.created_at ?? null
        }
      : null,
    quizAnswers,
    workouts: (workoutsResult.data ?? []).map((workout) => ({
      id: workout.id,
      createdAt: workout.created_at,
      data: workout.exercises
    })),
    workoutSessionLogs: (workoutSessionLogsResult.data ?? []).map((sessionLog) => ({
      id: sessionLog.id,
      workoutId: sessionLog.workout_id,
      workoutKey: sessionLog.workout_key ?? null,
      sessionNumber: sessionLog.session_number,
      status: sessionLog.status,
      completedAt: sessionLog.completed_at,
      createdAt: sessionLog.created_at
    })),
    consents: (consentsResult.data ?? []).map((consent) => ({
      scope: consent.scope,
      granted: Boolean(consent.granted),
      version: consent.version,
      source: consent.source ?? null,
      grantedAt: consent.granted_at ?? null,
      revokedAt: consent.revoked_at ?? null,
      createdAt: consent.created_at ?? null
    })),
    analyticsEvents: (analyticsEventsResult.data ?? []).map((event) => ({
      id: event.id,
      eventName: event.event_name,
      metadata: (event.metadata ?? {}) as Record<string, unknown>,
      createdAt: event.created_at
    })),
    contentRecommendations: (contentRecommendationsResult.data ?? []).map((recommendation) => ({
      id: recommendation.id,
      articles: recommendation.articles,
      generatedAt: recommendation.generated_at,
      expiresAt: recommendation.expires_at,
      updatedAt: recommendation.updated_at
    })),
    bodyMeasurements: (bodyMeasurementsResult.data ?? []).map((m) => ({
      id: m.id,
      measuredAt: m.measured_at,
      weightKg: m.weight_kg,
      bodyFatPct: m.body_fat_pct,
      leanMassPct: m.lean_mass_pct,
      restingHr: m.resting_hr,
      neckCm: m.neck_cm,
      chestCm: m.chest_cm,
      waistCm: m.waist_cm,
      hipCm: m.hip_cm,
      armCm: m.arm_cm,
      forearmCm: m.forearm_cm,
      thighCm: m.thigh_cm,
      calfCm: m.calf_cm,
      notes: m.notes,
      createdAt: m.created_at
    })),
    notificationDevices: [
      ...(webPushResult.data ?? []).map((d) => ({ platform: "web" as const, registeredAt: d.created_at })),
      ...(nativePushResult.data ?? []).map((d) => ({
        platform: (d.platform === "ios" ? "ios" : "android") as "ios" | "android",
        registeredAt: d.created_at
      }))
    ],
    notificationHistory: (notificationLogResult.data ?? []).map((n) => ({
      type: n.type,
      category: n.category,
      title: n.title,
      body: n.body,
      status: n.status,
      createdAt: n.created_at,
      sentAt: n.sent_at ?? null
    })),
    metadata: {
      userId,
      exportFormat: "json",
      consentVersionCurrent: process.env.CONSENT_VERSION_CURRENT?.trim() || "2026-03-29",
      retentionPolicyVersion: DATA_RETENTION_POLICY_VERSION
    }
  };

  return new Response(JSON.stringify({ success: true, data: payload }, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="hora-do-treino-dados-${userId}.json"`
    }
  });
}
