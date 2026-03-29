import { requireAuthenticatedUser } from "@/lib/server-auth";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import { createSupabaseUserClient } from "@/lib/supabase-user";

export const dynamic = "force-dynamic";

type ReviewWorkoutRequestBody = {
  reason?: string;
};

export async function POST(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response || !auth.user) {
    return auth.response ?? jsonError("Sua sessao expirou. Faca login novamente.", 401);
  }

  const supabase = createSupabaseUserClient(request);
  if (!supabase) {
    return jsonError("Nao foi possivel registrar sua solicitacao agora.", 500);
  }

  const body = (await request.json().catch(() => null)) as ReviewWorkoutRequestBody | null;
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

  if (reason.length < 10) {
    return jsonError("Descreva em poucas palavras o motivo da solicitacao de revisao humana.", 400);
  }

  const { data: workoutRow, error: workoutError } = await supabase
    .from("workouts")
    .select("id")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (workoutError) {
    return jsonError("Nao foi possivel localizar seu treino atual.", 500);
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("workout_review_requests")
    .insert({
      user_id: auth.user.id,
      workout_id: workoutRow?.id ?? null,
      reason,
      status: "requested",
      created_at: now,
      updated_at: now
    })
    .select("id, workout_id, status, created_at")
    .single();

  if (error) {
    return jsonError("Nao foi possivel registrar sua solicitacao agora.", 500);
  }

  return jsonSuccess(
    {
      id: data.id,
      workoutId: data.workout_id ?? null,
      status: data.status,
      createdAt: data.created_at,
      message: "Solicitacao registrada com sucesso. Nossa equipe pode usar esse relato para revisar sua recomendacao."
    },
    201
  );
}
