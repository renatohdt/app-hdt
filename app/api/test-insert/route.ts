import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { requireAdminUser } from "@/lib/server-auth";
import { logError, logInfo } from "@/lib/server-logger";
import { jsonError, jsonSuccess } from "@/lib/server-response";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return jsonError("Endpoint disponível apenas em desenvolvimento local.", 404);
  }

  try {
    const admin = await requireAdminUser(request, "ADMIN");
    if (admin.response) return admin.response;

    const supabase = createSupabaseAdminClient();

    if (!supabase) {
      return jsonError("Não foi possível executar o teste agora.", 500);
    }

    const exercise = {
      name: "Teste",
      muscle: "chest",
      muscle_groups: ["chest", "triceps"],
      type: "compound",
      location: ["home"],
      equipment: ["bodyweight"],
      level: ["beginner"],
      metadata: {
        muscle: "chest",
        muscle_groups: ["chest", "triceps"],
        muscles: ["chest", "triceps"],
        type: "compound",
        location: ["home"],
        equipment: ["bodyweight"],
        level: ["beginner"]
      },
      video_url: "https://youtube.com"
    };

    logInfo("ADMIN", "Test insert started", { user_id: admin.user?.id ?? "unknown" });

    const { data, error } = await supabase.from("exercises").insert([exercise]).select();

    if (error) {
      logError("ADMIN", "Test insert failed", { error: error.message });
      return jsonError("Não foi possível executar o teste agora.", 500);
    }

    return jsonSuccess(data, 200);
  } catch (error) {
    logError("ADMIN", "Test insert route failed", {
      error: error instanceof Error ? error.message : "unknown"
    });
    return jsonError("Não foi possível executar o teste agora.", 500);
  }
}
