"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { parseJsonResponse } from "@/lib/api";
import { clientLogError } from "@/lib/client-logger";
import { Button, Card } from "@/components/ui";

export function AdminRouteGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<"checking" | "allowed" | "denied">("checking");
  const [message, setMessage] = useState<string>("Acesso negado ao admin.");

  useEffect(() => {
    let active = true;

    async function validateAccess() {
      try {
        const response = await fetchWithAuth("/api/admin/session");

        if (response.ok) {
          if (active) {
            setStatus("allowed");
          }
          return;
        }

        const result = await parseJsonResponse<{ success?: boolean; error?: string }>(response);

        if (response.status === 401) {
          router.replace("/admin/login");
          return;
        }

        if (response.status === 403) {
          router.replace("/");
          return;
        }

        if (active) {
          setStatus("denied");
          setMessage(result.error ?? "Acesso negado ao admin.");
        }
      } catch (error) {
        clientLogError("ADMIN ACCESS CHECK FAILED", error);
        router.replace("/admin/login");
      }
    }

    void validateAccess();

    return () => {
      active = false;
    };
  }, [router]);

  if (status === "checking") {
    return <div className="text-sm text-white/60">Carregando...</div>;
  }

  if (status === "denied") {
    return (
      <Card className="flex min-h-[220px] flex-col items-center justify-center gap-4 text-center">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-white">Acesso negado ao admin</h1>
          <p className="text-sm text-white/60">{message}</p>
        </div>
        <Button type="button" variant="secondary" onClick={() => router.push("/dashboard")}>
          Voltar para o dashboard
        </Button>
      </Card>
    );
  }

  return <>{children}</>;
}

