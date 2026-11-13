"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { AdminExerciseForm } from "@/components/admin-exercise-form";
import { AdminTable } from "@/components/admin-table";
import { Button, Card } from "@/components/ui";
import { getRequestErrorMessage, parseJsonResponse } from "@/lib/api";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import {
  EXERCISE_EQUIPMENT_OPTIONS,
  EXERCISE_LEVEL_OPTIONS,
  EXERCISE_LOCATION_OPTIONS,
  EXERCISE_MUSCLE_OPTIONS,
  EXERCISE_TRAINING_STYLE_OPTIONS,
  EXERCISE_TYPE_OPTIONS,
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
  location: string;
  trainingStyle: string;
  type: string;
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

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

const emptyFilters: FilterState = {
  muscleGroup: "",
  level: "",
  equipment: "",
  location: "",
  trainingStyle: "",
  type: ""
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
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  // Formulário abre num painel lateral por cima da lista (não perde a posição ao editar).
  const [formOpen, setFormOpen] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const normalizedSearch = useMemo(() => search.trim(), [search]);
  const hasActiveFilters = Boolean(
    normalizedSearch || filters.muscleGroup || filters.level || filters.equipment ||
    filters.location || filters.trainingStyle || filters.type
  );
  const editingExercise =
    catalogExercises.find((exercise) => exercise.id === editingExerciseId) ??
    exercises.find((exercise) => exercise.id === editingExerciseId) ??
    null;
  const totalExercises = exercises.length;
  const totalPages = Math.max(1, Math.ceil(totalExercises / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStart = totalExercises ? (safeCurrentPage - 1) * pageSize : 0;
  const pageEnd = totalExercises ? Math.min(pageStart + pageSize, totalExercises) : 0;
  const sortedExercises = useMemo(() => {
    const list = [...exercises].sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
    return sortDir === "asc" ? list : list.reverse();
  }, [exercises, sortDir]);
  const paginatedExercises = useMemo(
    () => sortedExercises.slice(pageStart, pageEnd),
    [sortedExercises, pageEnd, pageStart]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [normalizedSearch, filters.equipment, filters.level, filters.muscleGroup, filters.location, filters.trainingStyle, filters.type, pageSize, sortDir]);

  // Painel aberto: Esc fecha e a página de trás não rola.
  useEffect(() => {
    if (!formOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setFormOpen(false);
        setEditingExerciseId(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [formOpen]);

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

        if (filters.location) {
          params.set("location", filters.location);
        }

        if (filters.trainingStyle) {
          params.set("training_style", filters.trainingStyle);
        }

        if (filters.type) {
          params.set("type", filters.type);
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
    filters.location,
    filters.trainingStyle,
    filters.type,
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
    const wasEditing = Boolean(editingExerciseId);
    setCatalogExercises((current) => upsertExercise(current, savedExercise));
    setStatus(wasEditing ? "Exercício atualizado." : "Exercício salvo.");
    setError(null);
    setEditingExerciseId(null);
    // Edição: fecha o painel e volta para a lista onde estava.
    // Novo: mantém o painel aberto (o formulário já limpa) para cadastrar o próximo.
    if (wasEditing) setFormOpen(false);
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
        setFormOpen(false);
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

  function handleEditExercise(id: string) {
    setEditingExerciseId(id);
    setFormOpen(true);
  }

  function handleNewExercise() {
    setEditingExerciseId(null);
    setFormOpen(true);
  }

  function handleCloseForm() {
    setFormOpen(false);
    setEditingExerciseId(null);
  }

  function goToPage(page: number) {
    setCurrentPage(Math.min(totalPages, Math.max(1, page)));
    // Volta para o topo da lista (evita rolar de volta manualmente).
    window.setTimeout(() => {
      listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  const coverageSummary = `${exercises.length} exercício(s) · ${overviewStats[1]?.value ?? 0} grupos · ${
    overviewStats[2]?.value ?? 0
  } níveis · ${overviewStats[3]?.value ?? 0} materiais`;

  return (
    <div className="space-y-4">
      {/* Busca e filtros — ficam fixos no topo ao rolar a lista */}
      <Card className="sticky top-0 z-30 space-y-3 !p-4 sm:!p-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome, grupo, nível ou material..."
            aria-label="Busca textual"
            className="min-h-11 min-w-[12rem] flex-1 rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none transition focus:border-primary"
          />
          {hasActiveFilters ? (
            <Button type="button" variant="secondary" className="min-h-11 px-4" onClick={handleClearFilters}>
              Limpar filtros
            </Button>
          ) : null}
          <Button type="button" className="min-h-11 px-4" onClick={handleNewExercise}>
            + Novo exercício
          </Button>
        </div>

        <div className="grid grid-cols-2 items-end gap-2 md:grid-cols-3 lg:grid-cols-6">
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
          <FilterSelect
            label="Local de treino"
            value={filters.location}
            options={EXERCISE_LOCATION_OPTIONS}
            placeholder="Todos"
            onChange={(value) => setFilters((current) => ({ ...current, location: value }))}
          />
          <FilterSelect
            label="Estilo de treino"
            value={filters.trainingStyle}
            options={EXERCISE_TRAINING_STYLE_OPTIONS}
            placeholder="Todos"
            onChange={(value) => setFilters((current) => ({ ...current, trainingStyle: value }))}
          />
          <FilterSelect
            label="Tipo"
            value={filters.type}
            options={EXERCISE_TYPE_OPTIONS}
            placeholder="Todos"
            onChange={(value) => setFilters((current) => ({ ...current, type: value }))}
          />
        </div>

        <div className="min-h-5 text-sm">
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

      <div ref={listRef} className="scroll-mt-64">
        <AdminTable headers={["Nome", "Grupo muscular", "Tipo", "Nível", "Material", "Ação"]}>
          {loading ? (
            <tr>
              <td colSpan={6} className="px-5 py-8 text-sm text-white/60">
                Carregando exercícios...
              </td>
            </tr>
          ) : paginatedExercises.length ? (
            paginatedExercises.map((exercise) => (
              <tr key={exercise.id} className="border-b border-white/8 last:border-b-0 hover:bg-white/[0.02]">
                <td className="px-5 py-2.5 text-sm text-white">{exercise.name}</td>
                <td className="px-5 py-2.5 text-sm text-white/72">{formatExerciseMuscleGroups(exercise)}</td>
                <td className="px-5 py-2.5 text-sm text-white/72">
                  {formatExerciseTypeLabel(exercise.type ?? exercise.metadata?.type ?? null)}
                </td>
                <td className="px-5 py-2.5 text-sm text-white/72">{getLevelSummary(exercise)}</td>
                <td className="px-5 py-2.5 text-sm text-white/72">{getEquipmentSummary(exercise)}</td>
                <td className="px-5 py-2.5 text-sm">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleEditExercise(exercise.id)}
                      className="text-xs font-semibold text-white/72 transition hover:text-white"
                    >
                      Editar
                    </button>
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

      {totalExercises ? (
        <Card className="flex flex-col gap-3 !p-4 sm:!p-4 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-sm text-white/60">
            Exibindo{" "}
            <span className="font-semibold text-white">
              {pageStart + 1}-{pageEnd}
            </span>{" "}
            de <span className="font-semibold text-white">{totalExercises}</span>
          </p>

          {totalPages > 1 ? (
            <div className="flex flex-wrap items-center gap-1">
              <PageButton label="‹" ariaLabel="Página anterior" disabled={safeCurrentPage === 1} onClick={() => goToPage(safeCurrentPage - 1)} />
              {getPageNumbers(safeCurrentPage, totalPages).map((page, index) =>
                page === "gap" ? (
                  <span key={`gap-${index}`} className="px-1 text-sm text-white/35">
                    …
                  </span>
                ) : (
                  <PageButton
                    key={page}
                    label={String(page)}
                    active={page === safeCurrentPage}
                    onClick={() => goToPage(page)}
                  />
                )
              )}
              <PageButton label="›" ariaLabel="Próxima página" disabled={safeCurrentPage >= totalPages} onClick={() => goToPage(safeCurrentPage + 1)} />
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 text-xs text-white/60">
            <label className="flex items-center gap-2">
              Ordem
              <select
                value={sortDir}
                onChange={(event) => setSortDir(event.target.value === "desc" ? "desc" : "asc")}
                className="min-h-9 rounded-xl border border-white/10 bg-black/20 px-2 text-sm text-white outline-none focus:border-primary"
              >
                <option value="asc">A → Z</option>
                <option value="desc">Z → A</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              Por página
              <select
                value={pageSize}
                onChange={(event) => setPageSize(Number(event.target.value))}
                className="min-h-9 rounded-xl border border-white/10 bg-black/20 px-2 text-sm text-white outline-none focus:border-primary"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </Card>
      ) : null}

      {/* Cobertura — recolhida por padrão, abre quando precisar */}
      <details className="group rounded-[28px] border border-white/10 bg-black/20">
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
          <span className="text-sm font-semibold text-white">Cobertura da biblioteca</span>
          <span className="flex items-center gap-2 text-xs text-white/50">
            {loading ? "Carregando..." : coverageSummary}
            <span className="inline-block transition group-open:rotate-180">▾</span>
          </span>
        </summary>
        <div className="space-y-4 border-t border-white/10 p-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {overviewStats.map((stat) => (
              <div key={stat.label} className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">{stat.label}</p>
                <p className="mt-1 text-2xl font-semibold text-white">{stat.value}</p>
              </div>
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
        </div>
      </details>

      {formOpen ? (
        <FormDrawer title={editingExerciseId ? "Editar exercício" : "Novo exercício"} onClose={handleCloseForm}>
          <AdminExerciseForm
            key={editingExerciseId ?? "new"}
            initialValues={editingExercise}
            existingExercises={catalogExercises}
            onSaved={handleSaved}
            onCancel={handleCloseForm}
          />
        </FormDrawer>
      ) : null}
    </div>
  );
}

function FormDrawer({
  title,
  onClose,
  children
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        aria-label="Fechar painel"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
      />
      <div className="relative flex h-full w-full max-w-2xl flex-col border-l border-white/10 bg-[#0b0b0b] shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <p className="text-sm font-semibold text-white">{title}</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:bg-white/10"
          >
            Fechar ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 sm:p-4">{children}</div>
      </div>
    </div>
  );
}

function PageButton({
  label,
  ariaLabel,
  active = false,
  disabled = false,
  onClick
}: {
  label: string;
  ariaLabel?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel ?? `Página ${label}`}
      aria-current={active ? "page" : undefined}
      disabled={disabled}
      onClick={onClick}
      className={`min-h-9 min-w-9 rounded-xl border px-2 text-sm font-semibold transition disabled:opacity-40 ${
        active
          ? "border-primary/50 bg-primary/15 text-primary"
          : "border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/10"
      }`}
    >
      {label}
    </button>
  );
}

// Ex.: página 6 de 13 → [1, "gap", 5, 6, 7, "gap", 13]
function getPageNumbers(current: number, total: number): Array<number | "gap"> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }
  const pages = [...new Set([1, total, current - 1, current, current + 1])]
    .filter((page) => page >= 1 && page <= total)
    .sort((left, right) => left - right);
  const result: Array<number | "gap"> = [];
  pages.forEach((page, index) => {
    const previous = pages[index - 1];
    if (previous !== undefined && page - previous > 1) result.push("gap");
    result.push(page);
  });
  return result;
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
      <span className="text-xs text-white/72">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-10 rounded-2xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none transition focus:border-primary"
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