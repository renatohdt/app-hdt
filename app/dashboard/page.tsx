"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ConfigAlert } from "@/components/config-alert";
import { WorkoutPremiumScreen } from "@/components/workout-premium-screen";
import { Button, Card, Container, PageShell } from "@/components/ui";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { clientLogError } from "@/lib/client-logger";
import { getRequestErrorMessage, parseJsonResponse } from "@/lib/api";
import { signOutAndRedirect } from "@/lib/client-signout";
import { getSupabaseConfigError, isSupabaseConfigured, supabase } from "@/lib/supabase";
import type { WorkoutPlan } from "@/lib/types";

type WorkoutPayload = {
  hasWorkout?: boolean;
  user: { id: string; name: string };
  answers: {
    goal: "lose_weight" | "gain_muscle" | "body_recomposition" | "improve_conditioning";
    wrist: "dont_touch" | "not_touch" | "just_touch" | "overlap";
    body_type_raw?: string;
    body_type?: string;
    time: number;
    days: number;
    experience: "no_training" | "lt_6_months" | "6_to_12_months" | "gt_1_year";
  };
  workout: WorkoutPlan | null;
};

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardLoadingState />}>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [payload, setPayload] = useState<WorkoutPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noWorkout, setNoWorkout] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [generatingWorkout, setGeneratingWorkout] = useState(false);

  useEffect(() => {
    let active = true;

    async function logoutAndRedirectLogin() {
      await signOutAndRedirect({
        supabaseClient: supabase,
        redirectTo: "/login",
        onBeforeRedirect: () => {
          if (active) {
            setPayload(null);
            setError(null);
            setNoWorkout(false);
            setLoading(false);
          }
        },
        onError: (signOutError) => {
          clientLogError("DASHBOARD SIGN OUT ERROR", signOutError);
        }
      });
    }

    async function fetchWorkout(userId: string) {
      const response = await fetchWithAuth(`/api/workout?userId=${userId}`);

      if (!response.ok) {
        const result = await parseJsonResponse<{ success: false; error?: string }>(response);
        const normalizedError = (result.error ?? "").toLowerCase();

        if (
          response.status === 404 &&
          (normalizedError.includes("usuario nao encontrado") || normalizedError.includes("usuário não encontrado"))
        ) {
          await logoutAndRedirectLogin();
          return null;
        }

        throw new Error(result.error ?? "Nao foi possivel carregar o treino.");
      }

      const result = await parseJsonResponse<{ success: true; data: WorkoutPayload }>(response);
      return result.data;
    }

    async function run() {
      if (!isSupabaseConfigured() || !supabase) {
        if (active) {
          setError(getSupabaseConfigError() ?? "Falha ao inicializar o Supabase.");
          setLoading(false);
        }
        return;
      }

      try {
        const searchUserId = searchParams.get("userId");
        let userId = searchUserId;

        if (!userId) {
          const {
            data: { user }
          } = await supabase.auth.getUser();

          if (!user?.id) {
            router.replace("/login");
            return;
          }

          userId = user.id;
        }

        if (active) {
          setCurrentUserId(userId);
        }

        const data = await fetchWorkout(userId);

        if (!data) {
          return;
        }

        if (active) {
          setPayload(data);
          setNoWorkout(data.hasWorkout === false || !data.workout);
          setError(null);
        }
      } catch (requestError) {
        if (active) {
          setError(getRequestErrorMessage(requestError, "Nao foi possivel carregar o treino."));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void run();

    return () => {
      active = false;
    };
  }, [router, searchParams]);

  useEffect(() => {
    if (!noWorkout) {
      return;
    }

    const timeout = window.setTimeout(() => {
      router.push("/perfil");
    }, 3000);

    return () => window.clearTimeout(timeout);
  }, [noWorkout, router]);

  async function handleGenerateWorkoutNow() {
    if (!currentUserId) {
      router.push("/perfil");
      return;
    }

    setGeneratingWorkout(true);
    setError(null);

    try {
      const response = await fetchWithAuth("/api/workout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ userId: currentUserId })
      });

      const result = await parseJsonResponse<
        | { success: false; error?: string }
        | { success: true; data: WorkoutPayload }
      >(response);

      if (!response.ok || !result.success) {
        throw new Error(("error" in result ? result.error : undefined) ?? "Nao foi possivel gerar o treino agora.");
      }

      setPayload(result.data);
      setNoWorkout(result.data.hasWorkout === false || !result.data.workout);
    } catch (requestError) {
      setError(getRequestErrorMessage(requestError, "Nao foi possivel gerar o treino agora."));
    } finally {
      setGeneratingWorkout(false);
    }
  }

  const data = useMemo(() => {
    if (!payload?.workout || payload.hasWorkout === false) return null;

    const sections = payload.workout.sections?.length
      ? payload.workout.sections
      : [
          {
            title: "Treino A",
            subtitle: payload.workout.title ?? "Treino principal",
            focus: "full_body",
            mobility: [],
            exercises: payload.workout.exercises ?? []
          }
        ];

    const workoutsObject: Record<string, (typeof sections)[number] & { day: string }> = {};
    sections.forEach((section) => {
      const day = section.title.replace("Treino ", "");
      workoutsObject[day] = {
        day,
        ...section
      };
    });

    return {
      user: {
        id: payload.user.id,
        name: payload.user.name,
        goal: payload.answers.goal,
        level: payload.answers.experience,
        body_type: payload.answers.body_type ?? payload.answers.body_type_raw ?? payload.answers.wrist,
        location: "home"
      },
      workouts: workoutsObject,
      plan: {
        splitType: payload.workout.splitType,
        rationale: payload.workout.rationale ?? null,
        progressionNotes: payload.workout.progressionNotes ?? null,
        sessionCount: payload.workout.sessionCount ?? sections.length
      }
    };
  }, [payload]);

  if (!isSupabaseConfigured() || !supabase) {
    return (
      <PageShell>
        <Container className="py-12">
          <ConfigAlert />
        </Container>
      </PageShell>
    );
  }

  if (loading) {
    return <DashboardLoadingState />;
  }

  if (noWorkout) {
    return (
      <PageShell>
        <Container className="py-12">
          <Card className="mx-auto max-w-3xl space-y-4">
            <h1 className="text-2xl font-semibold text-white">Seu treino ainda nao esta pronto</h1>
            <p className="text-sm text-white/64">
              Complete ou revise seus dados para gerar um treino personalizado.
            </p>
            {error ? <p className="text-sm text-red-300">{error}</p> : null}
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button variant="secondary" onClick={() => router.push("/perfil")}>
                Ajustar meus dados
              </Button>
              <Button onClick={handleGenerateWorkoutNow} disabled={generatingWorkout}>
                {generatingWorkout ? "Gerando treino..." : "Gerar treino agora"}
              </Button>
            </div>
            <p className="text-xs text-white/45">Voce sera redirecionado para seu perfil em instantes.</p>
          </Card>
        </Container>
      </PageShell>
    );
  }

  if (error || !data) {
    return (
      <PageShell>
        <Container className="py-12">
          <Card className="mx-auto max-w-3xl space-y-4">
            <h1 className="text-2xl font-semibold text-white">Seu treino ainda nao esta pronto</h1>
            <p className="text-sm text-white/64">
              Complete ou revise seus dados para gerar um treino personalizado.
            </p>
            <p className="text-sm text-red-300">{error ?? "Treino nao encontrado."}</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button variant="secondary" onClick={() => router.push("/perfil")}>
                Ajustar meus dados
              </Button>
              <Button onClick={handleGenerateWorkoutNow} disabled={generatingWorkout}>
                {generatingWorkout ? "Gerando treino..." : "Gerar treino agora"}
              </Button>
            </div>
          </Card>
        </Container>
      </PageShell>
    );
  }

  return <WorkoutPremiumScreen data={data} />;
}

function DashboardLoadingState() {
  return (
    <PageShell>
      <Container className="py-12">
        <Card className="mx-auto max-w-3xl">
          <div className="flex min-h-[280px] items-center justify-center text-sm text-white/64">Carregando...</div>
        </Card>
      </Container>
    </PageShell>
  );
}

