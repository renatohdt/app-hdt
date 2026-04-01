import { getMonthlyDashboardCsv } from "@/lib/admin";
import { requireAdminUser } from "@/lib/server-auth";
import { logError } from "@/lib/server-logger";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const admin = await requireAdminUser(request, "ADMIN");
    if (admin.response) {
      return new Response("data,pagina_inicial,iniciaram_questionario,criaram_conta,clicaram_cta\n", {
        status: 403,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="dashboard-mensal.csv"'
        }
      });
    }

    const csv = await getMonthlyDashboardCsv();

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="dashboard-mensal.csv"'
      }
    });
  } catch (error) {
    logError("ADMIN", "Monthly CSV export failed", {
      error: error instanceof Error ? error.message : "unknown"
    });
    return new Response("data,pagina_inicial,iniciaram_questionario,criaram_conta,clicaram_cta\n", {
      status: 500,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="dashboard-mensal.csv"'
      }
    });
  }
}
