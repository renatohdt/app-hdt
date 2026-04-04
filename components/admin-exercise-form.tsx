"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button, Card } from "@/components/ui";
import { getRequestErrorMessage, parseJsonResponse } from "@/lib/api";
import {
  EXERCISE_MUSCLE_OPTIONS,
  EXERCISE_TYPE_OPTIONS,
  getExerciseMuscleGroups
} from "@/lib/exercise-library";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { ExerciseRecord } from "@/lib/types";

const levelOptions = [
  { value: "beginner", label: "Iniciante" },
  { value: "intermediate", label: "Intermediário" },
  { value: "advanced", label: "Avançado" }
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
  muscle_groups: string[];
  type: string;
  level: string[];
  location: string[];
  equipment: string[];
  video_url: string;
};

const emptyValues: ExerciseFormValues = {
  name: "",
  muscle_groups: [],
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
      muscle_groups: getExerciseMuscleGroups(initialValues),
      type: initialValues.type ?? initialValues.metadata?.type ?? "",
      level: normalizeArray(initialValues.level ?? initialValues.metadata?.level),
      location: normalizeArray(initialValues.location ?? initialValues.metadata?.location),
      equipment: normalizeEquipment(initialValues.equipment ?? initialValues.metadata?.equipment),
      video_url: initialValues.video_url ?? ""
    });
  }, [initialValues]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);

    if (!values.muscle_groups.length) {
      setStatus("Selecione pelo menos um grupo muscular.");
      return;
    }

    if (!values.type) {
      setStatus("Selecione o tipo do exercício.");
      return;
    }

    setLoading(true);

    const formattedData = {
      id: values.id,
      name: values.name,
      muscle_groups: ensureArray(values.muscle_groups),
      type: values.type,
      level: ensureArray(values.level),
      location: ensureArray(values.location),
      equipment: normalizeEquipment(values.equipment),
      video_url: values.video_url || null
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
        throw new Error(result.error ?? "Erro na requisição");
      }

      const result = await parseJsonResponse<{ success: true; data: ExerciseRecord }>(response);
      setStatus(values.id ? "Exercício atualizado com sucesso." : "Exercício salvo com sucesso.");
      setValues(emptyValues);
      onSaved?.(result.data);
    } catch (error) {
      setStatus(getRequestErrorMessage(error, "Não foi possível salvar o exercício."));
    } finally {
      setLoading(false);
    }
  }

  function toggleArrayValue(field: "muscle_groups" | "level" | "location" | "equipment", value: string) {
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
              Cancelar edição
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
            <span className="text-sm text-white/72">URL do vídeo</span>
            <input
              name="video_url"
              value={values.video_url}
              onChange={(event) => setValues((current) => ({ ...current, video_url: event.target.value }))}
              placeholder="URL do vídeo"
              className="min-h-12 rounded-2xl border border-white/10 bg-black/20 px-4"
            />
          </label>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(15rem,0.75fr)] xl:items-start">
          <CheckboxGroup
            title="Grupos musculares"
            description="Selecione todos os grupamentos relevantes para o exercício."
            options={EXERCISE_MUSCLE_OPTIONS}
            selected={values.muscle_groups}
            onToggle={(value) => toggleArrayValue("muscle_groups", value)}
          />

          <SelectField
            name="type"
            label="Tipo"
            options={EXERCISE_TYPE_OPTIONS}
            value={values.type}
            onChange={(value) => setValues((current) => ({ ...current, type: value }))}
          />
        </div>

        <CheckboxGroup
          title="Nível"
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
  options: ReadonlyArray<{ value: string; label: string }>;
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
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function CheckboxGroup({
  title,
  description,
  options,
  selected,
  onToggle
}: {
  title: string;
  description?: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="grid gap-3 rounded-[22px] border border-white/10 bg-black/20 p-4">
      <div className="space-y-1">
        <p className="text-sm text-white/72">{title}</p>
        {description ? <p className="text-xs leading-5 text-white/48">{description}</p> : null}
      </div>
      <div className="flex flex-wrap gap-3">
        {options.map((option) => (
          <label
            key={option.value}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition ${
              selected.includes(option.value)
                ? "border-primary/40 bg-primary/12 text-white"
                : "border-white/10 text-white/78 hover:border-white/20 hover:bg-white/[0.03]"
            }`}
          >
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
