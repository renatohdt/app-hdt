"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminExerciseForm } from "@/components/admin-exercise-form";
import { AdminTable } from "@/components/admin-table";
import { Button } from "@/components/ui";
import { getRequestErrorMessage, parseJsonResponse } from "@/lib/api";
import {
  formatExerciseMuscleGroups,
  formatExerciseTypeLabel
} from "@/lib/exercise-library";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { ExerciseRecord } from "@/lib/types";

export function AdminExercisesManager({ initialExercises }: { initialExercises: ExerciseRecord[] }) {
  const [exercises, setExercises] = useState(initialExercises);
  const [editingExerciseId, setEditingExerciseId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const editingExercise = exercises.find((exercise) => exercise.id === editingExerciseId) ?? null;
  const normalizedSearch = useMemo(() => search.trim(), [search]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setLoading(true);
      setError(null);

      try {
        const query = normalizedSearch ? `?search=${encodeURIComponent(normalizedSearch)}` : "";
        const response = await fetchWithAuth(`/api/admin/exercises${query}`, {
          headers: {
            "Content-Type": "application/json"
          },
          signal: controller.signal
        });

        if (!response.ok) {
          const result = await parseJsonResponse<{ success: false; error?: string }>(response);
          throw new Error(result.error ?? "Não foi possível carregar os exercícios.");
        }

        const result = await parseJsonResponse<{ success: true; data: ExerciseRecord[] }>(response);
        if (!active) return;
        setExercises(result.data ?? []);
      } catch (loadError) {
        if (!active || controller.signal.aborted) return;
        setError(getRequestErrorMessage(loadError, "Não foi possível carregar os exercícios."));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }, 300);

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [normalizedSearch]);

  function handleSaved(savedExercise: ExerciseRecord) {
    setExercises((current) => {
      const index = current.findIndex((exercise) => exercise.id === savedExercise.id);

      if (index === -1) {
        return [savedExercise, ...current];
      }

      const next = [...current];
      next[index] = savedExercise;
      return next;
    });

    setStatus("Exercício salvo.");
    setEditingExerciseId(null);
  }

  async function handleDelete(exercise: ExerciseRecord) {
    const confirmed = window.confirm("Tem certeza que deseja deletar este exercício?");
    if (!confirmed) return;

    setDeletingId(exercise.id);
    setError(null);
    setStatus(null);

    try {
      const response = await fetchWithAuth("/api/admin/exercises", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ id: exercise.id })
      });

      if (!response.ok) {
        const result = await parseJsonResponse<{ success: false; error?: string }>(response);
        throw new Error(result.error ?? "Erro ao deletar");
      }

      setExercises((current) => current.filter((item) => item.id !== exercise.id));
      setStatus("Exercício deletado.");

      if (editingExerciseId === exercise.id) {
        setEditingExerciseId(null);
      }
    } catch (deleteError) {
      setError(getRequestErrorMessage(deleteError, "Erro ao deletar"));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <AdminExerciseForm
        initialValues={editingExercise}
        onSaved={handleSaved}
        onCancel={() => setEditingExerciseId(null)}
      />

      <div className="space-y-3">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar exercício..."
          className="min-h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none transition focus:border-primary"
        />
        <div className="min-h-6 text-sm">
          {error ? <p className="text-red-300">{error}</p> : null}
          {!error && status ? <p className="text-primary">{status}</p> : null}
        </div>
      </div>

      <AdminTable headers={["Nome", "Grupo muscular", "Tipo", "Nível", "Tags", "Ação"]}>
        {loading ? (
          <tr>
            <td colSpan={6} className="px-5 py-8 text-sm text-white/60">
              Carregando exercícios...
            </td>
          </tr>
        ) : exercises.length ? (
          exercises.map((exercise) => (
            <tr key={exercise.id} className="border-b border-white/8 last:border-b-0">
              <td className="px-5 py-4 text-sm text-white">{exercise.name}</td>
              <td className="px-5 py-4 text-sm text-white/72">{formatExerciseMuscleGroups(exercise)}</td>
              <td className="px-5 py-4 text-sm text-white/72">{formatExerciseTypeLabel(exercise.type ?? exercise.metadata?.type ?? null)}</td>
              <td className="px-5 py-4 text-sm text-white/72">{getLevelSummary(exercise)}</td>
              <td className="px-5 py-4 text-sm text-white/72">{getTagSummary(exercise)}</td>
              <td className="px-5 py-4 text-sm">
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    className="px-0 py-0"
                    onClick={() => setEditingExerciseId(exercise.id)}
                  >
                    Editar
                  </Button>
                  <button
                    type="button"
                    onClick={() => handleDelete(exercise)}
                    disabled={deletingId === exercise.id}
                    className="text-xs font-semibold text-red-300 transition hover:text-red-200 disabled:opacity-50"
                  >
                    {deletingId === exercise.id ? "Deletando..." : "Deletar"}
                  </button>
                </div>
              </td>
            </tr>
          ))
        ) : (
          <tr>
            <td colSpan={6} className="px-5 py-8 text-sm text-white/60">
              Nenhum exercício encontrado.
            </td>
          </tr>
        )}
      </AdminTable>
    </div>
  );
}

function getLevelSummary(exercise: ExerciseRecord) {
  const level = Array.isArray(exercise.level)
    ? exercise.level
    : exercise.level
      ? [exercise.level]
      : Array.isArray(exercise.metadata?.level)
        ? exercise.metadata.level
        : exercise.metadata?.level
          ? [exercise.metadata.level]
          : [];

  return level.join(", ") || "-";
}

function getTagSummary(exercise: ExerciseRecord) {
  if (exercise.tags?.length) {
    return exercise.tags.join(", ");
  }

  return [
    formatExerciseMuscleGroups(exercise),
    formatExerciseTypeLabel(exercise.type ?? exercise.metadata?.type ?? null),
    ...(exercise.location ?? exercise.metadata?.location ?? []),
    ...(exercise.equipment ?? exercise.metadata?.equipment ?? [])
  ]
    .filter(Boolean)
    .join(", ") || "-";
}
