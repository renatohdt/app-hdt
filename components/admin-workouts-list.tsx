"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminTable } from "@/components/admin-table";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { getRequestErrorMessage, parseJsonResponse } from "@/lib/api";
import { formatDate } from "@/lib/admin-shared";

type WorkoutUser = {
  id: string;
  name: string;
  summary: {
    goal: string;
  };
};

type WorkoutRow = {
  id: string;
  user_id: string;
  created_at: string;
  exercises: {
    sections?: Array<{ title: string }>;
  };
};

export function AdminWorkoutsList() {
  const [data, setData] = useState<{ users: WorkoutUser[]; workouts: WorkoutRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadWorkouts() {
      try {
        const response = await fetchWithAuth("/api/admin/workouts");
        const result = await parseJsonResponse<{
          success: boolean;
          data?: { users: WorkoutUser[]; workouts: WorkoutRow[] };
          error?: string;
        }>(response);

        if (!response.ok || !result.success || !result.data) {
          throw new Error(result.error ?? "Nao foi possivel carregar os treinos.");
        }

        if (active) {
          setData(result.data);
          setError(null);
        }
      } catch (requestError) {
        if (active) {
          setError(getRequestErrorMessage(requestError, "Nao foi possivel carregar os treinos."));
          setData({ users: [], workouts: [] });
        }
      }
    }

    void loadWorkouts();

    return () => {
      active = false;
    };
  }, []);

  const userMap = useMemo(() => new Map((data?.users ?? []).map((user) => [user.id, user])), [data]);

  if (!data) {
    return <div className="text-sm text-white/60">Carregando...</div>;
  }

  return (
    <AdminTable headers={["Usuario", "Tipo", "Objetivo", "Criado em"]}>
      {data.workouts.length ? (
        data.workouts.map((workout) => {
          const user = userMap.get(workout.user_id);
          const type = workout.exercises.sections?.map((section) => section.title).join(", ") || "Treino";

          return (
            <tr key={workout.id} className="border-b border-white/8 last:border-b-0">
              <td className="px-5 py-4 text-sm text-white">{user?.name ?? "Usuario removido"}</td>
              <td className="px-5 py-4 text-sm text-white/72">{type}</td>
              <td className="px-5 py-4 text-sm text-white/72">{user?.summary.goal ?? "Nao informado"}</td>
              <td className="px-5 py-4 text-sm text-white/72">{formatDate(workout.created_at)}</td>
            </tr>
          );
        })
      ) : (
        <tr>
          <td colSpan={4} className="px-5 py-8 text-sm text-white/60">
            {error ?? "Nenhum treino gerado ainda."}
          </td>
        </tr>
      )}
    </AdminTable>
  );
}
