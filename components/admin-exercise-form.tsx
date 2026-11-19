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
  EXERCISE_TRAINING_STYLE_OPTIONS,
  EXERCISE_TYPE_OPTIONS,
  getExerciseEquipment,
  getExerciseRequiredEquipment,
  getExerciseLevels,
  getExerciseLocations,
  getExerciseMuscleGroups,
  normalizeExerciseEquipmentList,
  normalizeExerciseMuscleGroup,
  normalizeExerciseName
} from "@/lib/exercise-library";
import { ExerciseRecord } from "@/lib/types";

type ExerciseFormValues = {
  id?: string;
  name: string;
  muscle: string;
  secondary_muscles: string[];
  type: string;
  level: string[];
  location: string[];
  equipment: string[];
  required_equipment: string[];
  training_styles: string[];
  difficulty: string;
  can_warmup: boolean;
  video_url: string;
  video_provider_id: string;
};

type YmoveSearchResult = {
  id: string;
  name: string;
  muscleGroup: string | null;
  equipment: string[];
};

const emptyValues: ExerciseFormValues = {
  name: "",
  muscle: "",
  secondary_muscles: [],
  type: "",
  level: [],
  location: [],
  equipment: [],
  required_equipment: [],
  training_styles: [],
  difficulty: "",
  can_warmup: false,
  video_url: "",
  video_provider_id: ""
};

// Escala de dificuldade: o que a pessoa precisa para EXECUTAR o exercício
// (técnica, força, coordenação, equilíbrio). Não mede a carga.
const EXERCISE_DIFFICULTY_OPTIONS = [
  { value: "1", label: "1 · Qualquer pessoa consegue" },
  { value: "2", label: "2 · Fácil" },
  { value: "3", label: "3 · Fácil, mas requer atenção" },
  { value: "4", label: "4 · Desafiador" },
  { value: "5", label: "5 · Avançado" }
] as const;

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
  // Busca de vídeos na YMove (provisórios, até o vídeo próprio ser gravado).
  const [ymoveQuery, setYmoveQuery] = useState("");
  const [ymoveResults, setYmoveResults] = useState<YmoveSearchResult[] | null>(null);
  const [ymoveLoading, setYmoveLoading] = useState(false);
  const [ymoveError, setYmoveError] = useState<string | null>(null);

  useEffect(() => {
    setStatus(null);
    setStatusTone("neutral");

    if (!initialValues) {
      setValues(emptyValues);
      return;
    }

    const allGroups = getExerciseMuscleGroups(initialValues);
    const primaryMuscle =
      normalizeExerciseMuscleGroup(initialValues.muscle ?? initialValues.metadata?.muscle ?? null) ??
      allGroups[0] ??
      "";
    const secondaryMuscles = allGroups.filter((m) => m !== primaryMuscle);

    setValues({
      id: initialValues.id,
      name: initialValues.name,
      muscle: primaryMuscle,
      secondary_muscles: secondaryMuscles,
      type: initialValues.type ?? initialValues.metadata?.type ?? "",
      level: getExerciseLevels(initialValues),
      location: getExerciseLocations(initialValues),
      equipment: getExerciseEquipment(initialValues),
      required_equipment: getExerciseRequiredEquipment(initialValues),
      training_styles: initialValues.training_styles ?? [],
      difficulty: initialValues.difficulty ? String(initialValues.difficulty) : "",
      can_warmup: Boolean(initialValues.can_warmup),
      video_url: initialValues.video_url ?? "",
      video_provider_id: initialValues.video_provider_id ?? ""
    });
    setYmoveResults(null);
    setYmoveError(null);
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

    if (!values.muscle) {
      setStatus("Selecione o músculo principal.");
      setStatusTone("error");
      return;
    }

    if (!values.type) {
      setStatus("Selecione o tipo do exercício.");
      setStatusTone("error");
      return;
    }

    if (!values.difficulty) {
      setStatus("Selecione a dificuldade do exercício (de 1 a 5).");
      setStatusTone("error");
      return;
    }

    setLoading(true);

    // Combina primário + secundários em muscle_groups (primário sempre primeiro)
    const muscleGroups = [values.muscle, ...values.secondary_muscles].filter(Boolean);

    const formattedData = {
      id: values.id,
      name: values.name,
      muscle_groups: muscleGroups,
      type: values.type,
      level: ensureArray(values.level),
      location: ensureArray(values.location),
      equipment: normalizeExerciseEquipmentList(values.equipment),
      required_equipment: normalizeExerciseEquipmentList(values.required_equipment),
      training_styles: values.training_styles,
      difficulty: Number(values.difficulty),
      can_warmup: values.can_warmup,
      video_url: values.video_url || null,
      video_provider_id: values.video_provider_id.trim() || null
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

  async function handleYmoveSearch() {
    const query = ymoveQuery.trim();
    if (query.length < 2) {
      setYmoveError("Digite pelo menos 2 letras (em inglês, ex.: bench press).");
      return;
    }
    setYmoveLoading(true);
    setYmoveError(null);
    try {
      const response = await fetchWithAuth(`/api/admin/ymove?q=${encodeURIComponent(query)}`);
      const result = await parseJsonResponse<{ success: boolean; data?: YmoveSearchResult[]; error?: string }>(response);
      if (!response.ok || !result.success) throw new Error(result.error ?? "Erro na busca.");
      setYmoveResults(result.data ?? []);
    } catch (error) {
      setYmoveError(getRequestErrorMessage(error, "Não foi possível buscar na YMove."));
    } finally {
      setYmoveLoading(false);
    }
  }

  function handlePrimaryMuscleChange(value: string) {
    setValues((current) => ({
      ...current,
      muscle: value,
      // Remove o novo primário dos secundários se já estava lá
      secondary_muscles: current.secondary_muscles.filter((m) => m !== value)
    }));
  }

  function toggleSecondaryMuscle(value: string) {
    setValues((current) => {
      const currentValues = current.secondary_muscles;
      const nextValues = currentValues.includes(value)
        ? currentValues.filter((item) => item !== value)
        : [...currentValues, value];

      return { ...current, secondary_muscles: nextValues };
    });
  }

  function toggleArrayValue(field: "level" | "location" | "equipment" | "required_equipment" | "training_styles", value: string) {
    setValues((current) => {
      const currentValues = current[field];
      const nextValues = currentValues.includes(value)
        ? currentValues.filter((item) => item !== value)
        : [...currentValues, value];

      return { ...current, [field]: nextValues };
    });
  }

  function handleCancel() {
    setValues(emptyValues);
    setStatus(null);
    setStatusTone("neutral");
    onCancel?.();
  }

  // Opções de secundários excluem o músculo principal selecionado
  const secondaryMuscleOptions = EXERCISE_MUSCLE_OPTIONS.filter((o) => o.value !== values.muscle);

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

        <div className="grid gap-3 rounded-[22px] border border-white/10 bg-black/20 p-4">
          <div className="space-y-1">
            <p className="text-sm text-white/72">Vídeo YMove (provisório)</p>
            <p className="text-xs leading-5 text-white/48">
              Usado só quando o exercício ainda não tem vídeo próprio no campo &quot;URL do vídeo&quot;. Busque pelo nome em
              inglês e escolha o exercício, ou cole o ID. Ao salvar, a capa é buscada automaticamente.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={values.video_provider_id}
              onChange={(event) => setValues((current) => ({ ...current, video_provider_id: event.target.value }))}
              placeholder="ID do exercício na YMove"
              className="min-h-11 flex-1 rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none transition focus:border-primary"
            />
            {values.video_provider_id ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setValues((current) => ({ ...current, video_provider_id: "" }))}
              >
                Remover vídeo YMove
              </Button>
            ) : null}
          </div>
          {initialValues?.video_thumb_url && initialValues.video_provider_id === values.video_provider_id ? (
            <img
              src={initialValues.video_thumb_url}
              alt="Capa do vídeo YMove"
              className="aspect-video w-48 rounded-xl border border-white/10 object-cover"
            />
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={ymoveQuery}
              onChange={(event) => setYmoveQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleYmoveSearch();
                }
              }}
              placeholder="Buscar na YMove (ex.: bench press)"
              className="min-h-11 flex-1 rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none transition focus:border-primary"
            />
            <Button type="button" variant="secondary" onClick={() => void handleYmoveSearch()} disabled={ymoveLoading}>
              {ymoveLoading ? "Buscando..." : "Buscar"}
            </Button>
          </div>
          {ymoveError ? <p className="text-xs text-red-300">{ymoveError}</p> : null}
          {ymoveResults ? (
            ymoveResults.length ? (
              <ul className="grid max-h-64 gap-2 overflow-y-auto">
                {ymoveResults.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setValues((current) => ({ ...current, video_provider_id: item.id }))}
                      className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                        values.video_provider_id === item.id
                          ? "border-primary/40 bg-primary/12 text-white"
                          : "border-white/10 text-white/78 hover:border-white/20 hover:bg-white/[0.03]"
                      }`}
                    >
                      <span className="font-medium">{item.name}</span>
                      <span className="ml-2 text-xs text-white/48">
                        {[item.muscleGroup, ...item.equipment].filter(Boolean).join(" · ")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-white/48">Nenhum exercício encontrado.</p>
            )
          ) : null}
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(15rem,0.75fr)] xl:items-start">
          <RadioGroup
            title="Músculo principal"
            description="O grupamento muscular primário treinado pelo exercício."
            options={EXERCISE_MUSCLE_OPTIONS}
            selected={values.muscle}
            onChange={handlePrimaryMuscleChange}
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
          title="Músculos secundários"
          description="Grupamentos adicionalmente recrutados. O músculo principal não aparece aqui."
          options={secondaryMuscleOptions}
          selected={values.secondary_muscles}
          onToggle={toggleSecondaryMuscle}
        />

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
          description="Marque todos os materiais relacionados ao exercício (usado para exibição e filtro OR)."
          options={EXERCISE_EQUIPMENT_OPTIONS}
          selected={values.equipment}
          onToggle={(value) => toggleArrayValue("equipment", value)}
        />

        <CheckboxGroup
          title="Equipamentos obrigatórios (todos necessários)"
          description="Marque somente os materiais que o usuário PRECISA ter ao mesmo tempo. Ex: halteres + fitball para 'Press na Fitball'. Deixe vazio se o exercício precisa de apenas um material."
          options={EXERCISE_EQUIPMENT_OPTIONS}
          selected={values.required_equipment}
          onToggle={(value) => toggleArrayValue("required_equipment", value)}
        />

        <CheckboxGroup
          title="Estilo de treino"
          description="Selecione todos os estilos de treino compatíveis com este exercício. Um exercício pode pertencer a mais de um estilo."
          options={EXERCISE_TRAINING_STYLE_OPTIONS}
          selected={values.training_styles}
          onToggle={(value) => toggleArrayValue("training_styles", value)}
        />

        <RadioGroup
          name="difficulty"
          title="Dificuldade"
          description="O que a pessoa precisa para executar o exercício bem: técnica, força, coordenação e equilíbrio. Não considere a carga (cadeira extensora é 1 mesmo para quem treina pesado)."
          options={EXERCISE_DIFFICULTY_OPTIONS}
          selected={values.difficulty}
          onChange={(value) => setValues((current) => ({ ...current, difficulty: value }))}
        />

        <CheckboxGroup
          title="Aquecimento"
          description="Marque se este exercício pode entrar na vaga de aquecimento do treino."
          options={[{ value: "warmup", label: "Pode ser usado como aquecimento" }]}
          selected={values.can_warmup ? ["warmup"] : []}
          onToggle={() => setValues((current) => ({ ...current, can_warmup: !current.can_warmup }))}
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
        <option value="" disabled className="text-black">
          Selecione
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value} className="text-black">
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function RadioGroup({
  name,
  title,
  description,
  options,
  selected,
  onChange
}: {
  name?: string;
  title: string;
  description?: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  selected: string;
  onChange: (value: string) => void;
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
            className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-sm transition ${
              selected === option.value
                ? "border-primary/40 bg-primary/12 text-white"
                : "border-white/10 text-white/78 hover:border-white/20 hover:bg-white/[0.03]"
            }`}
          >
            <input
              type="radio"
              name={name ?? "muscle_primary"}
              checked={selected === option.value}
              onChange={() => onChange(option.value)}
              className="h-4 w-4 accent-[#22c55e]"
            />
            {option.label}
          </label>
        ))}
      </div>
    </div>
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
