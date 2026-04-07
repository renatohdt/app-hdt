"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminExerciseForm } from "@/components/admin-exercise-form";
import { AdminTable } from "@/components/admin-table";
import { Button, Card } from "@/components/ui";
import { getRequestErrorMessage, parseJsonResponse } from "@/lib/api";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import {
  EXERCISE_EQUIPMENT_OPTIONS,
  EXERCISE_LEVEL_OPTIONS,
  EXERCISE_MUSCLE_OPTIONS,
  formatExerciseEquipmentLabel,
  formatExerciseLevelLabel,
  formatExerciseMuscleGroups,
  formatExerciseTypeLabel,
  getExerciseEquipment,
  getExerciseLevels,
  getExerciseMuscleGroups
} from "@/lib/exercise-library";
import { ExerciseRecord } from "@/lib/types";

type FilterState = {
  muscleGroup: string;
  level: string;
  equipment: string;
};

type CoverageItem = {
  value: string;
  label: string;
  count: number;
};

type CoverageSection = {
  key: string;
  title: string;
  items: CoverageItem[];
  covered: number;
};

const PAGE_SIZE = 10;

const emptyFilters: FilterState = {
  muscleGroup: "",
  level: "",
  equipment: ""
};

export function AdminExercisesManager({ initialExercises }: { initialExercises: ExerciseRecord[] }) {
  const [exercises, setExercises] = useState(initialExercises);
  const [catalogExercises, setCatalogExercises] = useState(initialExercises);
  const [editingExerciseId, setEditingExerciseId] = useState<string | null>(null);
  const [loading, setLoading] = useState(initialExercises.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  const normalizedSearch = useMemo(() => search.trim(), [search]);
  const hasActiveFilters = Boolean(
    normalizedSearch || filters.muscleGroup || filters.level || filters.equipment
  );
  const editingExercise =
    catalogExercises.find((exercise) => exercise.id === editingExerciseId) ??
    exercises.find((exercise) => exercise.id === editingExerciseId) ??
    null;
  const totalExercises = exercises.length;
  const totalPages = Math.max(1, Math.ceil(totalExercises / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStart = totalExercises ? (safeCurrentPage - 1) * PAGE_SIZE : 0;
  const pageEnd = totalExercises ? Math.min(pageStart + PAGE_SIZE, totalExercises) : 0;
  const paginatedExercises = useMemo(
    () => exercises.slice(pageStart, pageEnd),
    [exercises, pageEnd, pageStart]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [normalizedSearch, filters.equipment, filters.level, filters.muscleGroup]);

  useEffect(() => {
    if (currentPage !== safeCurrentPage) {
      setCurrentPage(safeCurrentPage);
    }
  }, [currentPage, safeCurrentPage]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const timeoutId = window.setTimeout(async () => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();

        if (normalizedSearch) {
          params.set("search", normalizedSearch);
        }

        if (filters.muscleGroup) {
          params.set("muscle_group", filters.muscleGroup);
        }

        if (filters.level) {
          params.set("level", filters.level);
        }

        if (filters.equipment) {
          params.set("equipment", filters.equipment);
        }

        const query = params.size ? `?${params.toString()}` : "";
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

        const nextExercises = result.data ?? [];
        setExercises(nextExercises);

        if (!hasActiveFilters) {
          setCatalogExercises(nextExercises);
        } else if (!catalogExercises.length && nextExercises.length) {
          setCatalogExercises(nextExercises);
        }
      } catch (loadError) {
        if (!active || controller.signal.aborted) return;
        setError(getRequestErrorMessage(loadError, "Não foi possível carregar os exercícios."));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }, 250);

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [
    catalogExercises.length,
    filters.equipment,
    filters.level,
    filters.muscleGroup,
    hasActiveFilters,
    normalizedSearch,
    refreshKey
  ]);

  const coverageSections = useMemo<CoverageSection[]>(
    () => [
      buildCoverageSection({
        key: "muscle-groups",
        title: "Grupo muscular",
        options: EXERCISE_MUSCLE_OPTIONS,
        exercises,
        extractor: getExerciseMuscleGroups
      }),
      buildCoverageSection({
        key: "level",
        title: "Nível",
        options: EXERCISE_LEVEL_OPTIONS,
        exercises,
        extractor: getExerciseLevels
      }),
      buildCoverageSection({
        key: "equipment",
        title: "Material",
        options: EXERCISE_EQUIPMENT_OPTIONS,
        exercises,
        extractor: getExerciseEquipment
      })
    ],
    [exercises]
  );

  const overviewStats = useMemo(
    () => [
      {
        label: hasActiveFilters ? "Exercícios no recorte" : "Exercícios na biblioteca",
        value: exercises.length
      },
      {
        label: "Grupos cobertos",
        value: coverageSections[0]?.covered ?? 0
      },
      {
        label: "Níveis cobertos",
        value: coverageSections[1]?.covered ?? 0
      },
      {
        label: "Materiais cobertos",
        value: coverageSections[2]?.covered ?? 0
      }
    ],
    [coverageSections, exercises.length, hasActiveFilters]
  );

  function handleSaved(savedExercise: ExerciseRecord) {
    setCatalogExercises((current) => upsertExercise(current, savedExercise));
    setStatus("Biblioteca atualizada com sucesso.");
    setError(null);
    setEditingExerciseId(null);
    setRefreshKey((current) => current + 1);
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
        throw new Error(result.error ?? "Erro ao deletar.");
      }

      setExercises((current) => current.filter((item) => item.id !== exercise.id));
      setCatalogExercises((current) => current.filter((item) => item.id !== exercise.id));
      setStatus("Exercício deletado.");

      if (editingExerciseId === exercise.id) {
        setEditingExerciseId(null);
      }

      setRefreshKey((current) => current + 1);
    } catch (deleteError) {
      setError(getRequestErrorMessage(deleteError, "Erro ao deletar."));
    } finally {
      setDeletingId(null);
    }
  }

  function handleClearFilters() {
    setSearch("");
    setFilters(emptyFilters);
  }

  return (
    <div className="space-y-6">
      <AdminExerciseForm
        initialValues={editingExercise}
        existingExercises={catalogExercises}
        onSaved={handleSaved}
        onCancel={() => setEditingExerciseId(null)}
      />

      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">Busca e filtros</p>
            <p className="text-sm text-white/60">
              Combine busca textual com grupo muscular, nível e material para enxergar melhor a cobertura da
              biblioteca.
            </p>
          </div>
          {hasActiveFilters ? (
            <Button type="button" variant="secondary" onClick={handleClearFilters}>
              Limpar filtros
            </Button>
          ) : null}
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,0.8fr))]">
          <label className="grid gap-2">
            <span className="text-sm text-white/72">Busca textual</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome, grupo, nível ou material..."
              className="min-h-12 rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none transition focus:border-primary"
            />
          </label>

          <FilterSelect
            label="Grupo muscular"
            value={filters.muscleGroup}
            options={EXERCISE_MUSCLE_OPTIONS}
            placeholder="Todos"
            onChange={(value) => setFilters((current) => ({ ...current, muscleGroup: value }))}
          />

          <FilterSelect
            label="Nível"
            value={filters.level}
            options={EXERCISE_LEVEL_OPTIONS}
            placeholder="Todos"
            onChange={(value) => setFilters((current) => ({ ...current, level: value }))}
          />

          <FilterSelect
            label="Material"
            value={filters.equipment}
            options={EXERCISE_EQUIPMENT_OPTIONS}
            placeholder="Todos"
            onChange={(value) => setFilters((current) => ({ ...current, equipment: value }))}
          />
        </div>

        <div className="min-h-6 text-sm">
          {error ? <p className="text-red-300">{error}</p> : null}
          {!error && status ? <p className="text-primary">{status}</p> : null}
          {!error && !status ? (
            <p className="text-white/50">
              {loading
                ? "Atualizando listagem..."
                : hasActiveFilters
                  ? `${totalExercises} exercício(s) no recorte atual.`
                  : `${totalExercises} exercício(s) disponíveis na biblioteca.`}
            </p>
          ) : null}
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {overviewStats.map((stat) => (
          <Card key={stat.label} className="flex min-h-[8.5rem] flex-col justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">{stat.label}</p>
            <p className="text-3xl font-semibold text-white">{stat.value}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {coverageSections.map((section) => (
          <CoverageCard
            key={section.key}
            section={section}
            emptyState={loading ? "Carregando contagens..." : "Nenhum exercício encontrado neste recorte."}
          />
        ))}
      </div>

      <AdminTable headers={["Nome", "Grupo muscular", "Tipo", "Nível", "Material", "Ação"]}>
        {loading ? (
          <tr>
            <td colSpan={6} className="px-5 py-8 text-sm text-white/60">
              Carregando exercícios...
            </td>
          </tr>
        ) : paginatedExercises.length ? (
          paginatedExercises.map((exercise) => (
            <tr key={exercise.id} className="border-b border-white/8 last:border-b-0">
              <td className="px-5 py-4 text-sm text-white">{exercise.name}</td>
              <td className="px-5 py-4 text-sm text-white/72">{formatExerciseMuscleGroups(exercise)}</td>
              <td className="px-5 py-4 text-sm text-white/72">
                {formatExerciseTypeLabel(exercise.type ?? exercise.metadata?.type ?? null)}
              </td>
              <td className="px-5 py-4 text-sm text-white/72">{getLevelSummary(exercise)}</td>
              <td className="px-5 py-4 text-sm text-white/72">{getEquipmentSummary(exercise)}</td>
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

      {totalExercises ? (
        <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-white/60">
            Exibindo{" "}
            <span className="font-semibold text-white">
              {pageStart + 1}-{pageEnd}
            </span>{" "}
            de <span className="font-semibold text-white">{totalExercises}</span>
            {totalPages > 1 ? (
              <>
                {" "}
                <span className="text-white/28">•</span>{" "}
                Página <span className="font-semibold text-white">{safeCurrentPage}</span> de{" "}
                <span className="font-semibold text-white">{totalPages}</span>
              </>
            ) : null}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              disabled={safeCurrentPage === 1}
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            >
              Página anterior
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={safeCurrentPage >= totalPages}
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
            >
              Próxima página
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function CoverageCard({
  section,
  emptyState
}: {
  section: CoverageSection;
  emptyState: string;
}) {
  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm font-semibold text-white">{section.title}</p>
        <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/60">
          {section.covered}/{section.items.length} cobertos
        </span>
      </div>

      {section.items.some((item) => item.count > 0) ? (
        <div className={`grid gap-2 ${section.items.length > 8 ? "sm:grid-cols-2" : ""}`}>
          {section.items.map((item) => (
            <div
              key={`${section.key}-${item.value}`}
              className={`flex items-center justify-between gap-3 rounded-2xl border px-3 py-2 text-sm ${
                item.count > 0
                  ? "border-white/10 bg-white/[0.03] text-white/78"
                  : "border-white/6 bg-black/20 text-white/38"
              }`}
            >
              <span className="truncate">{item.label}</span>
              <span className="rounded-full border border-white/10 px-2 py-1 text-xs font-semibold text-white/78">
                {item.count}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-white/10 bg-black/20 px-4 py-5 text-sm text-white/50">{emptyState}</p>
      )}
    </Card>
  );
}

function FilterSelect({
  label,
  value,
  options,
  placeholder,
  onChange
}: {
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm text-white/72">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-12 rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none transition focus:border-primary"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function getLevelSummary(exercise: ExerciseRecord) {
  const levels = getExerciseLevels(exercise);
  return levels.length ? levels.map((level) => formatExerciseLevelLabel(level)).join(", ") : "-";
}

function getEquipmentSummary(exercise: ExerciseRecord) {
  const equipment = getExerciseEquipment(exercise);
  return equipment.length ? equipment.map((item) => formatExerciseEquipmentLabel(item)).join(", ") : "-";
}

function buildCoverageSection({
  key,
  title,
  options,
  exercises,
  extractor
}: {
  key: string;
  title: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  exercises: ExerciseRecord[];
  extractor: (exercise: ExerciseRecord) => string[];
}): CoverageSection {
  const items = options
    .map((option) => ({
      value: option.value,
      label: option.label,
      count: exercises.reduce((total, exercise) => {
        const values = new Set(extractor(exercise));
        return total + (values.has(option.value) ? 1 : 0);
      }, 0)
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "pt-BR"));

  const covered = items.filter((item) => item.count > 0).length;

  return {
    key,
    title,
    items,
    covered
  };
}

function upsertExercise(exercises: ExerciseRecord[], savedExercise: ExerciseRecord) {
  const index = exercises.findIndex((exercise) => exercise.id === savedExercise.id);

  if (index === -1) {
    return [savedExercise, ...exercises];
  }

  const next = [...exercises];
  next[index] = savedExercise;
  return next;
}
