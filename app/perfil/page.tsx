"use client";

import clsx from "clsx";
import { Bell, CalendarDays, ChevronRight, Lock, Ruler, Shield, Target, UserRound, Weight } from "lucide-react";
import Link from "next/link";
import { Dispatch, InputHTMLAttributes, ReactNode, SetStateAction, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppSessionTracker } from "@/components/app-session-tracker";
import { AppShell } from "@/components/app-shell";
import { Button, Card } from "@/components/ui";
import { parseJsonResponse } from "@/lib/api";
import { trackEvent as trackAppEvent } from "@/lib/analytics-client";
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
  { value: "elasticos", label: "Elasticos" },
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

type EditingSection = "personal" | "physical" | "training";

export default function PerfilPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingSection, setEditingSection] = useState<EditingSection | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
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

  function handleCancel() {
    if (!payload) {
      return;
    }

    setForm(buildFormState(payload));
    setFeedback(null);
    setIsEditing(false);
    setEditingSection(null);
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
      setFeedback({ tone: "error", text: "Informe um e-mail valido." });
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
      setEditingSection(null);
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

      trackAppEvent("workout_generated", payload.user.id, {
        goal: payload.answers.goal ?? null,
        source: "profile_regenerate"
      });
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

  function openSection(section: EditingSection) {
    if (!payload) {
      return;
    }

    setForm(buildFormState(payload));
    setFeedback(null);
    setEditingSection(section);
    setIsEditing(true);
  }

  // ── Loading / signing out ───────────────────────────────────────────────────

  if (loading || isSigningOut) {
    return (
      <AppShell>
        <Card className="p-5 sm:p-6">
          <div className="flex min-h-[240px] items-center justify-center text-sm text-white/64">
            {isSigningOut ? "Saindo..." : "Carregando..."}
          </div>
        </Card>
      </AppShell>
    );
  }

  if (error || !payload) {
    return (
      <AppShell>
        <Card className="space-y-3 p-5 sm:p-6">
          <h1 className="text-2xl font-semibold text-white">Não foi possível abrir seu perfil</h1>
          <p className="text-sm text-white/64">{error ?? "Perfil indisponivel."}</p>
        </Card>
      </AppShell>
    );
  }

  // ── Editing view ────────────────────────────────────────────────────────────

  if (isEditing && editingSection) {
    const sectionTitle: Record<EditingSection, string> = {
      personal: "Dados Pessoais",
      physical: "Dados Físicos",
      training: "Dados de Treino"
    };

    return (
      <AppShell>
        <AppSessionTracker userId={payload.user.id} source="profile" />

        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-white">{sectionTitle[editingSection]}</h1>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={handleCancel}
              disabled={isSaving}
              className="min-h-10 text-sm"
            >
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving} className="min-h-10 text-sm">
              {isSaving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>

        {feedback ? <FeedbackBanner feedback={feedback} /> : null}

        {editingSection === "personal" && (
          <Card className="space-y-5 p-5">
            <div className="space-y-2">
              <p className="text-xs text-white/50">Nome</p>
              <TextInput
                value={form.name}
                onChange={(value) => updateForm(setForm, "name", value)}
                placeholder="Seu nome"
              />
            </div>
            <div className="space-y-2">
              <p className="text-xs text-white/50">E-mail</p>
              <TextInput
                type="email"
                value={form.email}
                onChange={(value) => updateForm(setForm, "email", value)}
                placeholder="voce@exemplo.com"
              />
            </div>
            <div className="space-y-2">
              <p className="text-xs text-white/50">Profissão</p>
              <TextInput
                value={form.profession}
                onChange={(value) => updateForm(setForm, "profession", value)}
                placeholder="Ex: trabalho sentado"
              />
            </div>
          </Card>
        )}

        {editingSection === "physical" && (
          <Card className="space-y-5 p-5">
            <div className="space-y-2">
              <p className="text-xs text-white/50">Idade</p>
              <TextInput
                type="number"
                inputMode="numeric"
                min={12}
                max={80}
                value={form.age}
                onChange={(value) => updateForm(setForm, "age", value)}
                placeholder="25"
              />
            </div>
            <div className="space-y-2">
              <p className="text-xs text-white/50">Peso (kg)</p>
              <TextInput
                type="number"
                inputMode="decimal"
                min={30}
                max={200}
                value={form.weight}
                onChange={(value) => updateForm(setForm, "weight", value)}
                placeholder="70"
              />
            </div>
            <div className="space-y-2">
              <p className="text-xs text-white/50">Altura (cm)</p>
              <TextInput
                type="number"
                inputMode="numeric"
                min={140}
                max={210}
                value={form.height}
                onChange={(value) => updateForm(setForm, "height", value)}
                placeholder="170"
              />
            </div>
            <div className="space-y-2">
              <p className="text-xs text-white/50">Biotipo</p>
              <SelectField
                value={form.body_type}
                options={BODY_TYPE_OPTIONS}
                onChange={(value) => updateForm(setForm, "body_type", value)}
              />
            </div>
            <div className="space-y-2">
              <p className="text-xs text-white/50">Gênero</p>
              <SelectField
                value={form.gender}
                options={GENDER_OPTIONS}
                onChange={(value) => updateForm(setForm, "gender", value)}
              />
            </div>
          </Card>
        )}

        {editingSection === "training" && (
          <Card className="space-y-5 p-5">
            <div className="space-y-2">
              <p className="text-xs text-white/50">Objetivo</p>
              <SelectField
                value={form.goal}
                options={GOAL_OPTIONS}
                onChange={(value) => updateForm(setForm, "goal", value)}
              />
            </div>
            <div className="space-y-2">
              <p className="text-xs text-white/50">Dias disponíveis</p>
              <SelectField
                value={form.days}
                options={DAYS_OPTIONS}
                onChange={(value) => updateForm(setForm, "days", value)}
              />
            </div>
            <div className="space-y-2">
              <p className="text-xs text-white/50">Tempo por treino</p>
              <SelectField
                value={form.time}
                options={TIME_OPTIONS}
                onChange={(value) => updateForm(setForm, "time", value)}
              />
            </div>
            <div className="space-y-3">
              <p className="text-xs text-white/50">Equipamentos</p>
              <div className="flex flex-wrap gap-2">
                {EQUIPMENT_OPTIONS.map((option) => {
                  const selected = form.equipment.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => toggleEquipment(setForm, option.value)}
                      className={clsx(
                        "inline-flex min-h-10 items-center justify-center rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] transition",
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
            </div>
          </Card>
        )}
      </AppShell>
    );
  }

  // ── Profile view ────────────────────────────────────────────────────────────

  const userInitial = (payload.user.name?.[0] ?? "U").toUpperCase();

  return (
    <AppShell>
      <AppSessionTracker userId={payload.user.id} source="profile" />

      {/* Cabeçalho */}
      <div className="space-y-1">
        <h1 className="text-[1.9rem] font-semibold leading-tight text-white">Perfil</h1>
        <p className="text-sm text-white/56">Gerencie seus dados e preferências</p>
      </div>

      {/* Card do usuário */}
      <div className="rounded-[20px] border border-primary/20 bg-primary/10 p-4">
        <div className="flex items-start gap-3.5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-black">
            {userInitial}
          </div>
          <div className="min-w-0 space-y-1">
            <p className="font-semibold leading-snug text-white">{payload.user.name || "Sem nome"}</p>
            <p className="text-[13px] text-white/60">{payload.user.email || "Sem e-mail"}</p>
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              <span className="rounded-full bg-primary/25 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                {getLevelBadge(payload.answers.goal)}
              </span>
              <span className="rounded-full border border-white/12 bg-white/5 px-2.5 py-0.5 text-[11px] text-white/65">
                {formatGoal(payload.answers.goal)}
              </span>
              {payload.answers.age ? (
                <span className="rounded-full border border-white/12 bg-white/5 px-2.5 py-0.5 text-[11px] text-white/65">
                  {payload.answers.age} anos
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Estatísticas rápidas */}
      <div className="grid grid-cols-3 gap-2.5">
        <StatCard
          icon={<Weight className="h-4 w-4 text-white/30" />}
          value={payload.answers.weight ? `${payload.answers.weight} kg` : "—"}
          label="Peso"
        />
        <StatCard
          icon={<Ruler className="h-4 w-4 text-white/30" />}
          value={payload.answers.height ? `${payload.answers.height} cm` : "—"}
          label="Altura"
        />
        <StatCard
          icon={<CalendarDays className="h-4 w-4 text-white/30" />}
          value={payload.answers.days ? `${payload.answers.days}x` : "—"}
          label="Dias/sem"
        />
      </div>

      {/* Plano Atual */}
      <Card className="p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">Plano Atual</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[12px] font-semibold text-primary">
            Gratuito
          </span>
          <Link
            href="/dashboard"
            className="text-[13px] font-semibold text-primary transition hover:text-primary/80"
          >
            Ver plano
          </Link>
        </div>
      </Card>

      {feedback ? <FeedbackBanner feedback={feedback} /> : null}

      {/* Meus Dados */}
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/36">Meus Dados</p>
        <Card className="overflow-hidden p-0">
          <SettingsRow
            icon={<UserRound className="h-5 w-5 text-primary" />}
            title="Dados Pessoais"
            subtitle={`${payload.user.name || "—"} · ${truncate(payload.answers.profession, 20)}`}
            onClick={() => openSection("personal")}
          />
          <SettingsRow
            icon={<Weight className="h-5 w-5 text-primary" />}
            title="Dados Físicos"
            subtitle={`${formatBodyType(payload.answers.body_type ?? payload.answers.body_type_raw ?? payload.answers.wrist)} · ${payload.answers.weight ?? "—"}kg · ${payload.answers.height ?? "—"}cm`}
            onClick={() => openSection("physical")}
          />
          <SettingsRow
            icon={<Target className="h-5 w-5 text-primary" />}
            title="Dados de Treino"
            subtitle={`${formatGoal(payload.answers.goal)} · ${payload.answers.days ?? "—"}x/sem · ${payload.answers.time ?? "—"}min`}
            onClick={() => openSection("training")}
            isLast
          />
        </Card>
      </div>

      {/* Preferências */}
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/36">Preferências</p>
        <Card className="overflow-hidden p-0">
          <div className="flex items-center gap-3 border-b border-white/8 px-4 py-3.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] bg-primary/15">
              <Bell className="h-5 w-5 text-primary" />
            </div>
            <span className="flex-1 text-sm font-medium text-white">Notificações</span>
            {/* TODO: integrar com web push */}
            <button
              type="button"
              role="switch"
              aria-checked={notificationsEnabled}
              onClick={() => setNotificationsEnabled((prev) => !prev)}
              className={clsx(
                "relative h-6 w-11 shrink-0 rounded-full transition-colors",
                notificationsEnabled ? "bg-primary" : "bg-white/20"
              )}
            >
              <span
                className={clsx(
                  "absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                  notificationsEnabled ? "translate-x-[22px]" : "translate-x-0.5"
                )}
              />
            </button>
          </div>
          <Link
            href="/privacidade"
            className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-white/[0.03]"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] bg-primary/15">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <span className="flex-1 text-sm font-medium text-white">Privacidade</span>
            <ChevronRight className="h-4 w-4 text-white/30" />
          </Link>
        </Card>
      </div>

      {/* Card Premium — placeholder para gerar treino */}
      <Card className="space-y-4 p-4">
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">Premium</p>
          <p className="font-semibold text-white">Gerar plano personalizado</p>
          <p className="text-[13px] leading-5 text-white/54">
            Atualize seu plano sempre que mudar seus dados físicos ou de treino.
          </p>
        </div>
        {/* Botão desabilitado — recurso premium. handleGenerateWorkout e
            ENABLE_WORKOUT_REGENERATION mantidos abaixo para integração futura. */}
        <button
          type="button"
          disabled
          title="Disponível em breve para planos premium"
          className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white/38 cursor-not-allowed"
        >
          <Lock className="h-4 w-4" />
          Em breve
        </button>
        {ENABLE_WORKOUT_REGENERATION && false ? (
          <Button onClick={handleGenerateWorkout} disabled={isEditing || isSaving || isGenerating}>
            {isGenerating ? "Gerando novo treino..." : "Gerar novo treino"}
          </Button>
        ) : null}
      </Card>

      {/* Sair da conta */}
      <div className="pt-1">
        <button
          type="button"
          onClick={handleLogout}
          disabled={isSigningOut || isSaving || isGenerating}
          className="text-sm text-white/40 transition hover:text-red-400 disabled:opacity-50"
        >
          {isSigningOut ? "Saindo..." : "Sair da conta"}
        </button>
      </div>
    </AppShell>
  );
}

// ── UI components ─────────────────────────────────────────────────────────────

function FeedbackBanner({ feedback }: { feedback: FeedbackState }) {
  const toneClassName =
    feedback.tone === "success"
      ? "border-primary/30 bg-primary/12 text-primary"
      : feedback.tone === "info"
        ? "border-white/15 bg-white/[0.04] text-white/80"
        : "border-red-400/30 bg-red-500/10 text-red-200";

  return <div className={clsx("rounded-2xl border px-4 py-3 text-sm", toneClassName)}>{feedback.text}</div>;
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

function StatCard({ icon, value, label }: { icon: ReactNode; value: string; label: string }) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-3 text-center">
      <div className="flex justify-center">{icon}</div>
      <p className="mt-1.5 text-[1.05rem] font-semibold leading-none text-white">{value}</p>
      <p className="mt-1 text-[11px] text-white/50">{label}</p>
    </div>
  );
}

function SettingsRow({
  icon,
  title,
  subtitle,
  onClick,
  isLast = false
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
  isLast?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-white/[0.03]",
        !isLast && "border-b border-white/8"
      )}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] bg-primary/15">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-white">{title}</p>
        <p className="mt-0.5 truncate text-xs text-white/46">{subtitle}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-white/30" />
    </button>
  );
}

// ── Utilities ─────────────────────────────────────────────────────────────────

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
  setForm((current) => ({ ...current, [field]: value }));
}

function toggleEquipment(setForm: Dispatch<SetStateAction<ProfileFormState>>, value: string) {
  setForm((current) => {
    const currentEquipment = current.equipment.length ? current.equipment : ["nenhum"];

    if (value === "nenhum") {
      return { ...current, equipment: ["nenhum"] };
    }

    const withoutNone = currentEquipment.filter((item) => item !== "nenhum");
    const exists = withoutNone.includes(value);
    const nextEquipment = exists ? withoutNone.filter((item) => item !== value) : [...withoutNone, value];

    return { ...current, equipment: nextEquipment.length ? nextEquipment : ["nenhum"] };
  });
}

function normalizeBodyTypeValue(value?: string) {
  const normalized = value?.trim().toLowerCase() ?? "";

  if (normalized === "endomorph" || normalized === "mesomorph" || normalized === "ectomorph") {
    return normalized;
  }
  if (normalized === "not_touch" || normalized === "dont_touch") return "endomorph";
  if (normalized === "just_touch") return "mesomorph";
  if (normalized === "overlap") return "ectomorph";

  return undefined;
}

function normalizeEquipment(equipment?: string[]) {
  const filtered = (Array.isArray(equipment) ? equipment : []).filter((item) =>
    EQUIPMENT_OPTIONS.some((option) => option.value === item)
  );

  if (!filtered.length) return ["nenhum"];
  if (filtered.includes("nenhum")) return ["nenhum"];
  return filtered;
}

function truncate(value?: string, max = 20) {
  if (!value) return "—";
  return value.length > max ? value.slice(0, max) + "..." : value;
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

function getLevelBadge(goal?: string) {
  if (goal === "gain_muscle" || goal === "body_recomposition") return "Intermediário";
  if (goal === "improve_conditioning") return "Avançado";
  return "Iniciante";
}