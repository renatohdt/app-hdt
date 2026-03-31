import { DATA_RETENTION_POLICY_VERSION } from "@/lib/data-retention-policy";
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
  reviewRequests: Array<{
    id: string;
    workoutId: string | null;
    reason: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  }>;
  metadata: {
    userId: string;
    hasSensitiveHealthData: boolean;
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
    consentsResult,
    analyticsEventsResult,
    contentRecommendationsResult,
    reviewRequestsResult
  ] = await Promise.all([
    supabase.from("users").select("id, name, created_at").eq("id", userId).maybeSingle(),
    supabase.from("user_answers").select("answers").eq("user_id", userId).maybeSingle(),
    supabase.from("workouts").select("id, created_at, exercises").eq("user_id", userId).order("created_at", { ascending: false }),
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
      .from("workout_review_requests")
      .select("id, workout_id, reason, status, created_at, updated_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
  ]);

  const errors = [
    userRowResult.error,
    answersResult.error,
    workoutsResult.error,
    consentsResult.error,
    analyticsEventsResult.error,
    contentRecommendationsResult.error,
    reviewRequestsResult.error
  ].filter(Boolean);

  if (errors.length) {
    return jsonError("Não foi possível exportar seus dados no momento.", 500);
  }

  const quizAnswers = (answersResult.data?.answers ?? null) as Record<string, unknown> | null;
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
    reviewRequests: (reviewRequestsResult.data ?? []).map((reviewRequest) => ({
      id: reviewRequest.id,
      workoutId: reviewRequest.workout_id ?? null,
      reason: reviewRequest.reason,
      status: reviewRequest.status,
      createdAt: reviewRequest.created_at,
      updatedAt: reviewRequest.updated_at
    })),
    metadata: {
      userId,
      hasSensitiveHealthData: Boolean(typeof quizAnswers?.injuries === "string" && quizAnswers.injuries.trim()),
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
