"use client";

import { useEffect, useState } from "react";
import { AdminStatCard } from "@/components/admin-stat-card";
import { Card } from "@/components/ui";
import { clientLogError } from "@/lib/client-logger";

type DashboardStats = {
  users: number;
  workouts: number;
  exercises: number;
  completions: number;
  started: number;
  completed: number;
  viewed: number;
  clicked: number;
};

export function AdminDashboardStats() {
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    fetch("/api/admin/dashboard")
      .then((res) => res.json())
      .then((response) => {
        setStats(response.data);
      })
      .catch((error) => {
        clientLogError("DASHBOARD FETCH ERROR", error);
      });
  }, []);

  if (!stats) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminStatCard label="Total de usuarios" value={stats.users} description="Base total de leads e alunos." />
        <AdminStatCard label="Total de treinos" value={stats.workouts} description="Treinos gerados no banco." />
        <AdminStatCard label="Total de exercicios" value={stats.exercises} description="Exercicios cadastrados na biblioteca." />
        <AdminStatCard label="Quiz completos" value={stats.completions} description="Usuarios com respostas registradas." />
      </div>

      <Card className="space-y-5">
        <div>
          <h2 className="text-2xl font-semibold">Funil basico</h2>
          <p className="mt-2 text-sm text-white/64">Acompanhamento simples do fluxo principal com base na tabela de usuarios.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-[22px] border border-white/10 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-white/45">Iniciaram quiz</p>
            <p className="mt-3 text-3xl font-semibold">{stats.started}</p>
          </div>
          <div className="rounded-[22px] border border-white/10 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-white/45">Completaram quiz</p>
            <p className="mt-3 text-3xl font-semibold">{stats.completed}</p>
          </div>
          <div className="rounded-[22px] border border-white/10 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-white/45">Visualizaram treino</p>
            <p className="mt-3 text-3xl font-semibold">{stats.viewed}</p>
          </div>
          <div className="rounded-[22px] border border-white/10 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-white/45">Clicaram CTA</p>
            <p className="mt-3 text-3xl font-semibold">{stats.clicked}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
