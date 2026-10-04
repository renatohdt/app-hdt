"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUp, Dumbbell, Loader2, Sparkles, X, Zap } from "lucide-react";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import type { SessionDetailExercise } from "@/app/api/workout/session-detail/route";

export type DaySheetSession = {
  id: string;
  workoutLabel: string;
  isExtra: boolean;
  sessionNumber: number | null;
  liked: boolean | null;
  intensityLevel: number | null;
  location: string | null;
  // Exercícios do plano (quando a sessão é do programa atual) — usados se não houver cargas registradas.
  plannedExerciseNames: string[];
};

const INTENSITY = [
  { emoji: "😴", label: "muito leve" },
  { emoji: "😊", label: "leve" },
  { emoji: "😄", label: "na medida" },
  { emoji: "😤", label: "puxado" },
  { emoji: "😵", label: "muito puxado" }
] as const;

const LOCATION_LABELS: Record<string, string> = { home: "Casa", condo_gym: "Condomínio", gym: "Academia" };

// Painel inferior do calendário: o que foi feito no dia (ou o treino sugerido).
export function DaySheet({
  dateLabel,
  sessions,
  suggested,
  milestone = null,
  nextProgramLocked = false,
  onClose
}: {
  dateLabel: string;
  sessions: DaySheetSession[];
  suggested: { label: string; exerciseCount: number } | null;
  // Marco da linha do tempo do programa neste dia.
  milestone?: "finish" | "new_program" | null;
  // Free sem renovação: o próximo programa é Premium.
  nextProgramLocked?: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative max-h-[85vh] w-full max-w-[var(--app-shell-max)] overflow-y-auto rounded-t-[30px] border-t border-primary/25 bg-[#0d0f0d] px-5 pb-[calc(1.5rem+var(--app-safe-bottom))] pt-3 shadow-[0_-12px_50px_rgba(0,0,0,0.5)]">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">{dateLabel}</p>
          <button type="button" onClick={onClose} aria-label="Fechar" className="-mr-1 -mt-1 rounded-full p-1.5 text-white/45 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        {sessions.length ? (
          <div className="mt-1 space-y-5">
            {sessions.map((session) => (
              <SessionBlock key={session.id} session={session} />
            ))}
          </div>
        ) : suggested ? (
          <div className="mt-1">
            {milestone === "finish" ? (
              <p className="mb-3 rounded-2xl border border-yellow-300/25 bg-yellow-300/10 px-3 py-2.5 text-xs leading-relaxed text-yellow-100">
                🏁 <strong>Último treino do programa!</strong> Mantendo o ritmo, é aqui que você fecha o ciclo e monta o próximo.
              </p>
            ) : null}
            <p className="text-xl font-extrabold text-white">{suggested.label}</p>
            <p className="mt-1 text-sm text-white/60">
              Treino sugerido para este dia · {suggested.exerciseCount} exercícios
            </p>
            <Link
              href="/treino"
              className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-primaryStrong text-sm font-bold text-black"
            >
              <Dumbbell className="h-4 w-4" />
              Ver treino
            </Link>
          </div>
        ) : milestone === "new_program" ? (
          <div className="mt-1">
            <p className="flex items-center gap-2 text-xl font-extrabold text-white">
              <Sparkles className="h-5 w-5 text-yellow-300" />
              Começa o próximo programa
            </p>
            <p className="mt-2 text-sm leading-relaxed text-white/65">
              Mantendo o ritmo, é aqui que começa um novo programa: novos exercícios e uma nova progressão, montados a partir da sua evolução.
            </p>
            {nextProgramLocked ? (
              <>
                <p className="mt-3 text-xs leading-relaxed text-white/50">
                  No plano gratuito você já usou seus 2 programas. Com o Premium, você ganha um novo programa a cada ciclo.
                </p>
                <Link
                  href="/premium"
                  className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-primaryStrong text-sm font-bold text-black"
                >
                  <Sparkles className="h-4 w-4" />
                  Conhecer o Premium
                </Link>
              </>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 text-sm text-white/60">Dia de descanso. A recuperação também faz parte do treino. 😌</p>
        )}
      </div>
    </div>
  );
}

function SessionBlock({ session }: { session: DaySheetSession }) {
  const [exercises, setExercises] = useState<SessionDetailExercise[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetchWithAuth(`/api/workout/session-detail?id=${encodeURIComponent(session.id)}`)
      .then((res) => res.json())
      .then((json: { success?: boolean; data?: { exercises: SessionDetailExercise[] } }) => {
        if (!active) return;
        if (json?.success && json.data) setExercises(json.data.exercises);
        else setFailed(true);
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [session.id]);

  const intensity = session.intensityLevel ? INTENSITY[session.intensityLevel - 1] : null;
  const increases = exercises?.filter((e) => e.increased).length ?? 0;
  const loggedNames = new Set((exercises ?? []).map((e) => e.name.toLowerCase()));
  const unloggedPlanned = session.plannedExerciseNames.filter((name) => !loggedNames.has(name.toLowerCase()));

  return (
    <div>
      {session.location ? (
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">
          {LOCATION_LABELS[session.location] ?? session.location}
        </p>
      ) : null}
      <div className="mt-0.5 flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-xl font-extrabold text-white">
          {session.isExtra ? <Zap className="h-5 w-5 text-yellow-400" /> : null}
          {session.workoutLabel}
          {!session.isExtra && session.sessionNumber ? <span className="text-white/60">· Sessão {session.sessionNumber}</span> : null}
        </p>
        {intensity ? <span className="text-2xl">{intensity.emoji}</span> : null}
      </div>
      {intensity || session.liked != null ? (
        <p className="text-xs text-white/50">
          {intensity ? `Intensidade: ${intensity.label}` : ""}
          {intensity && session.liked != null ? " · " : ""}
          {session.liked === true ? "👍 Curtiu" : session.liked === false ? "👎 Não curtiu" : ""}
        </p>
      ) : null}

      <div className="mt-3 space-y-2">
        {exercises === null && !failed ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : null}

        {(exercises ?? []).map((exercise) => (
          <div
            key={exercise.name}
            className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{exercise.name}</p>
              <p className="text-[11px] text-white/45">
                {exercise.setsDone > 0 ? `${exercise.setsDone} ${exercise.setsDone === 1 ? "série" : "séries"}` : ""}
                {exercise.reps ? ` × ${exercise.reps}` : ""}
                {exercise.increased && exercise.previousMaxKg != null ? ` · antes ${formatKg(exercise.previousMaxKg)}` : ""}
              </p>
            </div>
            <p className={`flex shrink-0 items-center gap-1 text-sm font-bold ${exercise.increased ? "text-primary" : "text-white/85"}`}>
              {exercise.maxWeightKg > 0 ? formatKg(exercise.maxWeightKg) : "—"}
              {exercise.increased ? <ArrowUp className="h-3.5 w-3.5" /> : null}
            </p>
          </div>
        ))}

        {exercises !== null && unloggedPlanned.length
          ? unloggedPlanned.map((name) => (
              <div
                key={name}
                className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.05] bg-white/[0.02] px-3 py-2.5"
              >
                <p className="truncate text-sm font-medium text-white/70">{name}</p>
                <p className="shrink-0 text-sm text-white/35">—</p>
              </div>
            ))
          : null}

        {exercises !== null && exercises.length === 0 && unloggedPlanned.length === 0 ? (
          <p className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3 py-3 text-xs text-white/50">
            Nenhuma carga foi registrada neste treino.
          </p>
        ) : null}
      </div>

      {increases > 0 ? (
        <p className="mt-3 rounded-2xl bg-primary/10 px-3 py-2 text-xs font-semibold text-primary">
          🏋️ {increases} {increases === 1 ? "aumento de carga" : "aumentos de carga"} neste treino
        </p>
      ) : null}
    </div>
  );
}

function formatKg(value: number) {
  return `${Number.isInteger(value) ? value : value.toFixed(1).replace(".", ",")} kg`;
}
