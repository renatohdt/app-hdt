import { recordAdminAuditLog } from "@/lib/admin-audit";
import { getAdminUserDetail } from "@/lib/admin-privacy";
import { requireAdminUser } from "@/lib/server-auth";
import { logError } from "@/lib/server-logger";
import { jsonError, jsonSuccess } from "@/lib/server-response";

export const dynamic = "force-dynamic";

type Params = {
  params: {
    id: string;
  };
};

export async function GET(request: Request, { params }: Params) {
  try {
    const admin = await requireAdminUser(request, "ADMIN");
    if (admin.response) return admin.response;

    const includeSensitive = new URL(request.url).searchParams.get("includeSensitive") === "1";
    const data = await getAdminUserDetail(params.id, includeSensitive);

    if (!data) {
      return jsonError("Usuário não encontrado.", 404);
    }

    if (includeSensitive) {
      await recordAdminAuditLog({
        adminId: admin.user?.id ?? "unknown-admin",
        adminEmail: admin.user?.email ?? null,
        action: "view_sensitive_user_data",
        targetType: "user",
        targetId: params.id,
        metadata: {
          sections: ["quiz_answers", "workout_raw"]
        }
      });
    }

    const response = jsonSuccess(data, 200);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    logError("ADMIN", "User details route failed", {
      error: error instanceof Error ? error.message : "unknown"
    });
    return jsonError("Não foi possível carregar o usuário.", 500);
  }
}
