import { AdminDashboardOverview } from "@/components/admin-dashboard-overview";
import { getAdminDashboardData } from "@/lib/admin";

// Server Component assíncrono: busca os dados direto no servidor, eliminando
// o "Carregando..." do useEffect e reduzindo o tempo de resposta percebido.
// O Suspense em app/admin/page.tsx exibe o fallback enquanto este componente resolve.
export async function AdminDashboardShell() {
  const data = await getAdminDashboardData();
  return <AdminDashboardOverview data={data} />;
}
