export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { AdminDashboardShell } from "@/components/admin-dashboard-shell";
import { Card } from "@/components/ui";

export default function AdminPage() {
  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-primary">Administração</p>
        <h1 className="text-[2.35rem] font-semibold tracking-tight text-white sm:text-[2.8rem]">Dashboard</h1>
      </div>
      {/*
        Suspense com Server Component assíncrono:
        - O header da página é servido imediatamente
        - O card de "Carregando..." aparece até os dados chegarem (streaming)
        - Não há mais useEffect nem fetch do cliente
      */}
      <Suspense
        fallback={
          <Card className="flex min-h-[240px] items-center justify-center text-sm text-white/64">
            Carregando...
          </Card>
        }
      >
        <AdminDashboardShell />
      </Suspense>
    </section>
  );
}
