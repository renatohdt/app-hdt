"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button, Card } from "@/components/ui";
import { getRequestErrorMessage, parseJsonResponse } from "@/lib/api";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { ExerciseRecord } from "@/lib/types";

const muscleOptions = [
  ["chest", "Peito"],
  ["back", "Costas"],
  ["shoulders", "Ombro"],
  ["biceps", "Biceps"],
  ["triceps", "Triceps"],
  ["abs", "Abdomen"],
  ["quadriceps", "Quadriceps"],
  ["glutes", "Gluteo"],
  ["hamstrings", "Posterior de Coxa"],
  ["calves", "Gemeos"],
  ["forearms", "Antebraco"]
] as const;

const typeOptions = [
  ["compound", "Composto"],
  ["isolation", "Isolado"],
  ["functional", "Funcional"],
  ["mobility", "Mobilidade"]
] as const;

const levelOptions = [
  { value: "beginner", label: "Iniciante" },
  { value: "intermediate", label: "Intermediario" },
  { value: "advanced", label: "Avancado" }
] as const;

const locationOptions = [
  { value: "home", label: "Casa" },
  { value: "gym", label: "Academia" }
] as const;

const equipmentOptions = [
  { value: "bodyweight", label: "Peso corporal" },
  { value: "halteres", label: "Halteres" },
  { value: "machine", label: "Máquina" },
  { value: "elasticos", label: "Elásticos" },
  { value: "fitball", label: "Fitball" },
  { value: "fita_suspensa", label: "Fita Suspensa" },
  { value: "caneleira", label: "Caneleira" },
  { value: "kettlebell", label: "Kettlebell" }
] as const;

type ExerciseFormValues = {
  id?: string;
  name: string;
  muscle_group: string;
  type: string;
  level: string[];
  location: string[];
  equipment: string[];
  video_url: string;
};

const emptyValues: ExerciseFormValues = {
  name: "",
  muscle_group: "",
  type: "",
  level: [],
  location: [],
  equipment: [],
  video_url: ""
};

export function AdminExerciseForm({
  initialValues,
  onSaved,
  onCancel
}: {
  initialValues?: ExerciseRecord | null;
  onSaved?: (exercise: ExerciseRecord) => void;
  onCancel?: () => void;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [values, setValues] = useState<ExerciseFormValues>(emptyValues);

  useEffect(() => {
    if (!initialValues) {
      setValues(emptyValues);
      return;
    }

    setValues({
      id: initialValues.id,
      name: initialValues.name,
      muscle_group: initialValues.muscle ?? initialValues.metadata?.muscle ?? "",
      type: initialValues.type ?? initialValues.metadata?.type ?? "",
      level: normalizeArray(initialValues.level ?? initialValues.metadata?.level),
      location: normalizeArray(initialValues.location ?? initialValues.metadata?.location),
      equipment: normalizeEquipment(initialValues.equipment ?? initialValues.metadata?.equipment),
      video_url: initialValues.video_url ?? ""
    });
  }, [initialValues]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setStatus(null);

    const formData = {
      id: values.id,
      name: values.name,
      muscle: values.muscle_group,
      type: values.type,
      level: values.level,
      location: values.location,
      equipment: values.equipment,
      video_url: values.video_url || null
    };

    const formattedData = {
      ...formData,
      location: ensureArray(formData.location),
      equipment: normalizeEquipment(formData.equipment),
      level: ensureArray(formData.level)
    };

    try {
      const response = await fetchWithAuth("/api/admin/exercises", {
        method: values.id ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(formattedData)
      });

      if (!response.ok) {
        const result = await parseJsonResponse<{ success: false; error?: string }>(response);
        throw new Error(result.error ?? "Erro na requisicao");
      }

      const result = await parseJsonResponse<{ success: true; data: ExerciseRecord }>(response);
      setStatus(values.id ? "Exercicio atualizado com sucesso." : "Exercicio salvo com sucesso.");
      setValues(emptyValues);
      onSaved?.(result.data);
    } catch (error) {
      setStatus(getRequestErrorMessage(error, "Não foi possível salvar o exercício."));
    } finally {
      setLoading(false);
    }
  }

  function toggleArrayValue(field: "level" | "location" | "equipment", value: string) {
    setValues((current) => {
      const currentValues = current[field];
      const nextValues = currentValues.includes(value)
        ? currentValues.filter((item) => item !== value)
        : [...currentValues, value];

      return {
        ...current,
        [field]: nextValues
      };
    });
  }

  function handleCancel() {
    setValues(emptyValues);
    setStatus(null);
    onCancel?.();
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="grid gap-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">{values.id ? "Editar exercício" : "Novo exercício"}</p>
            <p className="text-sm text-white/60">Formulário enxuto com estrutura pronta para o gerador de treino.</p>
          </div>
          {values.id ? (
            <Button type="button" variant="ghost" onClick={handleCancel}>
              Cancelar edicao
            </Button>
          ) : null}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-sm text-white/72">Nome</span>
            <input
              name="name"
              required
              value={values.name}
              onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))}
              placeholder="Nome do exercício"
              className="min-h-12 rounded-2xl border border-white/10 bg-black/20 px-4"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm text-white/72">URL do video</span>
            <input
              name="video_url"
              value={values.video_url}
              onChange={(event) => setValues((current) => ({ ...current, video_url: event.target.value }))}
              placeholder="URL do video"
              className="min-h-12 rounded-2xl border border-white/10 bg-black/20 px-4"
            />
          </label>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <SelectField
            name="muscle_group"
            label="Grupo muscular"
            options={muscleOptions}
            value={values.muscle_group}
            onChange={(value) => setValues((current) => ({ ...current, muscle_group: value }))}
          />

          <SelectField
            name="type"
            label="Tipo"
            options={typeOptions}
            value={values.type}
            onChange={(value) => setValues((current) => ({ ...current, type: value }))}
          />
        </div>

        <CheckboxGroup
          title="Nivel"
          options={levelOptions}
          selected={values.level}
          onToggle={(value) => toggleArrayValue("level", value)}
        />

        <CheckboxGroup
          title="Local"
          options={locationOptions}
          selected={values.location}
          onToggle={(value) => toggleArrayValue("location", value)}
        />

        <CheckboxGroup
          title="Equipamentos"
          options={equipmentOptions}
          selected={values.equipment}
          onToggle={(value) => toggleArrayValue("equipment", value)}
        />

        <div className="flex flex-wrap gap-3">
          <Button disabled={loading}>{loading ? "Salvando..." : values.id ? "Atualizar exercício" : "Salvar exercício"}</Button>
          {values.id ? (
            <Button type="button" variant="secondary" onClick={handleCancel} disabled={loading}>
              Limpar
            </Button>
          ) : null}
        </div>
      </form>
      <p className="mt-4 min-h-6 text-sm text-white/72">{status}</p>
    </Card>
  );
}

function SelectField({
  name,
  label,
  options,
  value,
  onChange
}: {
  name: string;
  label: string;
  options: ReadonlyArray<readonly [string, string]>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm text-white/72">{label}</span>
      <select
        name={name}
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-12 rounded-2xl border border-white/10 bg-black/20 px-4 text-white"
      >
        <option value="" disabled>
          Selecione
        </option>
        {options.map(([optionValue, title]) => (
          <option key={optionValue} value={optionValue}>
            {title}
          </option>
        ))}
      </select>
    </label>
  );
}

function CheckboxGroup({
  title,
  options,
  selected,
  onToggle
}: {
  title: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="grid gap-3 rounded-[22px] border border-white/10 bg-black/20 p-4">
      <p className="text-sm text-white/72">{title}</p>
      <div className="flex flex-wrap gap-3">
        {options.map((option) => (
          <label key={option.value} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-sm text-white/78">
            <input
              type="checkbox"
              checked={selected.includes(option.value)}
              onChange={() => onToggle(option.value)}
              className="h-4 w-4 accent-[#22c55e]"
            />
            {option.label}
          </label>
        ))}
      </div>
    </div>
  );
}

function normalizeArray(values?: string | string[] | null) {
  if (Array.isArray(values)) {
    return values;
  }

  return values ? [values] : [];
}

function ensureArray(values?: string | string[] | null) {
  if (Array.isArray(values)) {
    return values.filter(Boolean);
  }

  return values ? [values] : [];
}

function normalizeEquipment(values?: string | string[] | null) {
  return ensureArray(values)
    .map((value) => {
      if (value === "dumbbell") return "halteres";
      return value;
    })
    .filter((value) => value !== "other");
}
