"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, SectionTitle } from "@/components/ui";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { getRequestErrorMessage, parseJsonResponse } from "@/lib/api";
import { formatDate } from "@/lib/admin-shared";

type AdminUserDetailData = {
  user: {
    id: string;
    name: string;
    emailMasked: string;
    emailRaw?: string | null;
    createdAt: string;
    summary: {
      goal: string;
      gender: string;
      bodyType: string;
      level: string;
      ageLabel: string;
      days: string;
      time: string;
    };
  };
  workout: {
    id: string | null;
    createdAt: string | null;
    focus: string[];
    sections: string[];
    sectionCount: number;
  };
  extendedData: {
    quizAnswers: unknown;
    workoutRaw: unknown;
  } | null;
};

export function AdminUserDetails({ userId }: { userId: string }) {
  const router = useRouter();
  const [data, setData] = useState<AdminUserDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingExtended, setIsLoadingExtended] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadUser() {
      try {
        const response = await fetchWithAuth(`/api/admin/users/${userId}`);
        const result = await parseJsonResponse<{
          success: boolean;
          data?: AdminUserDetailData;
          error?: string;
        }>(response);

        if (response.status === 404) {
          router.replace("/admin/users");
          return;
        }

        if (!response.ok || !result.success || !result.data) {
          throw new Error(result.error ?? "Não foi possível carregar o usuário.");
        }

        if (active) {
          setData(result.data);
          setError(null);
        }
      } catch (requestError) {
        if (active) {
          setError(getRequestErrorMessage(requestError, "Não foi possível carregar o usuário."));
        }
      }
    }

    void loadUser();

    return () => {
      active = false;
    };
  }, [router, userId]);

  async function handleRevealExtendedData() {
    if (isLoadingExtended) {
      return;
    }

    setIsLoadingExtended(true);

    try {
      const response = await fetchWithAuth(`/api/admin/users/${userId}?includeExtended=1`);
      const result = await parseJsonResponse<{
        success: boolean;
        data?: AdminUserDetailData;
        error?: string;
      }>(response);

      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.error ?? "Não foi possível revelar os dados ampliados.");
      }

      setData(result.data);
      setError(null);
    } catch (requestError) {
      setError(getRequestErrorMessage(requestError, "Não foi possível revelar os dados ampliados."));
    } finally {
      setIsLoadingExtended(false);
    }
  }

  if (!data) {
    return (
      <Card className="flex min-h-[240px] items-center justify-center text-sm text-white/64">
        {error ?? "Carregando..."}
      </Card>
    );
  }

  const { user, workout, extendedData } = data;

  return (
    <section className="space-y-8">
      <SectionTitle
        eyebrow="Administração"
        title={user.name}
        description={`${user.emailMasked} | ${formatDate(user.createdAt)}`}
      />

      {error ? (
        <div className="rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="space-y-3 xl:col-span-1">
          <h2 className="text-xl font-semibold">Resumo minimizado</h2>
          <p className="text-sm text-white/72">E-mail: {user.emailMasked}</p>
          <p className="text-sm text-white/72">Faixa etaria: {user.summary.ageLabel}</p>
          <p className="text-sm text-white/72">Objetivo: {user.summary.goal}</p>
          <p className="text-sm text-white/72">Gênero: {user.summary.gender}</p>
          <p className="text-sm text-white/72">Biotipo: {user.summary.bodyType}</p>
          <p className="text-sm text-white/72">Nível: {user.summary.level}</p>
          <p className="text-sm text-white/72">Dias: {user.summary.days}</p>
          <p className="text-sm text-white/72">Tempo: {user.summary.time}</p>
        </Card>

        <Card className="space-y-4 xl:col-span-1">
          <h2 className="text-xl font-semibold">Treino atual</h2>
          <p className="text-sm text-white/72">Gerado em: {formatDate(workout.createdAt ?? undefined)}</p>
          <p className="text-sm text-white/72">Total de sessões: {workout.sectionCount}</p>
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.16em] text-white/45">Focos</p>
            <p className="text-sm text-white/72">{workout.focus.length ? workout.focus.join(", ") : "Não informado"}</p>
          </div>
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.16em] text-white/45">Sessões</p>
            <p className="text-sm text-white/72">{workout.sections.length ? workout.sections.join(", ") : "Nenhuma sessão registrada"}</p>
          </div>
        </Card>

        <Card className="space-y-4 xl:col-span-1">
          <h2 className="text-xl font-semibold">Dados ampliados</h2>
          <p className="text-sm text-white/64">
            Respostas brutas do quiz e treino bruto ficam ocultos por padrão. Revele apenas quando houver necessidade operacional clara.
          </p>
          <Button onClick={handleRevealExtendedData} disabled={isLoadingExtended || Boolean(extendedData)}>
            {extendedData ? "Dados ampliados carregados" : isLoadingExtended ? "Registrando acesso..." : "Revelar dados ampliados"}
          </Button>
          {extendedData ? (
            <p className="text-sm text-white/58">
              O acesso ampliado foi solicitado explicitamente e pode ser auditado.
            </p>
          ) : null}
        </Card>
      </div>

      {extendedData ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="space-y-4">
            <h2 className="text-xl font-semibold">Quiz bruto</h2>
            <pre className="overflow-x-auto rounded-2xl border border-white/8 bg-black/20 p-4 text-xs text-white/72">
              {JSON.stringify(extendedData.quizAnswers ?? {}, null, 2)}
            </pre>
          </Card>

          <Card className="space-y-4">
            <h2 className="text-xl font-semibold">Treino bruto</h2>
            <pre className="overflow-x-auto rounded-2xl border border-white/8 bg-black/20 p-4 text-xs text-white/72">
              {JSON.stringify(extendedData.workoutRaw ?? {}, null, 2)}
            </pre>
          </Card>
        </div>
      ) : null}
    </section>
  );
}
