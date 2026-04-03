"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useConsentPreferences } from "@/components/consent-provider";
import { Disclaimer } from "@/components/disclaimer";
import { Button, Card } from "@/components/ui";
import { getRequestErrorMessage, parseJsonResponse } from "@/lib/api";
import { trackEvent } from "@/lib/analytics-client";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { getFriendlyAuthErrorMessage, isValidEmail } from "@/lib/auth-errors";
import { createSupabaseBrowserClient, getSupabaseBrowserSetupError } from "@/lib/supabase-browser";
import { clientLogError, clientLogInfo } from "@/lib/client-logger";
import { QuizAnswers } from "@/lib/types";
import { initialAnswers, quizSteps } from "@/lib/quiz";

type AccountFields = {
  name: string;
  email: string;
  password: string;
};

export function QuizForm() {
  const router = useRouter();
  const { preferences: consentPreferences, hasInteracted: hasPreferenceDecision } = useConsentPreferences();
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Partial<QuizAnswers>>(initialAnswers);
  const [account, setAccount] = useState<AccountFields>({
    name: "",
    email: "",
    password: ""
  });
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [hasTrackedStart, setHasTrackedStart] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [loadingStep, setLoadingStep] = useState(0);

  const safeStepIndex = Math.min(stepIndex, quizSteps.length - 1);
  const step = quizSteps[safeStepIndex];
  const progress = useMemo(() => Math.round(((safeStepIndex + 1) / quizSteps.length) * 100), [safeStepIndex]);

  useEffect(() => {
    trackEvent("home_view", null, { source: "landing_page" });
    trackEvent("page_view", null, { source: "landing_page" });
  }, []);

  useEffect(() => {
    if (!isPending) {
      setLoadingStep(0);
      return;
    }

    const interval = window.setInterval(() => {
      setLoadingStep((current) => (current + 1) % loadingMessages.length);
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [isPending]);

  useEffect(() => {
    if (stepIndex > quizSteps.length - 1) {
      setStepIndex(Math.max(0, quizSteps.length - 1));
    }
  }, [stepIndex]);

  const canContinue = useMemo(() => {
    if (step.type === "account") {
      return (
        account.name.trim().length > 1 &&
        account.email.includes("@") &&
        account.password.trim().length >= 6 &&
        acceptedTerms
      );
    }

    if (step.type === "physical") {
      return (
        isBetween(Number(answers.age), 12, 80) &&
        isBetween(Number(answers.weight), 40, 150) &&
        isBetween(Number(answers.height), 140, 210)
      );
    }

    const value = answers[step.key as keyof QuizAnswers];

    if ("optional" in step && step.optional) {
      return true;
    }

    if (step.type === "slider") {
      return Number.isFinite(Number(value));
    }

    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value === "string") return value.trim().length > 0;
    return Boolean(value);
  }, [acceptedTerms, account, answers, step]);

  function trackStart(stepNumber: number) {
    if (!hasTrackedStart) {
      trackEvent("quiz_started", null, { step: stepNumber });
      trackEvent("quiz_start", null, { step: stepNumber });
      setHasTrackedStart(true);
    }
  }

  function updateAnswer(key: keyof QuizAnswers, value: string | number | string[]) {
    trackStart(safeStepIndex + 1);
    setAnswers((current) => ({ ...current, [key]: value }));
    setError(null);
    setSuccessMessage(null);
  }

  function updateCurrentAnswer(value: string | number) {
    updateAnswer(step.key as keyof QuizAnswers, value);
  }

  function toggleMultiAnswer(value: string) {
    trackStart(safeStepIndex + 1);

    setAnswers((current) => {
      const currentValues = Array.isArray(current[step.key as keyof QuizAnswers])
        ? ([...(current[step.key as keyof QuizAnswers] as string[])] as string[])
        : [];

      let nextValues: string[] = [];

      if (value === "nenhum") {
        nextValues = currentValues.includes("nenhum") ? [] : ["nenhum"];
      } else if (currentValues.includes(value)) {
        nextValues = currentValues.filter((item) => item !== value);
      } else {
        nextValues = [...currentValues.filter((item) => item !== "nenhum"), value];
      }

      return {
        ...current,
        [step.key]: nextValues
      };
    });

    setError(null);
    setSuccessMessage(null);
  }

  function updateAccountField(field: keyof AccountFields, value: string) {
    trackStart(safeStepIndex + 1);
    setAccount((current) => ({ ...current, [field]: value }));
    setError(null);
    setSuccessMessage(null);
  }

  function updateAcceptedTerms(value: boolean) {
    trackStart(safeStepIndex + 1);
    setAcceptedTerms(value);
    setError(null);
    setSuccessMessage(null);
  }

  function goBack() {
    setStepIndex((current) => Math.max(0, current - 1));
  }

  function goNext() {
    if (!canContinue) {
      setError("Preencha esta etapa antes de continuar.");
      return;
    }

    if (safeStepIndex === quizSteps.length - 1) {
      startTransition(async () => {
        try {
          if (!isValidEmail(account.email)) {
            throw new Error("Digite um e-mail válido.");
          }

          if (account.password.trim().length < 6) {
            throw new Error("Sua senha precisa ter pelo menos 6 caracteres.");
          }

          if (!acceptedTerms) {
            throw new Error("Você precisa aceitar os Termos de Uso para continuar.");
          }

          if (account.name.trim().length < 2) {
            throw new Error("Digite seu nome para criar a conta.");
          }

          const supabase = createSupabaseBrowserClient();
          if (!supabase) {
            throw new Error(getSupabaseBrowserSetupError() ?? "Falha ao inicializar o cliente de autenticação.");
          }

          clientLogInfo("QUIZ SIGN UP STARTED", {
            email: account.email,
            name: account.name,
            has_marketing_consent: hasPreferenceDecision ? consentPreferences.marketing === true : null
          });

          const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
            email: account.email,
            password: account.password,
            options: {
              data: {
                name: account.name
              }
            }
          });

          if (signUpError) {
            throw signUpError;
          }

          if (!signUpData.user?.id || !signUpData.session) {
            throw new Error("Conta criada, mas a sessão não foi iniciada corretamente.");
          }

          clientLogInfo("QUIZ SIGN UP USER CREATED", {
            user_id: signUpData.user.id,
            email: signUpData.user.email ?? account.email
          });

          const response = await fetchWithAuth("/api/quiz", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              ...answers,
              name: account.name,
              acceptedTerms,
              consents: hasPreferenceDecision ? consentPreferences : {}
            })
          });

          if (!response.ok) {
            const payload = await parseJsonResponse<{ success: false; error?: string }>(response);
            throw new Error(payload.error ?? "Erro na requisição.");
          }

          const payload = await parseJsonResponse<{
            success: true;
            data: {
              userId: string;
            };
          }>(response);

          trackEvent("quiz_completed", payload.data.userId ?? null, {
            goal: answers.goal ?? null,
            location: "home"
          });
          trackEvent("signup", payload.data.userId ?? null, {
            goal: answers.goal ?? null
          });
          trackEvent("sign_up", payload.data.userId ?? null, {
            goal: answers.goal ?? null
          });

          setSuccessMessage("Conta criada com sucesso.");
          router.push("/dashboard");
          router.refresh();
        } catch (submissionError) {
          clientLogError("QUIZ SIGN UP FLOW ERROR", submissionError);
          const authMessage = getFriendlyAuthErrorMessage(submissionError);
          setError(getRequestErrorMessage(new Error(authMessage), authMessage));
        }
      });

      return;
    }

    setStepIndex((current) => Math.min(current + 1, quizSteps.length - 1));
  }

  return (
    <Card className="fade-in mx-auto w-full max-w-3xl rounded-[32px] border-white/12 bg-[#101010]/88 p-5 sm:p-7">
      <div className="mb-8 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">Formulário</p>
            <p className="mt-2 text-sm text-white/60">
              Etapa {safeStepIndex + 1} de {quizSteps.length}
            </p>
          </div>
          <p className="text-sm font-semibold text-primary">{progress}%</p>
        </div>

        <div className="rounded-full bg-white/8 p-1">
          <div
            className="h-2 rounded-full bg-gradient-to-r from-primary to-primaryStrong transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div key={`${step.key}-${step.type}`} className="min-h-[420px] transition-all duration-300 ease-out">
        <div className="space-y-3 transition-all duration-300 ease-out animate-in fade-in-0 slide-in-from-right-2">
          <h2 className="text-2xl font-semibold sm:text-3xl">{step.title}</h2>
          {"description" in step && step.description ? (
            <p className="max-w-xl text-sm text-white/62">{step.description}</p>
          ) : null}
        </div>

        {"image" in step && step.image ? (
          <div className="mt-6">
            <div className="relative mx-auto max-w-2xl overflow-hidden rounded-[24px] border border-white/10 bg-black/35 p-2 sm:p-3">
              <Image
                src={step.image}
                alt="Referência do teste de punho"
                width={1200}
                height={720}
                sizes="(max-width: 640px) calc(100vw - 56px), (max-width: 1024px) min(100vw - 80px, 720px), 720px"
                className="h-auto w-full rounded-[18px] object-cover"
                priority={step.key === "wrist"}
              />
            </div>
          </div>
        ) : null}

        {step.type === "choice" ? (
          <div className="mt-8 grid gap-3">
            {step.options.map((option) => {
              const selected = answers[step.key as keyof QuizAnswers] === option.value;

              return (
                <button
                  key={`${step.key}-${option.value}`}
                  type="button"
                  onClick={() => updateCurrentAnswer(option.value)}
                  className={`min-h-16 rounded-[24px] border px-5 py-5 text-left text-base transition duration-200 ${
                    selected
                      ? "border-primary bg-primary/15 text-white shadow-glow"
                      : "border-white/10 bg-white/[0.03] text-white/78 hover:border-white/20 hover:bg-white/[0.05]"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        ) : step.type === "physical" ? (
          <div className="mt-8 space-y-6">
            <PhysicalSlider
              label="Idade"
              value={Number(answers.age ?? 25)}
              min={12}
              max={80}
              step={1}
              formatValue={(value) => `${value} anos`}
              onChange={(value) => updateAnswer("age", value)}
            />
            <PhysicalSlider
              label="Peso"
              value={Number(answers.weight ?? 70)}
              min={40}
              max={150}
              step={1}
              formatValue={(value) => `${value} kg`}
              onChange={(value) => updateAnswer("weight", value)}
            />
            <PhysicalSlider
              label="Altura"
              value={Number(answers.height ?? 170)}
              min={140}
              max={210}
              step={1}
              formatValue={(value) => `${value} cm`}
              onChange={(value) => updateAnswer("height", value)}
            />
          </div>
        ) : step.type === "multi" ? (
          <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-3">
            {step.options.map((option) => {
              const selectedValues = Array.isArray(answers[step.key as keyof QuizAnswers])
                ? (answers[step.key as keyof QuizAnswers] as string[])
                : [];
              const selected = selectedValues.includes(option.value);

              return (
                <button
                  key={`${step.key}-${option.value}`}
                  type="button"
                  onClick={() => toggleMultiAnswer(option.value)}
                  className={`relative min-h-[156px] rounded-[24px] border px-4 py-4 text-sm transition duration-200 ${
                    selected
                      ? "border-primary bg-primary/15 text-white shadow-glow"
                      : "border-white/10 bg-white/[0.03] text-white/78 hover:border-white/20 hover:bg-white/[0.05]"
                  }`}
                >
                  <span
                    className={`absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-full border text-sm font-semibold ${
                      selected ? "border-primary bg-primary text-white" : "border-white/20 text-white/45"
                    }`}
                  >
                    {selected ? "\u2713" : "+"}
                  </span>
                  <span className="flex h-full flex-col items-center justify-between gap-3">
                    <span className="flex w-full flex-1 items-center justify-center overflow-visible pt-3">
                      <img
                        src={getEquipmentIconSource(option)}
                        alt={option.label}
                        className={getEquipmentIconClassName()}
                      />
                    </span>
                    <span className="mt-1 w-full text-center font-medium leading-snug text-white">{option.label}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : step.type === "account" ? (
          <div className="mt-8 grid gap-3">
            <input
              type="text"
              value={account.name}
              onChange={(event) => updateAccountField("name", event.target.value)}
              placeholder="Seu nome"
              className="min-h-16 w-full rounded-[24px] border border-white/10 bg-white/[0.03] px-5 text-white outline-none transition focus:border-primary"
            />
            <input
              type="email"
              value={account.email}
              onChange={(event) => updateAccountField("email", event.target.value)}
              placeholder="Seu melhor e-mail"
              className="min-h-16 w-full rounded-[24px] border border-white/10 bg-white/[0.03] px-5 text-white outline-none transition focus:border-primary"
            />
            <input
              type="password"
              value={account.password}
              onChange={(event) => updateAccountField("password", event.target.value)}
              placeholder="Crie uma senha"
              className="min-h-16 w-full rounded-[24px] border border-white/10 bg-white/[0.03] px-5 text-white outline-none transition focus:border-primary"
            />
            <Disclaimer variant="compact" />
            <label className="rounded-[24px] border border-white/10 bg-white/[0.03] px-5 py-4 text-sm leading-6 text-white/76">
              <span className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(event) => updateAcceptedTerms(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-white/20 accent-[#22c55e]"
                />
                <span>
                  Li e concordo com os{" "}
                  <Link href="/termos-de-uso" className="font-semibold text-primary transition hover:text-primaryStrong">
                    Termos de Uso
                  </Link>
                  .
                </span>
              </span>
            </label>
            <p className="text-sm text-white/60">
              Ao continuar, você pode consultar nossa{" "}
              <Link href="/politica-de-privacidade" className="font-semibold text-primary transition hover:text-primaryStrong">
                política de privacidade
              </Link>{" "}
              e acessar a{" "}
              <Link href="/privacidade" className="font-semibold text-primary transition hover:text-primaryStrong">
                central de privacidade
              </Link>
              .
            </p>
          </div>
        ) : step.type === "slider" ? (
          <div className="mt-8 space-y-5">
            <div className="rounded-[24px] border border-white/10 bg-white/[0.03] px-5 py-6 text-center">
              <p className="text-3xl font-semibold text-white">{step.formatValue(Number(answers[step.key] ?? step.min))}</p>
            </div>
            <input
              type="range"
              min={step.min}
              max={step.max}
              step={step.step}
              value={Number(answers[step.key] ?? step.min)}
              onChange={(event) => updateCurrentAnswer(Number(event.target.value))}
              className="w-full accent-[#22c55e]"
            />
            <div className="flex justify-between text-xs text-white/45">
              <span>{step.formatValue(step.min)}</span>
              <span>{step.formatValue(step.max)}</span>
            </div>
          </div>
        ) : (
          <div className="mt-8">
            <input
              type="text"
              value={String(answers[step.key as keyof QuizAnswers] ?? "")}
              onChange={(event) => updateCurrentAnswer(event.target.value)}
              placeholder={step.placeholder}
              className="min-h-16 w-full rounded-[24px] border border-white/10 bg-white/[0.03] px-5 text-white outline-none transition focus:border-primary"
            />
          </div>
        )}
      </div>

      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-h-6 text-sm">
          {error ? <span className="text-red-300">{error}</span> : null}
          {!error && successMessage ? <span className="text-primary">{successMessage}</span> : null}
        </div>
        <div className="flex gap-3">
          <Button variant="ghost" onClick={goBack} disabled={safeStepIndex === 0 || isPending}>
            Voltar
          </Button>
          <Button onClick={goNext} disabled={isPending || !canContinue}>
            {isPending
              ? "Montando sua sugestão de treino..."
              : safeStepIndex === quizSteps.length - 1
                ? "Criar conta e ver minha sugestão"
                : "Continuar"}
          </Button>
        </div>
      </div>

      {isPending ? (
        <div className="mt-6 rounded-[24px] border border-primary/20 bg-primary/10 p-4">
          <p className="text-sm font-semibold text-primary">Montando sua sugestão de treino...</p>
          <p className="mt-1 text-sm text-white/64">Analisando seus dados para criar algo mais preciso para você.</p>
          <div className="mt-4 space-y-2">
            {loadingMessages.map((message, index) => {
              const isActive = index === loadingStep;
              const isDone = index < loadingStep;

              return (
                <div
                  key={message}
                  className={`flex items-center gap-3 rounded-2xl px-3 py-2 transition ${
                    isActive ? "bg-white/8 text-white" : "text-white/55"
                  }`}
                >
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold ${
                      isDone || isActive
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-white/10 text-white/40"
                    }`}
                  >
                    {isDone ? "v" : index + 1}
                  </span>
                  <span className={isActive ? "font-medium text-white" : ""}>{message}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

const loadingMessages = ["Analisando perfil", "Selecionando exercícios", "Montando treino"];

function PhysicalSlider({
  label,
  value,
  min,
  max,
  step,
  formatValue,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  formatValue: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-3 rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-medium text-white/78">{label}</p>
        <p className="text-lg font-semibold text-white">{formatValue(value)}</p>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-[#22c55e]"
      />
    </div>
  );
}

function getEquipmentIconSource(option: { value: string; label: string; icon?: string | null }) {
  if (option.icon) {
    return option.icon;
  }

  const fallbackIcons: Record<string, { label: string; accent: string }> = {
    nenhum: { label: "N", accent: "#64748b" }
  };

  const icon = fallbackIcons[option.value] ?? { label: option.label.slice(0, 2).toUpperCase(), accent: "#22c55e" };
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" fill="none">
      <rect width="48" height="48" rx="12" fill="#0F172A"/>
      <rect x="4" y="4" width="40" height="40" rx="10" fill="${icon.accent}" fill-opacity="0.18"/>
      <text x="24" y="29" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="white">
        ${icon.label}
      </text>
    </svg>
  `;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function getEquipmentIconClassName() {
  return "h-[120px] w-[120px] shrink-0 object-contain md:h-[150px] md:w-[150px]";
}

function isBetween(value: number, min: number, max: number) {
  return Number.isFinite(value) && value >= min && value <= max;
}
