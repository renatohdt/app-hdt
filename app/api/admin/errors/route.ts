import { getAdminData } from "@/lib/admin";
import { requireAdminUser } from "@/lib/server-auth";
import { logError } from "@/lib/server-logger";
import { jsonError, jsonSuccess } from "@/lib/server-response";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const admin = await requireAdminUser(request, "ADMIN");
    if (admin.response) return admin.response;

    const { errors } = await getAdminData();
    return jsonSuccess(errors, 200);
  } catch (error) {
    logError("ADMIN", "Errors route failed", {
      error: error instanceof Error ? error.message : "unknown"
    });
    return jsonError("Não foi possível carregar o log de erros.", 500);
  }
}
