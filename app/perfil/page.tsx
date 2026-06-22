"use client";

import clsx from "clsx";
import { Bell, CalendarDays, ChevronRight, CreditCard, Dumbbell, Lock, Ruler, Shield, Sparkles, Target, UserRound, Weight, X } from "lucide-react";
import Link from "next/link";
import { Dispatch, InputHTMLAttributes, ReactNode, SetStateAction, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ShareButton } from "@/components/share-button";
import { AppSessionTracker } from "@/components/app-session-tracker";
import { AppShell } from "@/components/app-shell";
import { UpsellModal } from "@/components/upsell-modal";
import { useSubscription } from "@/components/use-subscription";
import { invalidateWorkoutCache } from "@/components/use-workout-app-state";
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
    focusRegion?: string;
    trainingStyle?: string;
    trainingStyles?: string[];
    days?: number;
    time?: number;
    equipment?: string[];
  };
  excludedExercises?: Array<{ exerciseId: string; exerciseName: string }>;
  totalWorkoutsAllTime?: number;
  lastWorkoutGeneratedAt?: string | null;
  currentPhase?: string | null;
  phaseLabel?: string | null;
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
  focusRegion: string;
  trainingStyle: string;
  trainingStyles: string[];
};

type FeedbackState = {
  tone: "success" | "error" | "info";
  text: string;
};

type ReferralData = {
  code: string;
  link: string;
  count: number;
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

const FOCUS_REGION_OPTIONS = [
  { value: "balanced", label: "Todos / Equilibrado" },
  { value: "chest", label: "Peito" },
  { value: "back", label: "Dorsais" },
  { value: "legs", label: "Pernas" },
  { value: "legs_glutes", label: "Pernas e Glúteo" },
  { value: "arms", label: "Braços" }
];

const TRAINING_STYLE_OPTIONS = [
  { value: "personal", label: "Personal Escolhe" },
  { value: "musculacao", label: "Tradicional" },
  { value: "funcional", label: "Funcional" },
  { value: "hiit", label: "HIIT" },
  { value: "calistenia", label: "Calistenia" }
];

const EQUIPMENT_OPTIONS = [
  { value: "halteres", label: "Halteres" },
  { value: "elasticos", label: "Elasticos" },
  { value: "fitball", label: "Fitball" },
  { value: "fita_suspensa", label: "Fita suspensa" },
  { value: "caneleira", label: "Caneleira" },
  { value: "kettlebell", label: "Kettlebell" },
  { value: "rolo_abdominal", label: "Rolo Abdominal" },
  { value: "barra_fixa", label: "Barra Fixa" },
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
  equipment: ["nenhum"],
  focusRegion: "balanced",
  trainingStyle: "personal",
  trainingStyles: []
};

type EditingSection = "personal" | "physical" | "training";

export default function PerfilPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [showWorkoutUpsell, setShowWorkoutUpsell] = useState(false);
  const { subscription, loading: subscriptionLoading } = useSubscription();
  const [isEditing, setIsEditing] = useState(false);
  const [editingSection, setEditingSection] = useState<EditingSection | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [pushSubscription, setPushSubscription] = useState<PushSubscription | null>(null);

  // Detecta estado real da permissão/subscription ao montar
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    navigator.serviceWorker.ready.then((reg) => reg.pushManager.getSubscription()).then((sub) => {
      setPushSubscription(sub);
      setNotificationsEnabled(Boolean(sub));
    }).catch(() => {});
  }, []);
  const [isSaving, setIsSaving] = useState(false);
  const [showPremiumStyleModal, setShowPremiumStyleModal] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const generatingAnimFrameRef = useRef(0);
  const generatingCardRef = useRef<HTMLDivElement | null>(null);
  const [isManagingSubscription, setIsManagingSubscription] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [payload, setPayload] = useState<ProfilePayload | null>(null);
  const [form, setForm] = useState<ProfileFormState>(EMPTY_FORM_STATE);
  const [excludedExercises, setExcludedExercises] = useState<Array<{ exerciseId: string; exerciseName: string }>>([]);
  const [removingExerciseId, setRemovingExerciseId] = useState<string | null>(null);
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false);
  const [referralData, setReferralData] = useState<ReferralData | null>(null);
  const [referralLoading, setReferralLoading] = useState(true);
  const [referralCopied, setReferralCopied] = useState(false);

  // ── Seletor unificado de estilo de treino ───────────────────────────────
  // 1 estilo (ou "Personal Escolhe") é grátis; 2+ estilos é Premium.
  const isPremiumUser = Boolean(subscription?.isPremium);
  const selectedStyles: string[] =
    form.trainingStyles.length >= 2
      ? form.trainingStyles
      : [form.trainingStyle && form.trainingStyle !== "personal" ? form.trainingStyle : "personal"];

  const applyStyleSelection = (next: string[]) => {
    const concrete = next.filter((style) => style !== "personal");
    if (concrete.length >= 2) {
      setForm((current) => ({ ...current, trainingStyle: concrete[0], trainingStyles: concrete }));
    } else if (concrete.length === 1) {
      setForm((current) => ({ ...current, trainingStyle: concrete[0], trainingStyles: [] }));
    } else {
      setForm((current) => ({ ...current, trainingStyle: "personal", trainingStyles: [] }));
    }
  };

  const toggleTrainingStyle = (value: string) => {
    if (value === "personal") {
      applyStyleSelection(["personal"]);
      return;
    }
    const concrete = selectedStyles.filter((style) => style !== "personal");
    if (concrete.includes(value)) {
      applyStyleSelection(concrete.filter((style) => style !== value));
      return;
    }
    // Tentar adicionar um 2º estilo sem ser Premium → abre upsell
    if (concrete.length >= 1 && !isPremiumUser) {
      setShowPremiumStyleModal(true);
      return;
    }
    applyStyleSelection([...concrete, value]);
  };

  // Animação da barra de progresso durante geração do treino
  useEffect(() => {
    if (!isGenerating) {
      setLoadingProgress(0);
      window.cancelAnimationFrame(generatingAnimFrameRef.current);
      return;
    }

    // Scroll para o card de progresso assim que ele aparecer
    window.requestAnimationFrame(() => {
      generatingCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    const startTime = window.performance.now();
    setLoadingProgress(WORKOUT_LOADING_INITIAL);

    const animate = () => {
      const elapsed = window.performance.now() - startTime;
      const next = getWorkoutLoadingProgress(elapsed);
      setLoadingProgress((current) => (next > current ? next : current));
      generatingAnimFrameRef.current = window.requestAnimationFrame(animate);
    };

    generatingAnimFrameRef.current = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(generatingAnimFrameRef.current);
    };
  }, [isGenerating]);

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
          setExcludedExercises(result.data.excludedExercises ?? []);
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
      redirectTo: "/login",
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
          equipment: form.equipment,
          focusRegion: form.focusRegion,
          trainingStyle: form.trainingStyle,
          // Multi-estilo só vale com 2+ selecionados; senão, o estilo único governa.
          trainingStyles: form.trainingStyles.length >= 2 ? form.trainingStyles : []
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

  async function handleToggleNotifications() {
    if (notificationsLoading || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    setNotificationsLoading(true);

    try {
      const reg = await navigator.serviceWorker.ready;

      if (notificationsEnabled && pushSubscription) {
        // Desativar
        await pushSubscription.unsubscribe();
        await fetchWithAuth("/api/push/unsubscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: pushSubscription.endpoint })
        });
        setPushSubscription(null);
        setNotificationsEnabled(false);
        return;
      }

      // Ativar — pede permissão se necessário
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setFeedback({ tone: "info", text: "Permissão de notificação negada. Habilite nas configurações do navegador." });
        return;
      }

      const vapidKeyStr = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
      // Converte base64url → Uint8Array (obrigatório em Firefox e Safari)
      const vapidKey = urlBase64ToUint8Array(vapidKeyStr);
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKey
      });

      const subJson = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await fetchWithAuth("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subJson)
      });

      setPushSubscription(sub);
      setNotificationsEnabled(true);
      setFeedback({ tone: "success", text: "Notificações ativadas com sucesso!" });
    } catch (err) {
      setFeedback({ tone: "error", text: "Não foi possível configurar notificações. Tente novamente." });
    } finally {
      setNotificationsLoading(false);
    }
  }

  function handleGenerateWorkoutClick() {
    if (!payload || isGenerating) return;
    if (isEditing) {
      setFeedback({ tone: "info", text: "Salve suas alterações antes de gerar um novo programa." });
      return;
    }
    setShowGenerateConfirm(true);
  }

  async function handleGenerateWorkout() {
    if (!payload || isGenerating) {
      return;
    }

    setShowGenerateConfirm(false);
    setIsGenerating(true);
    setFeedback(null);

    try {
      const response = await fetchWithAuth("/api/workout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          userId: payload.user.id,
          force: true
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
      setLoadingProgress(100);
      await new Promise((resolve) => window.setTimeout(resolve, 300));
      // O treino mudou: limpa o cache para o dashboard buscar a versão nova.
      invalidateWorkoutCache();
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

  async function handleManageSubscription() {
    if (isManagingSubscription) return;

    setIsManagingSubscription(true);
    setFeedback(null);

    try {
      const response = await fetchWithAuth("/api/stripe/portal", { method: "POST" });
      const result = await parseJsonResponse<{ success: boolean; data?: { url: string }; error?: string }>(response);

      if (!response.ok || !result.success || !result.data?.url) {
        throw new Error(result.error ?? "Não foi possível abrir o portal de assinatura.");
      }

      window.location.href = result.data.url;
    } catch (portalError) {
      setFeedback({
        tone: "error",
        text: portalError instanceof Error ? portalError.message : "Não foi possível abrir o portal de assinatura."
      });
      setIsManagingSubscription(false);
    }
  }

  async function handleReincludeExercise(exerciseId: string) {
    if (removingExerciseId) return;

    setRemovingExerciseId(exerciseId);

    try {
      const response = await fetchWithAuth(
        `/api/workout/excluded-exercises/${exerciseId}`,
        { method: "DELETE" }
      );

      if (!response.ok) throw new Error();

      setExcludedExercises((current) =>
        current.filter((item) => item.exerciseId !== exerciseId)
      );
    } catch {
      // sem feedback visível — o item simplesmente volta para a lista
    } finally {
      setRemovingExerciseId(null);
    }
  }

  async function handleCopyReferralLink() {
    if (!referralData) return;
    try {
      await navigator.clipboard.writeText(referralData.link);
      setReferralCopied(true);
      setTimeout(() => setReferralCopied(false), 2000);
    } catch {
      // silently ignore
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

  useEffect(() => {
    let active = true;
    fetchWithAuth("/api/referral/code")
      .then((res) => parseJsonResponse<{ success: true; data: ReferralData }>(res))
      .then((result) => { if (active && result.success) setReferralData(result.data); })
      .catch(() => {})
      .finally(() => { if (active) setReferralLoading(false); });
    return () => { active = false; };
  }, []);

  // ── Loading / signing out ───────────────────────────────────────────────────

  if (loading || isSigningOut || subscriptionLoading) {
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
          <p className="text-sm text-white/64">{error ?? "Perfil indisponível."}</p>
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
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-white/50">Estilo de treino</p>
                <span className="text-[0.7rem] text-white/35">1 grátis · 2+ Premium</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {TRAINING_STYLE_OPTIONS.map((option) => {
                  const selected = selectedStyles.includes(option.value);
                  const lockedForFree = !isPremiumUser && option.value !== "personal" && !selected && selectedStyles.some((style) => style !== "personal");
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => toggleTrainingStyle(option.value)}
                      className={clsx(
                        "inline-flex min-h-10 items-center justify-center gap-1 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] transition",
                        selected
                          ? "border-primary/40 bg-primary/12 text-white"
                          : "border-white/10 bg-white/[0.04] text-white/72 hover:bg-white/[0.08] hover:text-white"
                      )}
                    >
                      {option.label}
                      {lockedForFree ? <span aria-hidden className="text-[0.65rem] text-white/40">🔒</span> : null}
                    </button>
                  );
                })}
              </div>
              <p className="text-[0.7rem] text-white/40">
                Escolha 1 estilo (ou &quot;Personal Escolhe&quot;, em que a IA decide). Combinar 2 ou mais estilos é Premium — a IA distribui pelos treinos.
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-white/50">Intensificar</p>
              <SelectField
                value={form.focusRegion}
                options={FOCUS_REGION_OPTIONS}
                onChange={(value) => updateForm(setForm, "focusRegion", value)}
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

            <div className="space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/50">
                Exercícios excluídos
              </p>

              {excludedExercises.length > 0 ? (
                <div className="max-h-[15.5rem] space-y-2 overflow-y-auto pr-1">
                  {excludedExercises.map((item) => (
                    <div
                      key={item.exerciseId}
                      className="flex items-center gap-2.5 rounded-[22px] border border-primary/14 bg-primary/[0.08] p-3"
                    >
                      <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] bg-primary/10">
                        <Dumbbell className="h-4 w-4 text-primary/70" />
                      </div>

                      <p className="min-w-0 flex-1 truncate text-sm font-medium text-white">
                        {item.exerciseName}
                      </p>

                      <button
                        type="button"
                        onClick={() => handleReincludeExercise(item.exerciseId)}
                        disabled={removingExerciseId === item.exerciseId}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/[0.06] text-white/40 transition hover:border-red-400/30 hover:text-red-400 disabled:opacity-40"
                        aria-label={`Reincluir ${item.exerciseName}`}
                      >
                        {removingExerciseId === item.exerciseId ? (
                          <span className="h-3 w-3 animate-spin rounded-full border border-white/30 border-t-white/80" />
                        ) : (
                          <X className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-6 text-white/54">
                  Nenhum exercício excluído ainda. Exercícios substituídos aparecerão aqui e não serão sugeridos nos próximos programas de treino.
                </div>
              )}
            </div>
          </Card>
        )}
      {showPremiumStyleModal ? (
        <UpsellModal reason="combine_styles_locked" onClose={() => setShowPremiumStyleModal(false)} />
      ) : null}
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
                {payload.phaseLabel ?? getLevelBadge(payload.answers.goal)}
              </span>
              <span className="rounded-full border border-white/12 bg-white/5 px-2.5 py-0.5 text-[11px] text-white/65">
                {formatGoal(payload.answers.goal)}
              </span>
              {payload.answers.age ? (
                <span className="rounded-full border border-white/12 bg-white/5 px-2.5 py-0.5 text-[11px] text-white/65">
                  {payload.answers.age} anos
                </span>
              ) : null}
              {payload.answers.focusRegion && payload.answers.focusRegion !== "balanced" ? (
                <span className="rounded-full border border-white/12 bg-white/5 px-2.5 py-0.5 text-[11px] text-white/65">
                  Ênfase em: {formatFocusRegion(payload.answers.focusRegion)}
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

      {/* Assinatura */}
      <Card className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">Assinatura</p>
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] bg-white/5">
            <CreditCard className="h-3.5 w-3.5 text-white/30" />
          </div>
        </div>

        {subscription?.isPremium ? (
          // ── Premium: badge + data de renovação + botão gerenciar ──
          <div className="mt-3 space-y-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[12px] font-semibold text-primary">
              <Sparkles className="h-3 w-3" />
              {subscription.plan === "annual" ? "Premium Anual" : "Premium Mensal"}
            </span>

            {(subscription.cancelAtPeriodEnd && subscription.cancelsAt) || subscription.renewsAt ? (
              <p className="text-[13px] text-white/50">
                {subscription.cancelAtPeriodEnd && subscription.cancelsAt
                  ? `⚠️ Cancela em ${formatSubscriptionDate(subscription.cancelsAt)}`
                  : `Renova em ${formatSubscriptionDate(subscription.renewsAt!)}`}
              </p>
            ) : null}

            <button
              type="button"
              onClick={() => void handleManageSubscription()}
              disabled={isManagingSubscription}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/70 transition hover:bg-white/8 hover:text-white disabled:opacity-50"
            >
              {isManagingSubscription ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border border-white/20 border-t-white/70" />
                  Redirecionando...
                </>
              ) : (
                <>
                  <CreditCard className="h-3.5 w-3.5" />
                  Gerenciar assinatura
                </>
              )}
            </button>
          </div>
        ) : (
          // ── Free: badge e botão lado a lado ──
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[12px] font-semibold text-white/60">
              Gratuito
            </span>
            <Link
              href="/premium"
              className="inline-flex items-center gap-1.5 rounded-2xl bg-gradient-to-r from-primary to-primaryStrong px-4 py-2 text-[13px] font-bold text-black shadow-glow transition hover:opacity-95"
            >
              <Sparkles className="h-3 w-3" />
              Fazer upgrade
            </Link>
          </div>
        )}
      </Card>

      {feedback ? <FeedbackBanner feedback={feedback} /> : null}

      {/* Meus Dados */}
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/36">Meus Dados</p>
        <Card className="overflow-hidden p-0">
          <SettingsRow
            icon={<UserRound className="h-5 w-5 text-primary" />}
            title="Dados Pessoais"
            subtitle={`${payload.user.name || "—"} · ${payload.user.email || "—"}`}
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
            subtitle={`${formatGoal(payload.answers.goal)} · ${payload.answers.days ?? "—"}x/sem · Intensificar: ${formatFocusRegion(payload.answers.focusRegion)}`}
            onClick={() => openSection("training")}
            isLast
          />
        </Card>
      </div>

      {/* Compartilhe e Ganhe — card separado */}
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/36">Indique e Ganhe</p>
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] bg-primary/15 text-lg">
              🎁
            </div>
            <p className="text-sm font-semibold text-white">Compartilhe e Ganhe</p>
          </div>

          {referralLoading ? (
            <div className="space-y-2 animate-pulse">
              <div className="h-2.5 w-2/3 rounded-full bg-white/10" />
              <div className="h-2.5 w-1/2 rounded-full bg-white/10" />
            </div>
          ) : subscription?.isPremium ? (
            <div className="space-y-3">
              <p className="text-[13px] leading-5 text-white/60">
                Você já é Premium! Mas sua indicação ajuda um amigo a descobrir o app 💪 Compartilhe assim mesmo — cada indicação conta!
              </p>
              {referralData && (
                <ShareButton
                  context="workout"
                  customText={`Tô usando o Hora do Treino pra treinar e tô adorando! Usa meu cupom ${referralData.code} e comece grátis: ${referralData.link} #horadotreino`}
                />
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[13px] leading-5 text-white/60">
                Indique 5 amigos e ganhe 30 dias de Premium grátis!
              </p>
              {referralData && (
                <>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      {Array.from({ length: 5 }, (_, i) => (
                        <span
                          key={i}
                          className={`h-2.5 w-2.5 rounded-full ${i < referralData.count ? "bg-primary" : "bg-white/20"}`}
                        />
                      ))}
                    </div>
                    <span className="text-xs text-white/50">{referralData.count} de 5 indicações</span>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-xs text-white/40">Seu link:</p>
                    <p className="rounded-[12px] border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-mono text-white/70 break-all">
                      {referralData.link}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleCopyReferralLink()}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-[16px] border border-white/10 bg-white/5 py-3 text-xs font-semibold text-white/70 transition hover:bg-white/10 active:scale-[0.98]"
                    >
                      📋 {referralCopied ? "Copiado! ✓" : "Copiar link"}
                    </button>
                    <div className="flex-1">
                      <ShareButton
                        context="workout"
                        customText={`Tô usando o Hora do Treino pra treinar e tô adorando! Usa meu cupom ${referralData.code} e comece grátis: ${referralData.link} #horadotreino`}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-white/50">
                    Ou compartilhe o cupom:{" "}
                    <span className="font-mono font-semibold text-white/75">{referralData.code}</span>
                  </p>
                </>
              )}
            </div>
          )}
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
            <button
              type="button"
              role="switch"
              aria-checked={notificationsEnabled}
              onClick={() => void handleToggleNotifications()}
              disabled={notificationsLoading}
              className={clsx(
                "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60",
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


      {/* Fale Conosco */}
      <Card className="space-y-2 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">Fale Conosco</p>
        <p className="text-[13px] leading-5 text-white/62">
          Achou algum bug, tem alguma sugestão... entre em contato!
        </p>
        <a
          href="https://horadotreino.com.br/fale-conosco/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition hover:text-primary/80"
        >
          Entrar em contato →
        </a>
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

      {showWorkoutUpsell ? (
        <UpsellModal reason="generate_workout" onClose={() => setShowWorkoutUpsell(false)} />
      ) : null}

      {showPremiumStyleModal ? (
        <UpsellModal reason="combine_styles_locked" onClose={() => setShowPremiumStyleModal(false)} />
      ) : null}
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
    equipment: normalizeEquipment(payload.answers.equipment),
    focusRegion: payload.answers.focusRegion ?? "balanced",
    trainingStyle: payload.answers.trainingStyle ?? "personal",
    trainingStyles: Array.isArray(payload.answers.trainingStyles) ? payload.answers.trainingStyles : []
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

function formatFocusRegion(value?: string) {
  const labels: Record<string, string> = {
    chest: "Peito",
    back: "Dorsais",
    legs: "Pernas",
    legs_glutes: "Pernas e Glúteo",
    arms: "Braços",
    balanced: "Equilibrado"
  };
  return value ? (labels[value] ?? value) : "—";
}

function getLevelBadge(goal?: string) {
  if (goal === "gain_muscle" || goal === "body_recomposition") return "Intermediário";
  if (goal === "improve_conditioning") return "Avançado";
  return "Iniciante";
}

function formatSubscriptionDate(isoDate: string) {
  try {
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(
      new Date(isoDate)
    );
  } catch {
    return isoDate;
  }
}

// ─── Barra de progresso — geração de treino ───────────────────────────────────

const WORKOUT_LOADING_STAGES = [
  "Analisando seu perfil atualizado",
  "Selecionando os melhores exercícios",
  "Criando a estratégia de treino",
  "Montando seu plano personalizado",
  "Treino pronto!"
];

const WORKOUT_LOADING_INITIAL = 4;
const WORKOUT_LOADING_MAX = 97;
const WORKOUT_LOADING_DECAY_MS = 8000;

function getWorkoutLoadingProgress(elapsed: number) {
  if (elapsed <= 0) return WORKOUT_LOADING_INITIAL;
  return WORKOUT_LOADING_INITIAL + (WORKOUT_LOADING_MAX - WORKOUT_LOADING_INITIAL) * (1 - Math.exp(-elapsed / WORKOUT_LOADING_DECAY_MS));
}

function getWorkoutLoadingStageIndex(progress: number) {
  if (progress >= 100) return 4;
  if (progress >= 75) return 3;
  if (progress >= 50) return 2;
  if (progress >= 25) return 1;
  return 0;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i++) {
    view[i] = rawData.charCodeAt(i);
  }
  return view;
}

function daysUntilNextFreeGeneration(lastGeneratedAt: string | null | undefined): number {
  if (!lastGeneratedAt) return 0;
  const last = new Date(lastGeneratedAt).getTime();
  const now = Date.now();
  const diffDays = Math.ceil((last + 30 * 24 * 60 * 60 * 1000 - now) / (24 * 60 * 60 * 1000));
  return diffDays > 0 ? diffDays : 0;
}

function normalizeDisplayName(firstName?: string | null, fullName?: string | null): string {
  if (firstName?.trim()) return firstName.trim();
  if (fullName?.trim()) return fullName.trim().split(" ")[0] ?? fullName.trim();
  return "Olá";
}