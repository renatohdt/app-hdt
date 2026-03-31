"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminTable } from "@/components/admin-table";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { getRequestErrorMessage, parseJsonResponse } from "@/lib/api";
import { formatDate } from "@/lib/admin-shared";

type AdminUserRow = {
  id: string;
  email: string;
  created_at: string;
  summary: {
    ageLabel: string;
    goal: string;
    days: string;
    time: string;
    gender: string;
    bodyType: string;
  };
};

export function AdminUsersList() {
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadUsers() {
      try {
        const response = await fetchWithAuth("/api/admin/users");
        const result = await parseJsonResponse<{ success: boolean; data?: AdminUserRow[]; error?: string }>(response);

        if (!response.ok || !result.success) {
          throw new Error(result.error ?? "Não foi possível carregar os usuários.");
        }

        if (active) {
          setUsers(result.data ?? []);
          setError(null);
        }
      } catch (requestError) {
        if (active) {
          setUsers([]);
          setError(getRequestErrorMessage(requestError, "Não foi possível carregar os usuários."));
        }
      }
    }

    void loadUsers();

    return () => {
      active = false;
    };
  }, []);

  if (!users) {
    return <div>Carregando...</div>;
  }

  return (
    <AdminTable headers={["E-mail", "Criado em", "Faixa etária", "Objetivo", "Dias", "Tempo", "Gênero", "Biotipo"]}>
      {users.length ? (
        users.map((user) => (
          <tr key={user.id} className="border-b border-white/8 last:border-b-0">
            <td className="px-5 py-4 text-sm text-white">
              <Link href={`/admin/users/${user.id}`} className="font-medium text-primary">
                {user.email}
              </Link>
            </td>
            <td className="px-5 py-4 text-sm text-white/72">{formatDate(user.created_at)}</td>
            <td className="px-5 py-4 text-sm text-white/72">{user.summary.ageLabel}</td>
            <td className="px-5 py-4 text-sm text-white/72">{user.summary.goal}</td>
            <td className="px-5 py-4 text-sm text-white/72">{user.summary.days}</td>
            <td className="px-5 py-4 text-sm text-white/72">{user.summary.time}</td>
            <td className="px-5 py-4 text-sm text-white/72">{user.summary.gender}</td>
            <td className="px-5 py-4 text-sm text-white/72">{user.summary.bodyType}</td>
          </tr>
        ))
      ) : (
        <tr>
          <td colSpan={8} className="px-5 py-8 text-sm text-white/60">
            {error ?? "Nenhum usuário encontrado."}
          </td>
        </tr>
      )}
    </AdminTable>
  );
}
