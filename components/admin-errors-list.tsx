"use client";

import { useEffect, useState } from "react";
import { AdminTable } from "@/components/admin-table";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { getRequestErrorMessage, parseJsonResponse } from "@/lib/api";
import { AdminErrorLog, formatDate } from "@/lib/admin-shared";

export function AdminErrorsList() {
  const [errors, setErrors] = useState<AdminErrorLog[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadErrors() {
      try {
        const response = await fetchWithAuth("/api/admin/errors");
        const result = await parseJsonResponse<{ success: boolean; data?: AdminErrorLog[]; error?: string }>(response);

        if (!response.ok || !result.success) {
          throw new Error(result.error ?? "Não foi possível carregar o log de erros.");
        }

        if (active) {
          setErrors(result.data ?? []);
          setMessage(null);
        }
      } catch (requestError) {
        if (active) {
          setErrors([]);
          setMessage(getRequestErrorMessage(requestError, "Não foi possível carregar o log de erros."));
        }
      }
    }

    void loadErrors();

    return () => {
      active = false;
    };
  }, []);

  if (!errors) {
    return <div className="text-sm text-white/60">Carregando...</div>;
  }

  return (
    <AdminTable headers={["Mensagem", "Origem", "Data"]}>
      {errors.length ? (
        errors.map((error) => (
          <tr key={error.id} className="border-b border-white/8 last:border-b-0">
            <td className="px-5 py-4 text-sm text-white">{error.message}</td>
            <td className="px-5 py-4 text-sm text-white/72">{error.origin}</td>
            <td className="px-5 py-4 text-sm text-white/72">{formatDate(error.created_at)}</td>
          </tr>
        ))
      ) : (
        <tr>
          <td colSpan={3} className="px-5 py-8 text-sm text-white/60">
            {message ?? "Sem erros recentes"}
          </td>
        </tr>
      )}
    </AdminTable>
  );
}
