import { getAdminData } from "@/lib/admin";
import { buildAdminAnswerSummary } from "@/lib/admin-privacy";
import { requireAdminUser } from "@/lib/server-auth";
import { logError } from "@/lib/server-logger";
import { jsonError, jsonSuccess } from "@/lib/server-response";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const admin = await requireAdminUser(request, "ADMIN");
    if (admin.response) return admin.response;

    const { workouts, users } = await getAdminData();
    const sanitizedUsers = users.map((user) => ({
      id: user.id,
      name: user.name,
      summary: buildAdminAnswerSummary(user.answers)
    }));

    const response = jsonSuccess({ workouts, users: sanitizedUsers }, 200);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    logError("ADMIN", "Workouts route failed", {
      error: error instanceof Error ? error.message : "unknown"
    });
    return jsonError("Não foi possível carregar os treinos.", 500);
  }
}
