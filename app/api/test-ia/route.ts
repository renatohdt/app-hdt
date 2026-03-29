import { runWorkoutTestPrompt } from "@/lib/workout-ai";
import { requireAdminUser } from "@/lib/server-auth";
import { logError, logInfo } from "@/lib/server-logger";
import { jsonError, jsonSuccess } from "@/lib/server-response";

export async function GET(request: Request) {
  try {
    const admin = await requireAdminUser(request, "ADMIN");
    if (admin.response) return admin.response;

    logInfo("AI", "Test prompt started", { user_id: admin.user?.id ?? "unknown" });
    const content = await runWorkoutTestPrompt("Crie um treino de peito simples");
    return jsonSuccess(content, 200);
  } catch (error) {
    logError("AI", "Test prompt failed", {
      error: error instanceof Error ? error.message : "unknown"
    });
    return jsonError("Não foi possível testar a IA agora.", 500);
  }
}
