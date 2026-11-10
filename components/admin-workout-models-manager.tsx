"use client";

import clsx from "clsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card } from "@/components/ui";
import { getRequestErrorMessage, parseJsonResponse } from "@/lib/api";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import {
  MODEL_BLOCKS,
  MODEL_DAY_LETTERS,
  MODEL_DURATIONS,
  MODEL_GOALS,
  MODEL_LEVELS,
  MODEL_MAX_SLOTS,
  MODEL_MUSCLES,
  MODEL_SLOT_TYPES,
  MODEL_SPLITS,
  MODEL_STYLES,
  MODEL_TECHNIQUES,
  labelOf,
  muscleLabel
} from "@/lib/workout-model-options";
import { matchesTemplateSlot, type TemplateSlot } from "@/lib/workout-templates";

type CoverageItem = {
  name: string;
  primaryMuscles: string[];
  movementType: string;
  isWarmup: boolean;
  levels: string[];
  locations: string[];
};

type ModelRow = {
  id: string;
  code: string;
  name: string;
  split_type: string;
  level: string;
  training_styles: string[];
  goals: string[];
  durations: number[];
  days: Record<string, TemplateSlot[]>;
  status: "draft" | "ready";
  notes: string | null;
  updated_at: string;
};

type SlotDraft = {
  key: string;
  role: string;
  muscle: string;
  type: string;
  block: string;
  cut: string;
  technique: string;
  altMuscle: string;
  altType: string;
};

type Draft = {
  id?: string;
  code: string;
  name: string;
  split_type: string;
  level: string;
  training_styles: string[];
  goals: string[];
  durations: number[];
  status: "draft" | "ready";
  notes: string;
  days: { day: string; slots: SlotDraft[] }[];
};

const ENDPOINT = "/api/admin/workout-models";
let keySeed = 0;
const newKey = () => `s${Date.now().toString(36)}${(keySeed += 1)}`;

const emptySlot = (type = "compound"): SlotDraft => ({
  key: newKey(),
  role: type === "warmup" ? "Aquecimento" : "",
  muscle: "",
  type,
  block: "",
  cut: "",
  technique: "",
  altMuscle: "",
  altType: ""
});

function defaultDays(split: string) {
  return MODEL_SPLITS.find((item) => item.value === split)?.days ?? ["A"];
}

function newDraft(): Draft {
  return {
    code: "",
    name: "",
    split_type: "full_body_ab",
    level: "intermediate",
    training_styles: ["musculacao", "personal"],
    goals: ["hypertrophy"],
    durations: [],
    status: "draft",
    notes: "",
    days: defaultDays("full_body_ab").map((day) => ({ day, slots: [emptySlot()] }))
  };
}

function toDraft(model: ModelRow): Draft {
  const days = Object.keys(model.days ?? {})
    .sort()
    .map((day) => ({
      day,
      slots: (model.days[day] ?? []).map((slot) => {
        const alt = slot.alsoAccept?.[0];
        return {
          key: newKey(),
          role: slot.role ?? "",
          muscle: (slot.muscles ?? []).join(","),
          type: slot.type,
          block: slot.block ?? "",
          cut: slot.cut ? String(slot.cut) : "",
          technique: slot.technique ?? "",
          altMuscle: (alt?.muscles ?? []).join(","),
          altType: alt?.type ?? ""
        };
      })
    }));
  return {
    id: model.id,
    code: model.code,
    name: model.name,
    split_type: model.split_type,
    level: model.level,
    training_styles: model.training_styles ?? [],
    goals: model.goals ?? [],
    durations: model.durations ?? [],
    status: model.status,
    notes: model.notes ?? "",
    days
  };
}

function draftSlotToTemplate(slot: SlotDraft, n: number): TemplateSlot {
  return {
    n,
    role: slot.role,
    muscles: slot.type === "warmup" ? [] : slot.muscle.split(",").filter(Boolean),
    type: slot.type as TemplateSlot["type"],
    block: slot.block || undefined,
    cut: slot.cut ? Number(slot.cut) : undefined,
    technique: (slot.technique || undefined) as TemplateSlot["technique"],
    alsoAccept:
      slot.altMuscle || slot.altType
        ? [{ muscles: slot.altMuscle.split(",").filter(Boolean), type: (slot.altType || undefined) as TemplateSlot["type"] | undefined }]
        : undefined
  };
}

/** Quantos exercícios do catálogo servem para a vaga no nível do modelo (casa x academia/condomínio). */
function slotCoverage(slot: SlotDraft, level: string, catalog: CoverageItem[]) {
  if (slot.type !== "warmup" && !slot.muscle) return null;
  const target = draftSlotToTemplate(slot, 1);
  const matches = catalog.filter(
    (item) => (slot.type === "warmup" || item.levels.includes(level)) && matchesTemplateSlot(target, item)
  );
  return {
    home: matches.filter((item) => item.locations.includes("home")).length,
    gym: matches.filter((item) => item.locations.some((location) => location === "gym" || location === "condo_gym")).length,
    names: matches.map((item) => item.name)
  };
}

function coverageTone(count: number) {
  if (count === 0) return "border-red-400/40 bg-red-500/10 text-red-200";
  if (count <= 2) return "border-amber-400/40 bg-amber-500/10 text-amber-200";
  return "border-primary/30 bg-primary/10 text-primary";
}

function dayWarnings(slots: SlotDraft[], level: string, catalog: CoverageItem[] | null) {
  const warnings: string[] = [];
  const work = slots.filter((slot) => slot.type !== "warmup");
  if (work.length >= 5 && !slots.some((slot) => slot.cut)) {
    warnings.push("Nenhuma vaga tem Corte: se o tempo do aluno for curto, o app não tem vaga para tirar e o treino passa do tempo.");
  }
  const counts = new Map<string, number>();
  slots.forEach((slot) => slot.block && counts.set(slot.block, (counts.get(slot.block) ?? 0) + 1));
  counts.forEach((count, block) => {
    if (count < 2) warnings.push(`O bloco ${block} tem só 1 exercício.`);
  });
  if (catalog) {
    slots.forEach((slot, index) => {
      const coverage = slotCoverage(slot, level, catalog);
      if (coverage && coverage.home === 0 && coverage.gym === 0) {
        warnings.push(`Vaga ${index + 1} (${slot.role || "sem papel"}): nenhum exercício no catálogo para este nível. O app vai relaxar o tipo ou deixar a vaga vazia.`);
      }
    });
  }
  return warnings;
}

function toBody(draft: Draft) {
  const days: Record<string, unknown[]> = {};
  for (const { day, slots } of draft.days) {
    days[day] = slots.map((slot, index) => draftSlotToTemplate(slot, index + 1));
  }
  return {
    id: draft.id,
    code: draft.code,
    name: draft.name,
    split_type: draft.split_type,
    level: draft.level,
    training_styles: draft.training_styles,
    goals: draft.goals,
    durations: draft.durations,
    status: draft.status,
    notes: draft.notes,
    days
  };
}

const inputClass =
  "w-full min-w-0 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[13px] text-white outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20 [&_option]:bg-white [&_option]:text-black";
const labelClass = "text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55";

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        "rounded-full border px-3 py-1.5 text-[12px] font-medium transition",
        active ? "border-primary/50 bg-primary/15 text-primary" : "border-white/10 text-white/60 hover:border-white/25 hover:text-white"
      )}
    >
      {children}
    </button>
  );
}

function toggle<T>(list: T[], value: T) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export function AdminWorkoutModelsManager() {
  const [models, setModels] = useState<ModelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filters, setFilters] = useState({ split: "", level: "", status: "", search: "" });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CoverageItem[] | null>(null);

  useEffect(() => {
    if (!draft || catalog) return;
    let active = true;
    void (async () => {
      try {
        const response = await fetchWithAuth(`${ENDPOINT}?catalog=1`, { headers: { "Content-Type": "application/json" } });
        const result = await parseJsonResponse<{ success: boolean; data?: CoverageItem[] }>(response);
        if (active && response.ok && result.success) setCatalog(result.data ?? []);
      } catch {
        // Cobertura é só ajuda visual; sem ela o editor continua funcionando.
      }
    })();
    return () => {
      active = false;
    };
  }, [draft, catalog]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithAuth(ENDPOINT, { headers: { "Content-Type": "application/json" } });
      const result = await parseJsonResponse<{ success: boolean; data?: ModelRow[]; error?: string }>(response);
      if (!response.ok || !result.success) throw new Error(result.error ?? "Não foi possível carregar os modelos.");
      setModels(result.data ?? []);
    } catch (loadError) {
      setError(getRequestErrorMessage(loadError, "Não foi possível carregar os modelos."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return models.filter(
      (model) =>
        (!filters.split || model.split_type === filters.split) &&
        (!filters.level || model.level === filters.level) &&
        (!filters.status || model.status === filters.status) &&
        (!search || `${model.code} ${model.name}`.toLowerCase().includes(search))
    );
  }, [models, filters]);

  const readyCount = models.filter((model) => model.status === "ready").length;

  // Perfis cobertos: nível × estilo × objetivo com pelo menos 1 modelo Pronto.
  const profileCoverage = useMemo(() => {
    const cells = new Map<string, ModelRow[]>();
    for (const model of models) {
      if (model.status !== "ready") continue;
      for (const style of model.training_styles) {
        for (const goal of model.goals) {
          const key = `${model.level}|${style}|${goal}`;
          cells.set(key, [...(cells.get(key) ?? []), model]);
        }
      }
    }
    return cells;
  }, [models]);
  const coveredProfiles = profileCoverage.size;
  const totalProfiles = MODEL_LEVELS.length * MODEL_STYLES.length * MODEL_GOALS.length;

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetchWithAuth(ENDPOINT, {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toBody(draft))
      });
      const result = await parseJsonResponse<{ success: boolean; data?: ModelRow; error?: string }>(response);
      if (!response.ok || !result.success || !result.data) throw new Error(result.error ?? "Não foi possível salvar o modelo.");
      setNotice(`Modelo ${result.data.code} salvo${result.data.status === "ready" ? " como Pronto" : " como rascunho"}.`);
      setDraft(null);
      await load();
    } catch (saveError) {
      setError(getRequestErrorMessage(saveError, "Não foi possível salvar o modelo."));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      const response = await fetchWithAuth(ENDPOINT, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      const result = await parseJsonResponse<{ success: boolean; error?: string }>(response);
      if (!response.ok || !result.success) throw new Error(result.error ?? "Não foi possível excluir o modelo.");
      setConfirmDelete(null);
      setNotice("Modelo excluído.");
      await load();
    } catch (deleteError) {
      setError(getRequestErrorMessage(deleteError, "Não foi possível excluir o modelo."));
    }
  }

  function duplicate(model: ModelRow) {
    const copy = toDraft(model);
    setDraft({ ...copy, id: undefined, code: `${model.code}-COPIA`.slice(0, 30), name: `${model.name} (cópia)`, status: "draft" });
    setNotice(null);
  }

  // ---------- Editor ----------
  if (draft) {
    const update = (patch: Partial<Draft>) => setDraft((current) => (current ? { ...current, ...patch } : current));
    const updateSlot = (dayIndex: number, slotIndex: number, patch: Partial<SlotDraft>) =>
      setDraft((current) => {
        if (!current) return current;
        const days = current.days.map((entry, i) =>
          i !== dayIndex ? entry : { ...entry, slots: entry.slots.map((slot, j) => (j === slotIndex ? { ...slot, ...patch } : slot)) }
        );
        return { ...current, days };
      });
    const updateSlots = (dayIndex: number, fn: (slots: SlotDraft[]) => SlotDraft[]) =>
      setDraft((current) =>
        current ? { ...current, days: current.days.map((entry, i) => (i === dayIndex ? { ...entry, slots: fn(entry.slots) } : entry)) } : current
      );
    const nextLetter = MODEL_DAY_LETTERS.find((letter) => !draft.days.some((entry) => entry.day === letter));

    return (
      <div className="space-y-6">
        <Card className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-white">{draft.id ? `Editar ${draft.code}` : "Novo modelo"}</h3>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setDraft(null)} disabled={saving} className="min-h-10 px-4 text-[13px]">
                Cancelar
              </Button>
              <Button onClick={save} disabled={saving} className="min-h-10 px-4 text-[13px]">
                {saving ? "Salvando..." : "Salvar modelo"}
              </Button>
            </div>
          </div>
          {error ? <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-200">{error}</p> : null}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="grid gap-1.5">
              <span className={labelClass}>Código</span>
              <input id="model-code" className={inputClass} value={draft.code} placeholder="FBAB-1" onChange={(e) => update({ code: e.target.value.toUpperCase() })} />
            </label>
            <label className="grid gap-1.5 sm:col-span-1 lg:col-span-3">
              <span className={labelClass}>Nome</span>
              <input id="model-name" className={inputClass} value={draft.name} placeholder="Intermediário · musculação · hiper/def" onChange={(e) => update({ name: e.target.value })} />
            </label>
            <label className="grid gap-1.5">
              <span className={labelClass}>Divisão</span>
              <select
                id="model-split"
                className={inputClass}
                value={draft.split_type}
                onChange={(e) => {
                  const split = e.target.value;
                  const missing = defaultDays(split).filter((day) => !draft.days.some((entry) => entry.day === day));
                  update({ split_type: split, days: [...draft.days, ...missing.map((day) => ({ day, slots: [emptySlot()] }))].sort((a, b) => a.day.localeCompare(b.day)) });
                }}
              >
                {MODEL_SPLITS.map((split) => (
                  <option key={split.value} value={split.value}>{split.label}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className={labelClass}>Nível</span>
              <select id="model-level" className={inputClass} value={draft.level} onChange={(e) => update({ level: e.target.value })}>
                {MODEL_LEVELS.map((level) => (
                  <option key={level.value} value={level.value}>{level.label}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className={labelClass}>Status</span>
              <select id="model-status" className={inputClass} value={draft.status} onChange={(e) => update({ status: e.target.value as Draft["status"] })}>
                <option value="draft">Rascunho (não vale no app)</option>
                <option value="ready">Pronto (vale no app)</option>
              </select>
            </label>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="grid gap-2">
              <span className={labelClass}>Estilos</span>
              <div className="flex flex-wrap gap-2">
                {MODEL_STYLES.map((style) => (
                  <Chip key={style.value} active={draft.training_styles.includes(style.value)} onClick={() => update({ training_styles: toggle(draft.training_styles, style.value) })}>
                    {style.label}
                  </Chip>
                ))}
              </div>
            </div>
            <div className="grid gap-2">
              <span className={labelClass}>Objetivos</span>
              <div className="flex flex-wrap gap-2">
                {MODEL_GOALS.map((goal) => (
                  <Chip key={goal.value} active={draft.goals.includes(goal.value)} onClick={() => update({ goals: toggle(draft.goals, goal.value) })}>
                    {goal.label}
                  </Chip>
                ))}
              </div>
            </div>
            <div className="grid gap-2">
              <span className={labelClass}>Tempo (nenhum marcado = qualquer tempo)</span>
              <div className="flex flex-wrap gap-2">
                {MODEL_DURATIONS.map((minutes) => (
                  <Chip key={minutes} active={draft.durations.includes(minutes)} onClick={() => update({ durations: toggle(draft.durations, minutes).sort((a, b) => a - b) })}>
                    {minutes} min
                  </Chip>
                ))}
              </div>
            </div>
          </div>

          <label className="grid gap-1.5">
            <span className={labelClass}>Observações</span>
            <textarea id="model-notes" rows={2} className={inputClass} value={draft.notes} onChange={(e) => update({ notes: e.target.value })} />
          </label>
        </Card>

        {draft.days.map((entry, dayIndex) => (
          <Card key={entry.day} className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h4 className="text-base font-semibold text-white">
                Treino {entry.day} <span className="ml-2 text-[12px] font-normal text-white/50">{entry.slots.length} de {MODEL_MAX_SLOTS} vagas</span>
              </h4>
              <button
                type="button"
                className="text-[12px] text-white/50 underline-offset-2 hover:text-red-300 hover:underline"
                onClick={() => update({ days: draft.days.filter((_, i) => i !== dayIndex) })}
              >
                Remover treino {entry.day}
              </button>
            </div>

            {(() => {
              const warnings = dayWarnings(entry.slots, draft.level, catalog);
              return warnings.length ? (
                <ul className="space-y-1 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-100">
                  {warnings.map((warning) => <li key={warning}>• {warning}</li>)}
                </ul>
              ) : null;
            })()}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1220px] border-separate border-spacing-y-1.5 text-left">
                <thead>
                  <tr className={labelClass}>
                    <th className="w-8 px-1 font-semibold">#</th>
                    <th className="px-1 font-semibold">Papel</th>
                    <th className="w-40 px-1 font-semibold">Músculo</th>
                    <th className="w-32 px-1 font-semibold">Tipo</th>
                    <th className="w-20 px-1 font-semibold">Bloco</th>
                    <th className="w-20 px-1 font-semibold">Corte</th>
                    <th className="w-36 px-1 font-semibold">Técnica</th>
                    <th className="w-40 px-1 font-semibold">Também aceita</th>
                    <th className="w-32 px-1 font-semibold">Tipo (alt.)</th>
                    <th className="w-36 px-1 font-semibold" title="Exercícios do catálogo que servem para a vaga, no nível do modelo">No catálogo</th>
                    <th className="w-24 px-1" />
                  </tr>
                </thead>
                <tbody>
                  {entry.slots.map((slot, slotIndex) => {
                    const isWarmup = slot.type === "warmup";
                    const id = `${entry.day}-${slot.key}`;
                    return (
                      <tr key={slot.key} className="align-middle">
                        <td className="px-1 text-[13px] font-semibold text-white/60">{slotIndex + 1}</td>
                        <td className="px-1">
                          <input id={`${id}-role`} className={inputClass} value={slot.role} placeholder="Ex.: Peito composto" onChange={(e) => updateSlot(dayIndex, slotIndex, { role: e.target.value })} />
                        </td>
                        <td className="px-1">
                          <select id={`${id}-muscle`} className={inputClass} value={slot.muscle} disabled={isWarmup} onChange={(e) => updateSlot(dayIndex, slotIndex, { muscle: e.target.value })}>
                            <option value="">{isWarmup ? "—" : "Escolha"}</option>
                            {MODEL_MUSCLES.map((muscle) => (
                              <option key={muscle.value} value={muscle.value}>{muscle.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-1">
                          <select
                            id={`${id}-type`}
                            className={inputClass}
                            value={slot.type}
                            onChange={(e) =>
                              updateSlot(dayIndex, slotIndex, {
                                type: e.target.value,
                                ...(e.target.value === "warmup" ? { muscle: "", block: "", altMuscle: "", altType: "", role: slot.role || "Aquecimento" } : {})
                              })
                            }
                          >
                            {MODEL_SLOT_TYPES.filter((type) => type.value !== "core" || slot.type === "core").map((type) => (
                              <option key={type.value} value={type.value}>{type.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-1">
                          <select id={`${id}-block`} className={inputClass} value={slot.block} disabled={isWarmup} onChange={(e) => updateSlot(dayIndex, slotIndex, { block: e.target.value })}>
                            <option value="">—</option>
                            {MODEL_BLOCKS.map((block) => (
                              <option key={block} value={block}>{block}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-1">
                          <select id={`${id}-cut`} className={inputClass} value={slot.cut} onChange={(e) => updateSlot(dayIndex, slotIndex, { cut: e.target.value })}>
                            <option value="">—</option>
                            {Array.from({ length: MODEL_MAX_SLOTS }, (_, i) => String(i + 1)).map((cut) => (
                              <option key={cut} value={cut}>{cut}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-1">
                          <select id={`${id}-technique`} className={inputClass} value={slot.technique} disabled={isWarmup} onChange={(e) => updateSlot(dayIndex, slotIndex, { technique: e.target.value })}>
                            <option value="">—</option>
                            {MODEL_TECHNIQUES.map((technique) => (
                              <option key={technique.value} value={technique.value}>{technique.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-1">
                          <select id={`${id}-alt-muscle`} className={inputClass} value={slot.altMuscle} disabled={isWarmup} onChange={(e) => updateSlot(dayIndex, slotIndex, { altMuscle: e.target.value })}>
                            <option value="">—</option>
                            {MODEL_MUSCLES.map((muscle) => (
                              <option key={muscle.value} value={muscle.value}>{muscle.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-1">
                          <select id={`${id}-alt-type`} className={inputClass} value={slot.altType} disabled={isWarmup} onChange={(e) => updateSlot(dayIndex, slotIndex, { altType: e.target.value })}>
                            <option value="">Mesmo tipo</option>
                            {MODEL_SLOT_TYPES.filter((type) => type.value !== "warmup" && type.value !== "core").map((type) => (
                              <option key={type.value} value={type.value}>{type.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-1">
                          {(() => {
                            if (!catalog) return <span className="text-[11px] text-white/35">carregando…</span>;
                            const coverage = slotCoverage(slot, draft.level, catalog);
                            if (!coverage) return <span className="text-[11px] text-white/35">—</span>;
                            return (
                              <div className="flex flex-wrap gap-1" title={coverage.names.length ? coverage.names.join("\n") : "Nenhum exercício"}>
                                <span className={clsx("rounded-full border px-2 py-0.5 text-[11px] font-semibold", coverageTone(coverage.home))}>Casa {coverage.home}</span>
                                <span className={clsx("rounded-full border px-2 py-0.5 text-[11px] font-semibold", coverageTone(coverage.gym))}>Acad {coverage.gym}</span>
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-1">
                          <div className="flex justify-end gap-1">
                            <button type="button" aria-label="Subir vaga" disabled={slotIndex === 0} className="rounded-lg border border-white/10 px-2 py-1 text-[12px] text-white/70 disabled:opacity-30"
                              onClick={() => updateSlots(dayIndex, (slots) => { const next = [...slots]; [next[slotIndex - 1], next[slotIndex]] = [next[slotIndex], next[slotIndex - 1]]; return next; })}>↑</button>
                            <button type="button" aria-label="Descer vaga" disabled={slotIndex === entry.slots.length - 1} className="rounded-lg border border-white/10 px-2 py-1 text-[12px] text-white/70 disabled:opacity-30"
                              onClick={() => updateSlots(dayIndex, (slots) => { const next = [...slots]; [next[slotIndex + 1], next[slotIndex]] = [next[slotIndex], next[slotIndex + 1]]; return next; })}>↓</button>
                            <button type="button" aria-label="Remover vaga" className="rounded-lg border border-white/10 px-2 py-1 text-[12px] text-white/70 hover:border-red-400/40 hover:text-red-300"
                              onClick={() => updateSlots(dayIndex, (slots) => slots.filter((_, i) => i !== slotIndex))}>✕</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" className="min-h-9 px-3 text-[12px]" disabled={entry.slots.length >= MODEL_MAX_SLOTS} onClick={() => updateSlots(dayIndex, (slots) => [...slots, emptySlot()])}>
                + Vaga
              </Button>
              {!entry.slots.some((slot) => slot.type === "warmup") ? (
                <Button variant="ghost" className="min-h-9 px-3 text-[12px]" disabled={entry.slots.length >= MODEL_MAX_SLOTS} onClick={() => updateSlots(dayIndex, (slots) => [emptySlot("warmup"), ...slots])}>
                  + Aquecimento no início
                </Button>
              ) : null}
            </div>
          </Card>
        ))}

        <div className="flex flex-wrap items-center justify-between gap-3">
          {nextLetter ? (
            <Button variant="secondary" className="min-h-10 px-4 text-[13px]" onClick={() => update({ days: [...draft.days, { day: nextLetter, slots: [emptySlot()] }] })}>
              + Treino {nextLetter}
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setDraft(null)} disabled={saving} className="min-h-10 px-4 text-[13px]">Cancelar</Button>
            <Button onClick={save} disabled={saving} className="min-h-10 px-4 text-[13px]">{saving ? "Salvando..." : "Salvar modelo"}</Button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Lista ----------
  return (
    <div className="space-y-5">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-semibold text-white">Perfis com modelo pronto</h3>
          <p className="text-[12px] text-white/55">
            <span className="text-primary">{coveredProfiles}</span> de {totalProfiles} combinações de nível, estilo e objetivo
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-separate border-spacing-1 text-left text-[12px]">
            <thead>
              <tr className={labelClass}>
                <th className="px-2 py-1 font-semibold">Nível · Estilo</th>
                {MODEL_GOALS.map((goal) => (
                  <th key={goal.value} className="px-2 py-1 font-semibold">{goal.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MODEL_LEVELS.flatMap((level) =>
                MODEL_STYLES.map((style, styleIndex) => (
                  <tr key={`${level.value}-${style.value}`}>
                    <td className={clsx("whitespace-nowrap px-2 py-1.5 text-white/75", styleIndex === 0 && "border-t border-white/10")}>
                      <span className="font-semibold text-white">{level.label}</span> · {style.label}
                    </td>
                    {MODEL_GOALS.map((goal) => {
                      const cellModels = profileCoverage.get(`${level.value}|${style.value}|${goal.value}`) ?? [];
                      const splits = [...new Set(cellModels.map((model) => labelOf(MODEL_SPLITS, model.split_type)))];
                      return (
                        <td
                          key={goal.value}
                          title={cellModels.map((model) => `${model.code} · ${labelOf(MODEL_SPLITS, model.split_type)} · ${model.durations.length ? model.durations.join("/") + " min" : "qualquer tempo"}`).join("\n")}
                          className={clsx(
                            "rounded-lg px-2 py-1.5 align-top",
                            cellModels.length ? "bg-primary/10 text-primary" : "bg-white/[0.03] text-white/25"
                          )}
                        >
                          {cellModels.length ? (
                            <>
                              <span className="font-semibold">{cellModels.length} {cellModels.length === 1 ? "modelo" : "modelos"}</span>
                              <span className="block text-[11px] text-primary/75">{splits.join(", ")}</span>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-white/45">Passe o mouse numa célula para ver os modelos, a divisão e os tempos. Só contam modelos marcados como Pronto.</p>
      </Card>
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-white/60">
            {models.length} modelos · <span className="text-primary">{readyCount} prontos</span> · {models.length - readyCount} rascunhos
          </p>
          <Button className="min-h-10 px-4 text-[13px]" onClick={() => { setDraft(newDraft()); setNotice(null); setError(null); }}>
            + Novo modelo
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input id="filter-search" className={inputClass} placeholder="Buscar por código ou nome" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
          <select id="filter-split" className={inputClass} value={filters.split} onChange={(e) => setFilters({ ...filters, split: e.target.value })}>
            <option value="">Todas as divisões</option>
            {MODEL_SPLITS.map((split) => <option key={split.value} value={split.value}>{split.label}</option>)}
          </select>
          <select id="filter-level" className={inputClass} value={filters.level} onChange={(e) => setFilters({ ...filters, level: e.target.value })}>
            <option value="">Todos os níveis</option>
            {MODEL_LEVELS.map((level) => <option key={level.value} value={level.value}>{level.label}</option>)}
          </select>
          <select id="filter-status" className={inputClass} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">Todos os status</option>
            <option value="ready">Pronto</option>
            <option value="draft">Rascunho</option>
          </select>
        </div>
        {notice ? <p className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-[13px] text-primary">{notice}</p> : null}
        {error ? <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-200">{error}</p> : null}
      </Card>

      {loading ? (
        <p className="text-[13px] text-white/50">Carregando modelos...</p>
      ) : !filtered.length ? (
        <Card><p className="text-[13px] text-white/60">{models.length ? "Nenhum modelo com esses filtros." : "Nenhum modelo ainda. Clique em “Novo modelo” para criar o primeiro."}</p></Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((model) => (
            <Card key={model.id} className="space-y-3 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[13px] font-semibold text-white">{model.code}</span>
                    <span className={clsx("rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
                      model.status === "ready" ? "border-primary/40 bg-primary/10 text-primary" : "border-white/15 text-white/55")}>
                      {model.status === "ready" ? "Pronto" : "Rascunho"}
                    </span>
                  </div>
                  <p className="mt-1 text-[14px] text-white/85">{model.name}</p>
                  <p className="mt-1 text-[12px] text-white/50">
                    {labelOf(MODEL_SPLITS, model.split_type)} · {labelOf(MODEL_LEVELS, model.level)} · {model.training_styles.map((s) => labelOf(MODEL_STYLES, s)).join(", ")} ·{" "}
                    {model.goals.map((g) => labelOf(MODEL_GOALS, g)).join(", ")} · {model.durations.length ? model.durations.map((d) => `${d} min`).join(", ") : "qualquer tempo"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" className="min-h-9 px-3 text-[12px]" onClick={() => { setDraft(toDraft(model)); setNotice(null); setError(null); }}>Editar</Button>
                  <Button variant="secondary" className="min-h-9 px-3 text-[12px]" onClick={() => duplicate(model)}>Duplicar</Button>
                  {confirmDelete === model.id ? (
                    <>
                      <Button variant="secondary" className="min-h-9 border-red-400/40 px-3 text-[12px] text-red-200" onClick={() => remove(model.id)}>Confirmar exclusão</Button>
                      <Button variant="ghost" className="min-h-9 px-3 text-[12px]" onClick={() => setConfirmDelete(null)}>Cancelar</Button>
                    </>
                  ) : (
                    <Button variant="ghost" className="min-h-9 px-3 text-[12px] hover:text-red-300" onClick={() => setConfirmDelete(model.id)}>Excluir</Button>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.keys(model.days ?? {}).sort().map((day) => (
                  <details key={day} className="min-w-0 rounded-2xl border border-white/8 bg-black/20 px-3 py-2 text-[12px] text-white/70">
                    <summary className="cursor-pointer select-none text-white/80">Treino {day} · {model.days[day].length} vagas</summary>
                    <ol className="mt-2 space-y-1">
                      {model.days[day].map((slot) => (
                        <li key={slot.n}>
                          {slot.n}. {slot.role}
                          <span className="text-white/45">
                            {slot.type !== "warmup" ? ` · ${muscleLabel(slot.muscles)}` : ""} · {labelOf(MODEL_SLOT_TYPES, slot.type)}
                            {slot.block ? ` · ${slot.block}` : ""}{slot.cut ? ` · corte ${slot.cut}` : ""}
                            {slot.technique ? ` · ${labelOf(MODEL_TECHNIQUES, slot.technique)}` : ""}
                            {slot.alsoAccept?.length ? ` · aceita ${slot.alsoAccept.map((extra) => [extra.muscles?.length ? muscleLabel(extra.muscles) : "", extra.type ? labelOf(MODEL_SLOT_TYPES, extra.type) : ""].filter(Boolean).join(" ")).join(", ")}` : ""}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </details>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
