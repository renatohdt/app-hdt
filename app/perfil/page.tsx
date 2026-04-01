"use client";

import clsx from "clsx";
import { Dispatch, InputHTMLAttributes, ReactNode, SetStateAction, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppSessionTracker } from "@/components/app-session-tracker";
import { Badge, BadgeGroup, Button, Card, Container, PageShell } from "@/components/ui";
import { parseJsonResponse } from "@/lib/api";
import { isValidEmail } from "@/lib/auth-errors";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { formatBodyTypeLabel } from "@/lib/body-type";
import { signOutAndRedirect } from "@/lib/client-signout";
import { ENABLE_WORKOUT_REGENERATION } from "@/lib/feature-flags";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type ProfilePayload = {
  user: { id: string; name: string; email: string };
  answers: {
    goal?: string;
    gender?: string;
    wrist?: string;
    body_type_raw?: string;
    body_type?: string;
    age?: number;
    weight?: number;
    height?: number;
    profession?: string;
    days?: number;
    time?: number;
    equipment?: string[];
  };
};

type ProfileFormState = {
  name: string;
  email: string;
  profession: string;
  age: string;
  weight: string;
  height: string;
  goal: string;
  gender: string;
  body_type: string;
  days: string;
  time: string;
  equipment: string[];
};

type FeedbackState = {
  tone: "success" | "error" | "info";
  text: string;
};

const GOAL_OPTIONS = [
  { value: "lose_weight", label: "Emagrecimento" },
  { value: "gain_muscle", label: "Hipertrofia" },
  { value: "body_recomposition", label: "Definição" },
  { value: "improve_conditioning", label: "Condicionamento" }
];

const GENDER_OPTIONS = [
  { value: "male", label: "Masculino" },
  { value: "female", label: "Feminino" }
];

const BODY_TYPE_OPTIONS = [
  { value: "endomorph", label: "Endomorfo" },
  { value: "mesomorph", label: "Mesomorfo" },
  { value: "ectomorph", label: "Ectomorfo" }
];

const DAYS_OPTIONS = Array.from({ length: 7 }, (_, index) => {
  const value = String(index + 1);
  return {
    value,
    label: `${value} ${index === 0 ? "dia" : "dias"} por semana`
  };
});

const TIME_OPTIONS = [15, 30, 45, 60, 75, 90].map((value) => ({
  value: String(value),
  label: `${value} min`
}));

const EQUIPMENT_OPTIONS = [
  { value: "halteres", label: "Halteres" },
  { value: "elasticos", label: "Elásticos" },
  { value: "fitball", label: "Fitball" },
  { value: "fita_suspensa", label: "Fita suspensa" },
  { value: "caneleira", label: "Caneleira" },
  { value: "kettlebell", label: "Kettlebell" },
  { value: "nenhum", label: "Nenhum" }
];

const EMPTY_FORM_STATE: ProfileFormState = {
  name: "",
  email: "",
  profession: "",
  age: "",
  weight: "",
  height: "",
  goal: GOAL_OPTIONS[0]?.value ?? "",
  gender: GENDER_OPTIONS[0]?.value ?? "",
  body_type: BODY_TYPE_OPTIONS[0]?.value ?? "",
  days: "3",
  time: "45",
  equipment: ["nenhum"]
};

export default function PerfilPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [payload, setPayload] = useState<ProfilePayload | null>(null);
  const [form, setForm] = useState<ProfileFormState>(EMPTY_FORM_STATE);

  useEffect(() => {
    let active = true;

    async function run() {
      if (isSigningOut) {
        return;
      }

      if (!isSupabaseConfigured() || !supabase) {
        if (active) {
          setError("Configuração do Supabase indisponível.");
          setLoading(false);
        }
        return;
      }

      try {
        const {
          data: { user }
        } = await supabase.auth.getUser();

        if (!user?.id) {
          router.replace("/");
          return;
        }

        const response = await fetchWithAuth("/api/profile");
        if (response.status === 401) {
          router.replace("/");
          return;
        }

        if (!response.ok) {
          const result = await parseJsonResponse<{ success: false; error?: string }>(response);
          throw new Error(result.error ?? "Não foi possível carregar seu perfil.");
        }

        const result = await parseJsonResponse<{ success: true; data: ProfilePayload }>(response);

        if (active) {
          setPayload(result.data);
          setForm(buildFormState(result.data));
          setFeedback(null);
        }
      } catch (requestError) {
        if (active) {
          setError(requestError instanceof Error ? requestError.message : "Não foi possível carregar seu perfil.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void run();

    return () => {
      active = false;
    };
  }, [isSigningOut, router]);

  async function handleLogout() {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);
    setError(null);
    setFeedback(null);
    setIsEditing(false);

    await signOutAndRedirect({
      supabaseClient: supabase,
      redirectTo: "/",
      onBeforeRedirect: () => {
        setPayload(null);
      },
      onError: (signOutError) => {
        console.error("PROFILE SIGN OUT ERROR:", signOutError);
      }
    });
  }

  function handleEdit() {
    if (!payload) {
      return;
    }

    setForm(buildFormState(payload));
    setFeedback(null);
    setIsEditing(true);
  }

  function handleCancel() {
    if (!payload) {
      return;
    }

    setForm(buildFormState(payload));
    setFeedback(null);
    setIsEditing(false);
  }

  async function handleSave() {
    if (!payload || isSaving) {
      return;
    }

    if (!form.name.trim()) {
      setFeedback({ tone: "error", text: "Informe seu nome para salvar o perfil." });
      return;
    }

    if (!isValidEmail(form.email)) {
      setFeedback({ tone: "error", text: "Informe um e-mail válido." });
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      const response = await fetchWithAuth("/api/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          profession: form.profession,
          age: form.age,
          weight: form.weight,
          height: form.height,
          goal: form.goal,
          gender: form.gender,
          body_type: form.body_type,
          days: form.days,
          time: form.time,
          equipment: form.equipment
        })
      });

      const result = await parseJsonResponse<{ success: boolean; data?: ProfilePayload; error?: string }>(response);

      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.error ?? "Não foi possível salvar seu perfil.");
      }

      setPayload(result.data);
      setForm(buildFormState(result.data));
      setIsEditing(false);
      setFeedback({ tone: "success", text: "Seus dados foram salvos com sucesso." });
    } catch (saveError) {
      setFeedback({
        tone: "error",
        text: saveError instanceof Error ? saveError.message : "Não foi possível salvar seu perfil."
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleGenerateWorkout() {
    if (!payload || isGenerating) {
      return;
    }

    if (isEditing) {
      setFeedback({
        tone: "info",
        text: "Salve suas alteracoes antes de gerar um novo treino."
      });
      return;
    }

    setIsGenerating(true);
    setFeedback(null);

    try {
      const response = await fetchWithAuth("/api/workout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          userId: payload.user.id
        })
      });

      const result = await parseJsonResponse<{ success: boolean; error?: string }>(response);

      if (!response.ok || !result.success) {
        throw new Error(result.error ?? "Não foi possível gerar seu treino agora.");
      }

      router.push("/dashboard");
      router.refresh();
    } catch (generationError) {
      setFeedback({
        tone: "error",
        text: generationError instanceof Error ? generationError.message : "Não foi possível gerar seu treino agora."
      });
    } finally {
      setIsGenerating(false);
    }
  }

  if (loading || isSigningOut) {
    return (
      <PageShell>
        <Container className="py-12">
          <Card className="mx-auto max-w-4xl">
            <div className="flex min-h-[240px] items-center justify-center text-sm text-white/64">
              {isSigningOut ? "Saindo..." : "Carregando..."}
            </div>
          </Card>
        </Container>
      </PageShell>
    );
  }

  if (error || !payload) {
    return (
      <PageShell>
        <Container className="py-12">
          <Card className="mx-auto max-w-4xl space-y-3">
            <h1 className="text-2xl font-semibold text-white">Não foi possível abrir seu perfil</h1>
            <p className="text-sm text-white/64">{error ?? "Perfil indisponivel."}</p>
          </Card>
        </Container>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <AppSessionTracker userId={payload.user.id} source="profile" />
      <Container className="max-w-5xl space-y-5 py-6">
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-white/15 px-4 py-2 text-sm font-semibold text-white/80 transition hover:border-primary/30 hover:bg-white/5 hover:text-white"
          >
            ← Voltar para o treino
          </button>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1">
              <p className="text-sm uppercase tracking-[0.24em] text-primary">Meu perfil</p>
              <h1 className="text-3xl font-semibold text-white">Seus dados e preferências</h1>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap lg:justify-end">
              {isEditing ? (
                <>
                  <Button
                    variant="secondary"
                    onClick={handleCancel}
                    disabled={isSaving || isGenerating}
                    className="w-full sm:w-auto"
                  >
                    Cancelar
                  </Button>
                  <Button onClick={handleSave} disabled={isSaving || isGenerating} className="w-full sm:w-auto">
                    {isSaving ? "Salvando..." : "Salvar"}
                  </Button>
                </>
              ) : (
                <Button onClick={handleEdit} disabled={isGenerating} className="w-full sm:w-auto">
                  Editar
                </Button>
              )}
            </div>
          </div>

          {feedback ? <FeedbackBanner feedback={feedback} /> : null}
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="space-y-4">
            <h2 className="text-xl font-semibold text-white">Informações básicas</h2>
            <ProfileGrid
              columns={1}
              items={[
                {
                  label: "Nome",
                  content: isEditing ? (
                    <TextInput
                      value={form.name}
                      onChange={(value) => updateForm(setForm, "name", value)}
                      placeholder="Seu nome"
                    />
                  ) : (
                    <StaticValue>{payload.user.name || "Não informado"}</StaticValue>
                  )
                },
                {
                  label: "E-mail",
                  content: isEditing ? (
                    <TextInput
                      type="email"
                      value={form.email}
                      onChange={(value) => updateForm(setForm, "email", value)}
                      placeholder="você@exemplo.com"
                    />
                  ) : (
                    <StaticValue>{payload.user.email || "Não informado"}</StaticValue>
                  )
                },
                {
                  label: "Profissao",
                  content: isEditing ? (
                    <TextInput
                      value={form.profession}
                      onChange={(value) => updateForm(setForm, "profession", value)}
                      placeholder="Ex: trabalho sentado"
                    />
                  ) : (
                    <StaticValue>{payload.answers.profession?.trim() || "Não informado"}</StaticValue>
                  )
                }
              ]}
            />
          </Card>

          <Card className="space-y-4">
            <h2 className="text-xl font-semibold text-white">Dados físicos</h2>
            <ProfileGrid
              columns={1}
              items={[
                {
                  label: "Idade",
                  content: isEditing ? (
                    <TextInput
                      type="number"
                      inputMode="numeric"
                      min={12}
                      max={80}
                      value={form.age}
                      onChange={(value) => updateForm(setForm, "age", value)}
                      placeholder="25"
                    />
                  ) : (
                    <StaticValue>{formatAge(payload.answers.age)}</StaticValue>
                  )
                },
                {
                  label: "Peso",
                  content: isEditing ? (
                    <TextInput
                      type="number"
                      inputMode="decimal"
                      min={30}
                      max={200}
                      value={form.weight}
                      onChange={(value) => updateForm(setForm, "weight", value)}
                      placeholder="70"
                    />
                  ) : (
                    <StaticValue>{formatWeight(payload.answers.weight)}</StaticValue>
                  )
                },
                {
                  label: "Altura",
                  content: isEditing ? (
                    <TextInput
                      type="number"
                      inputMode="numeric"
                      min={140}
                      max={210}
                      value={form.height}
                      onChange={(value) => updateForm(setForm, "height", value)}
                      placeholder="170"
                    />
                  ) : (
                    <StaticValue>{formatHeight(payload.answers.height)}</StaticValue>
                  )
                }
              ]}
            />
          </Card>
        </div>

        <Card className="space-y-4">
          <h2 className="text-xl font-semibold text-white">Dados do treino</h2>
          <ProfileGrid
            items={[
              {
                label: "Objetivo",
                content: isEditing ? (
                  <SelectField
                    value={form.goal}
                    options={GOAL_OPTIONS}
                    onChange={(value) => updateForm(setForm, "goal", value)}
                  />
                ) : (
                  <StaticValue>{formatGoal(payload.answers.goal)}</StaticValue>
                )
              },
              {
                label: "Gênero",
                content: isEditing ? (
                  <SelectField
                    value={form.gender}
                    options={GENDER_OPTIONS}
                    onChange={(value) => updateForm(setForm, "gender", value)}
                  />
                ) : (
                  <StaticValue>{formatGender(payload.answers.gender)}</StaticValue>
                )
              },
              {
                label: "Biotipo físico",
                content: isEditing ? (
                  <SelectField
                    value={form.body_type}
                    options={BODY_TYPE_OPTIONS}
                    onChange={(value) => updateForm(setForm, "body_type", value)}
                  />
                ) : (
                  <StaticValue>
                    {formatBodyType(payload.answers.body_type ?? payload.answers.body_type_raw ?? payload.answers.wrist)}
                  </StaticValue>
                )
              },
              {
                label: "Dias disponiveis",
                content: isEditing ? (
                  <SelectField
                    value={form.days}
                    options={DAYS_OPTIONS}
                    onChange={(value) => updateForm(setForm, "days", value)}
                  />
                ) : (
                  <StaticValue>{formatDays(payload.answers.days)}</StaticValue>
                )
              },
              {
                label: "Tempo por treino",
                content: isEditing ? (
                  <SelectField
                    value={form.time}
                    options={TIME_OPTIONS}
                    onChange={(value) => updateForm(setForm, "time", value)}
                  />
                ) : (
                  <StaticValue>{formatTime(payload.answers.time)}</StaticValue>
                )
              }
            ]}
          />

          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.16em] text-white/45">Equipamentos</p>

            {isEditing ? (
              <div className="flex flex-wrap gap-2">
                {EQUIPMENT_OPTIONS.map((option) => {
                  const selected = form.equipment.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => toggleEquipment(setForm, option.value)}
                      className={clsx(
                        "inline-flex min-h-11 items-center justify-center rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] transition",
                        selected
                          ? "border-primary/40 bg-primary/12 text-white"
                          : "border-white/10 bg-white/[0.04] text-white/72 hover:bg-white/[0.08] hover:text-white"
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            ) : (
              <BadgeGroup className="min-w-0">
                {(payload.answers.equipment?.length ? payload.answers.equipment : ["nenhum"]).map((item) => (
                  <Badge key={item}>{formatEquipment(item)}</Badge>
                ))}
              </BadgeGroup>
            )}
          </div>
        </Card>

        {ENABLE_WORKOUT_REGENERATION ? (
          <Card className="space-y-4">
          <div className="space-y-1">
            <p className="text-sm uppercase tracking-[0.24em] text-primary">Novo treino</p>
            <h2 className="text-xl font-semibold text-white">Gerar novo treino com os dados salvos</h2>
            <p className="text-sm text-white/64">
              O treino só é recalculado quando você clicar neste botão. Salvar o perfil não dispara uma nova geração.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-white/64">
              {isEditing
                ? "Salve ou cancele a edição atual antes de gerar um novo treino."
                : "Quando quiser atualizar seu plano, use os dados mais recentes que ficaram salvos no perfil."}
            </p>

            <Button
              onClick={handleGenerateWorkout}
              disabled={isEditing || isSaving || isGenerating}
              className="w-full sm:w-auto"
            >
              {isGenerating ? "Gerando novo treino..." : "Gerar novo treino"}
            </Button>
          </div>
          </Card>
        ) : null}

        <div className="pt-2">
          <Button
            variant="secondary"
            onClick={handleLogout}
            disabled={isSigningOut || isSaving || isGenerating}
            className="min-h-10 border-white/10 bg-transparent px-4 py-2 text-white/64 hover:bg-white/[0.04] hover:text-white"
          >
            {isSigningOut ? "Saindo..." : "Sair da conta"}
          </Button>
        </div>
      </Container>
    </PageShell>
  );
}

function ProfileGrid({
  items,
  columns = 3
}: {
  items: Array<{ label: string; content: ReactNode }>;
  columns?: 1 | 2 | 3;
}) {
  const className =
    columns === 1
      ? "grid gap-4"
      : columns === 2
        ? "grid gap-4 sm:grid-cols-2"
        : "grid gap-4 sm:grid-cols-2 lg:grid-cols-3";

  return (
    <div className={className}>
      {items.map((item) => (
        <div key={item.label} className="rounded-[22px] border border-white/10 bg-black/20 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-white/45">{item.label}</p>
          <div className="mt-2">{item.content}</div>
        </div>
      ))}
    </div>
  );
}

function FeedbackBanner({ feedback }: { feedback: FeedbackState }) {
  const toneClassName =
    feedback.tone === "success"
      ? "border-primary/30 bg-primary/12 text-primary"
      : feedback.tone === "info"
        ? "border-white/15 bg-white/[0.04] text-white/80"
        : "border-red-400/30 bg-red-500/10 text-red-200";

  return <div className={clsx("rounded-2xl px-4 py-3 text-sm", toneClassName)}>{feedback.text}</div>;
}

function StaticValue({ children }: { children: ReactNode }) {
  return <p className="break-words text-sm font-medium text-white">{children}</p>;
}

function TextInput({
  value,
  onChange,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      {...props}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={clsx(
        "min-h-12 w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 text-sm text-white outline-none transition focus:border-primary",
        className
      )}
    />
  );
}

function SelectField({
  value,
  options,
  onChange
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="min-h-12 w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 text-sm text-white outline-none transition focus:border-primary"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value} className="bg-[#101010] text-white">
          {option.label}
        </option>
      ))}
    </select>
  );
}

function buildFormState(payload: ProfilePayload): ProfileFormState {
  return {
    name: payload.user.name ?? "",
    email: payload.user.email ?? "",
    profession: payload.answers.profession ?? "",
    age: payload.answers.age ? String(payload.answers.age) : "",
    weight: payload.answers.weight ? String(payload.answers.weight) : "",
    height: payload.answers.height ? String(payload.answers.height) : "",
    goal: payload.answers.goal ?? GOAL_OPTIONS[0].value,
    gender: payload.answers.gender ?? GENDER_OPTIONS[0].value,
    body_type:
      payload.answers.body_type ??
      normalizeBodyTypeValue(payload.answers.body_type_raw ?? payload.answers.wrist) ??
      BODY_TYPE_OPTIONS[0].value,
    days: payload.answers.days ? String(payload.answers.days) : "3",
    time: payload.answers.time ? String(payload.answers.time) : "45",
    equipment: normalizeEquipment(payload.answers.equipment)
  };
}

function updateForm(setForm: Dispatch<SetStateAction<ProfileFormState>>, field: keyof ProfileFormState, value: string) {
  setForm((current) => ({
    ...current,
    [field]: value
  }));
}

function toggleEquipment(
  setForm: Dispatch<SetStateAction<ProfileFormState>>,
  value: string
) {
  setForm((current) => {
    const currentEquipment = current.equipment.length ? current.equipment : ["nenhum"];

    if (value === "nenhum") {
      return {
        ...current,
        equipment: ["nenhum"]
      };
    }

    const withoutNone = currentEquipment.filter((item) => item !== "nenhum");
    const exists = withoutNone.includes(value);
    const nextEquipment = exists ? withoutNone.filter((item) => item !== value) : [...withoutNone, value];

    return {
      ...current,
      equipment: nextEquipment.length ? nextEquipment : ["nenhum"]
    };
  });
}

function normalizeBodyTypeValue(value?: string) {
  const normalized = value?.trim().toLowerCase() ?? "";

  if (normalized === "endomorph" || normalized === "mesomorph" || normalized === "ectomorph") {
    return normalized;
  }

  if (normalized === "not_touch" || normalized === "dont_touch") {
    return "endomorph";
  }

  if (normalized === "just_touch") {
    return "mesomorph";
  }

  if (normalized === "overlap") {
    return "ectomorph";
  }

  return undefined;
}

function normalizeEquipment(equipment?: string[]) {
  const filtered = (Array.isArray(equipment) ? equipment : []).filter((item) =>
    EQUIPMENT_OPTIONS.some((option) => option.value === item)
  );

  if (!filtered.length) {
    return ["nenhum"];
  }

  if (filtered.includes("nenhum")) {
    return ["nenhum"];
  }

  return filtered;
}

function formatGoal(goal?: string) {
  return GOAL_OPTIONS.find((option) => option.value === goal)?.label ?? "Não informado";
}

function formatGender(gender?: string) {
  return GENDER_OPTIONS.find((option) => option.value === gender)?.label ?? "Não informado";
}

function formatBodyType(value?: string) {
  return value ? formatBodyTypeLabel(value) : "Não informado";
}

function formatDays(value?: number) {
  const days = Number(value);
  return Number.isFinite(days) && days > 0 ? `${days} ${days === 1 ? "dia" : "dias"} por semana` : "Não informado";
}

function formatTime(value?: number) {
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes > 0 ? `${minutes} min` : "Não informado";
}

function formatAge(value?: number) {
  const age = Number(value);
  return Number.isFinite(age) && age > 0 ? `${age} anos` : "Não informado";
}

function formatWeight(value?: number) {
  const weight = Number(value);
  return Number.isFinite(weight) && weight > 0 ? `${weight} kg` : "Não informado";
}

function formatHeight(value?: number) {
  const height = Number(value);
  return Number.isFinite(height) && height > 0 ? `${height} cm` : "Não informado";
}

function formatEquipment(value: string) {
  return EQUIPMENT_OPTIONS.find((option) => option.value === value)?.label ?? value;
}
