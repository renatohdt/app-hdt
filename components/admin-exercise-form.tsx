"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button, Card } from "@/components/ui";
import { getRequestErrorMessage, parseJsonResponse } from "@/lib/api";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import {
  EXERCISE_EQUIPMENT_OPTIONS,
  EXERCISE_LEVEL_OPTIONS,
  EXERCISE_LOCATION_OPTIONS,
  EXERCISE_MUSCLE_OPTIONS,
  EXERCISE_TYPE_OPTIONS,
  getExerciseEquipment,
  getExerciseLevels,
  getExerciseLocations,
  getExerciseMuscleGroups,
  normalizeExerciseEquipmentList,
  normalizeExerciseName
} from "@/lib/exercise-library";
import { ExerciseRecord } from "@/lib/types";

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
  existingExercises = [],
  onSaved,
  onCancel
}: {
  initialValues?: ExerciseRecord | null;
  existingExercises?: ExerciseRecord[];
  onSaved?: (exercise: ExerciseRecord) => void;
  onCancel?: () => void;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<"neutral" | "success" | "error">("neutral");
  const [loading, setLoading] = useState(false);
  const [values, setValues] = useState<ExerciseFormValues>(emptyValues);

  useEffect(() => {
    setStatus(null);
    setStatusTone("neutral");

    if (!initialValues) {
      setValues(emptyValues);
      return;
    }

    setValues({
      id: initialValues.id,
      name: initialValues.name,
      muscle_groups: getExerciseMuscleGroups(initialValues),
      type: initialValues.type ?? initialValues.metadata?.type ?? "",
      level: getExerciseLevels(initialValues),
      location: getExerciseLocations(initialValues),
      equipment: getExerciseEquipment(initialValues),
      video_url: initialValues.video_url ?? ""
    });
  }, [initialValues]);

  const duplicateExercise = useMemo(() => {
    const normalizedName = normalizeExerciseName(values.name);

    if (!normalizedName) {
      return null;
    }

    return (
      existingExercises.find(
        (exercise) => exercise.id !== values.id && normalizeExerciseName(exercise.name) === normalizedName
      ) ?? null
    );
  }, [existingExercises, values.id, values.name]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    setStatusTone("neutral");

    if (duplicateExercise) {
      setStatus(
        `Já existe um exercício com esse nome: "${duplicateExercise.name}". Edite o cadastro existente para evitar duplicidade.`
      );
      setStatusTone("error");
      return;
    }

    if (!values.muscle_groups.length) {
      setStatus("Selecione pelo menos um grupo muscular.");
      setStatusTone("error");
      return;
    }

    if (!values.type) {
      setStatus("Selecione o tipo do exercício.");
      setStatusTone("error");
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
      equipment: normalizeExerciseEquipmentList(values.equipment),
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
        throw new Error(result.error ?? "Erro na requisição.");
      }

      const result = await parseJsonResponse<{ success: true; data: ExerciseRecord }>(response);
      setStatus(values.id ? "Exercício atualizado com sucesso." : "Exercício salvo com sucesso.");
      setStatusTone("success");
      setValues(emptyValues);
      onSaved?.(result.data);
    } catch (error) {
      setStatus(getRequestErrorMessage(error, "Não foi possível salvar o exercício."));
      setStatusTone("error");
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
    setStatusTone("neutral");
    onCancel?.();
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="grid gap-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">{values.id ? "Editar exercício" : "Novo exercício"}</p>
            <p className="text-sm text-white/60">
              Cadastro preparado para manter a biblioteca limpa, pesquisável e consistente para a IA.
            </p>
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
              className={`min-h-12 rounded-2xl border bg-black/20 px-4 text-white outline-none transition ${
                duplicateExercise ? "border-red-300/60" : "border-white/10 focus:border-primary"
              }`}
            />
            {duplicateExercise ? (
              <p className="text-xs leading-5 text-red-300">
                Já existe um cadastro com esse nome. Use o exercício "{duplicateExercise.name}" ou edite-o.
              </p>
            ) : (
              <p className="text-xs leading-5 text-white/42">
                O nome é validado ignorando maiúsculas, espaços extras e normalização simples.
              </p>
            )}
          </label>

          <label className="grid gap-2">
            <span className="text-sm text-white/72">URL do vídeo</span>
            <input
              name="video_url"
              value={values.video_url}
              onChange={(event) => setValues((current) => ({ ...current, video_url: event.target.value }))}
              placeholder="URL do vídeo"
              className="min-h-12 rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none transition focus:border-primary"
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
          options={EXERCISE_LEVEL_OPTIONS}
          selected={values.level}
          onToggle={(value) => toggleArrayValue("level", value)}
        />

        <CheckboxGroup
          title="Local"
          options={EXERCISE_LOCATION_OPTIONS}
          selected={values.location}
          onToggle={(value) => toggleArrayValue("location", value)}
        />

        <CheckboxGroup
          title="Equipamentos"
          options={EXERCISE_EQUIPMENT_OPTIONS}
          selected={values.equipment}
          onToggle={(value) => toggleArrayValue("equipment", value)}
        />

        <div className="flex flex-wrap gap-3">
          <Button disabled={loading || Boolean(duplicateExercise)}>
            {loading ? "Salvando..." : values.id ? "Atualizar exercício" : "Salvar exercício"}
          </Button>
          {values.id ? (
            <Button type="button" variant="secondary" onClick={handleCancel} disabled={loading}>
              Limpar
            </Button>
          ) : null}
        </div>
      </form>
      <p
        className={`mt-4 min-h-6 text-sm ${
          statusTone === "error"
            ? "text-red-300"
            : statusTone === "success"
              ? "text-primary"
              : "text-white/72"
        }`}
      >
        {status}
      </p>
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

function ensureArray(values?: string | string[] | null) {
  if (Array.isArray(values)) {
    return values.filter(Boolean);
  }

  return values ? [values] : [];
}
