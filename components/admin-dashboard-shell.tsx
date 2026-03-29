"use client";

import { useEffect, useState } from "react";
import { AdminDashboardOverview } from "@/components/admin-dashboard-overview";
import { Card } from "@/components/ui";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { getRequestErrorMessage, parseJsonResponse } from "@/lib/api";
import { AdminDashboardData } from "@/lib/admin-shared";

export function AdminDashboardShell() {
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      try {
        const response = await fetchWithAuth("/api/admin/dashboard");
        const result = await parseJsonResponse<{ success: boolean; data?: AdminDashboardData; error?: string }>(response);

        if (!response.ok || !result.success || !result.data) {
          throw new Error(result.error ?? "Não foi possível carregar o dashboard admin.");
        }

        if (active) {
          setData(result.data);
          setError(null);
        }
      } catch (requestError) {
        if (active) {
          setError(getRequestErrorMessage(requestError, "Não foi possível carregar o dashboard admin."));
        }
      }
    }

    void loadDashboard();

    return () => {
      active = false;
    };
  }, []);

  if (!data) {
    return (
      <Card className="flex min-h-[240px] items-center justify-center text-sm text-white/64">
        {error ?? "Carregando..."}
      </Card>
    );
  }

  return <AdminDashboardOverview data={data} />;
}
