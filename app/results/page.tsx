"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Disclaimer } from "@/components/disclaimer";
import { WorkoutPremiumScreen } from "@/components/workout-premium-screen";
import { Card, Container, PageShell } from "@/components/ui";
import { getRequestErrorMessage, parseJsonResponse } from "@/lib/api";
import { trackEvent } from "@/lib/analytics-client";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import type { WorkoutPlan } from "@/lib/types";

type ResultPayload = {
  user: { id: string; name: string };
  answers: {
    goal: "lose_weight" | "gain_muscle" | "body_recomposition" | "improve_conditioning";
    wrist: "dont_touch" | "not_touch" | "just_touch" | "overlap";
    body_type_raw?: string;
    body_type?: string;
    location: "gym" | "home";
    time: number;
    days: number;
    experience: "no_training" | "lt_6_months" | "6_to_12_months" | "gt_1_year";
  };
  diagnosis: { title: string; message: string; trainingShift: string };
  workout: WorkoutPlan | null;
};

type WorkoutExercise = NonNullable<ResultPayload["workout"]>["exercises"][number];

export default function ResultsPage() {
  return (
    <Suspense fallback={<ResultsLoadingState />}>
      <ResultsContent />
    </Suspense>
  );
}

function ResultsContent() {
  const params = useSearchParams();
  const userId = params.get("userId");
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<ResultPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function run() {
      if (!userId) {
        setError("Usuário não informado.");
        setLoading(false);
        return;
      }

      if (userId === "local-preview" && typeof window !== "undefined") {
        const preview = window.sessionStorage.getItem("hora-do-treino-preview");
        if (preview) {
          try {
            const parsed = JSON.parse(preview) as ResultPayload;
            if (active) {
              await new Promise((resolve) => window.setTimeout(resolve, 600));
              setPayload(parsed);
              trackEvent("workout_viewed", parsed.user.id ?? null, {
                goal: parsed.answers.goal,
                location: parsed.answers.location
              });
              setLoading(false);
              return;
            }
          } catch {
            window.sessionStorage.removeItem("hora-do-treino-preview");
          }
        }
      }

      try {
        const response = await fetchWithAuth(`/api/workout?userId=${userId}`);
        if (!response.ok) {
          const responsePayload = await parseJsonResponse<{ success: false; error?: string }>(response);
          throw new Error(responsePayload.error ?? "Erro na requisicao");
        }

        const result = await parseJsonResponse<{ success: true; data: ResultPayload }>(response);
        const data = result.data;
        await new Promise((resolve) => window.setTimeout(resolve, 1200));

        if (active) {
          setPayload(data);
          trackEvent("workout_viewed", data.user.id ?? null, {
            goal: data.answers.goal,
            location: data.answers.location
          });
        }
      } catch (requestError) {
        if (active) {
          setError(getRequestErrorMessage(requestError, "Erro ao carregar seu treino."));
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void run();

    return () => {
      active = false;
    };
  }, [userId]);

  const data = useMemo(() => {
    if (!payload?.workout) return null;

    const sections = payload.workout.sections?.length ? payload.workout.sections : buildWorkoutSections(payload.workout.exercises);
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
        location: payload.answers.location
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

  if (loading) {
    return <ResultsLoadingState />;
  }

  if (error) {
    return (
      <PageShell>
        <Container className="py-10">
          <Card className="mx-auto max-w-3xl space-y-4">
            <h1 className="text-2xl font-semibold">Algo deu errado</h1>
            <p className="text-white/64">{error}</p>
          </Card>
        </Container>
      </PageShell>
    );
  }

  return <WorkoutPremiumScreen data={data} />;
}

function buildWorkoutSections(exercises: WorkoutExercise[]) {
  const chunks = [exercises.slice(0, 3), exercises.slice(3, 6), exercises.slice(6)];
  const labels = ["Treino A", "Treino B", "Treino C"];
  const subtitles = ["Base principal", "Volume complementar", "Reforço e consistência"];

  return chunks
    .map((items, index) => ({
      title: labels[index],
      subtitle: subtitles[index],
      focus: "full_body",
      mobility: [],
      exercises: items
    }))
    .filter((section) => section.exercises.length > 0);
}

function ResultsLoadingState() {
  return (
    <PageShell>
      <Container className="py-10">
        <Card className="mx-auto max-w-3xl">
          <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
            <div className="h-16 w-16 animate-spin rounded-full border-4 border-white/10 border-t-primary" />
            <p className="mt-6 text-sm uppercase tracking-[0.28em] text-primary">Analisando</p>
            <h1 className="mt-3 text-3xl font-semibold">Montando sua sugestao de treino</h1>
            <p className="mt-3 max-w-md text-sm text-white/62">
              Estamos organizando sua sugestao de treino para voce comecar agora.
            </p>
            <Disclaimer variant="compact" className="mt-6 max-w-xl text-left" />
          </div>
        </Card>
      </Container>
    </PageShell>
  );
}

