import { getAdminData } from "@/lib/admin";
import { buildAdminAnswerSummary, maskEmail } from "@/lib/admin-privacy";
import { requireAdminUser } from "@/lib/server-auth";
import { logError } from "@/lib/server-logger";
import { jsonError, jsonSuccess } from "@/lib/server-response";

export async function GET(request: Request) {
  try {
    const admin = await requireAdminUser(request, "ADMIN");
    if (admin.response) return admin.response;

    const { users, errors } = await getAdminData();

    if (errors.length && !users.length) {
      return jsonError("Não foi possível carregar os usuários.", 500);
    }

    const sanitizedUsers = users.map((user) => ({
      id: user.id,
      created_at: user.created_at,
      email: maskEmail(user.email),
      summary: buildAdminAnswerSummary(user.answers)
    }));

    const response = jsonSuccess(sanitizedUsers, 200);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    logError("ADMIN", "Users route failed", {
      error: error instanceof Error ? error.message : "unknown"
    });
    return jsonError("Não foi possível carregar os usuários.", 500);
  }
}
