import { getAdminDashboardData } from "@/lib/admin";
import { requireAdminUser } from "@/lib/server-auth";
import { logError } from "@/lib/server-logger";
import { jsonError, jsonSuccess } from "@/lib/server-response";

export async function GET(request: Request) {
  try {
    const admin = await requireAdminUser(request, "ADMIN");
    if (admin.response) return admin.response;

    const data = await getAdminDashboardData();
    return jsonSuccess(data, 200);
  } catch (error) {
    logError("ADMIN", "Dashboard route failed", {
      error: error instanceof Error ? error.message : "unknown"
    });
    return jsonError("Não foi possível carregar o dashboard admin.", 500);
  }
}
