"use client";

import Image from "next/image";
import { Caveat } from "next/font/google";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useConsentPreferences } from "@/components/consent-provider";
import { Button, Card } from "@/components/ui";
import { getRequestErrorMessage, parseJsonResponse } from "@/lib/api";
import { trackEvent as trackAppEvent } from "@/lib/analytics-client";
import { trackMetaCompleteRegistration } from "@/lib/facebook-pixel";
import { trackOpenAiRegistration } from "@/lib/openai-pixel";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { getFriendlyAuthErrorMessage, isValidEmail } from "@/lib/auth-errors";
import { createSupabaseBrowserClient, getSupabaseBrowserSetupError } from "@/lib/supabase-browser";
import { clientLogError, clientLogInfo } from "@/lib/client-logger";
import { QuizAnswers } from "@/lib/types";
import { initialAnswers, quizSteps } from "@/lib/quiz";
import { ITEM_HEIGHT as WHEEL_ITEM_HEIGHT, VISIBLE as WHEEL_VISIBLE, WheelColumn } from "@/components/rest-timer-wheel";

// Fonte "escrita à mão" usada só na prancheta do resumo.
const handwriting = Caveat({ subsets: ["latin"], weight: ["500", "700"], display: "swap" });

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
  const [referralCode, setReferralCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Qual caixinha de explicação ("i") está aberta. Formato: "etapa:opção".
  const [openInfo, setOpenInfo] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [hasTrackedStart, setHasTrackedStart] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [loadingProgress, setLoadingProgress] = useState(0);
  const formCardRef = useRef<HTMLDivElement | null>(null);
  const loadingCardRef = useRef<HTMLDivElement | null>(null);
  const hasMountedStepRef = useRef(false);
  const shouldScrollToStepRef = useRef(false);
  const isSubmittingRef = useRef(false);

  // Passos visíveis: o passo de materiais ("equipment") só aparece quando o
  // local é "casa". No condomínio os exercícios/equipamentos vêm do que foi
  // cadastrado pelo personal, então não faz sentido perguntar os materiais.
  const visibleSteps = useMemo(
    () => quizSteps.filter((s) => s.key !== "equipment" || (answers.location ?? "home") === "home"),
    [answers.location]
  );
  const safeStepIndex = Math.min(stepIndex, visibleSteps.length - 1);
  const step = visibleSteps[safeStepIndex];
  const progress = useMemo(() => Math.round(((safeStepIndex + 1) / visibleSteps.length) * 100), [safeStepIndex, visibleSteps.length]);

  useEffect(() => {
    trackAppEvent("home_view", null, { source: "landing_page" });
  }, []);

  // Preenche o cupom de indicação automaticamente.
  // Ordem: 1) ?ref= na URL (link direto /criar-conta?ref=...),
  //        2) código guardado pela home quando a pessoa veio pelo link de indicação.
  // Mesma chave usada em app/page.tsx.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("ref");
    const cleaned = (fromUrl ?? "").trim().toUpperCase().slice(0, 8);

    if (cleaned) {
      setReferralCode(cleaned);
      try {
        window.localStorage.setItem("hdt_referral_code", cleaned);
      } catch {
        // ignora se o navegador bloquear o armazenamento
      }
      return;
    }

    try {
      const stored = window.localStorage.getItem("hdt_referral_code");
      if (stored) setReferralCode(stored.trim().toUpperCase().slice(0, 8));
    } catch {
      // ignora
    }
  }, []);

  useEffect(() => {
    if (!isPending) {
      setLoadingProgress(0);
      return;
    }

    const startTime = window.performance.now();
    let animationFrame = 0;

    setLoadingProgress(initialLoadingProgress);

    const animateProgress = () => {
      const elapsed = window.performance.now() - startTime;
      const nextProgress = getLoadingProgressForElapsedTime(elapsed);

      setLoadingProgress((current) => (nextProgress > current ? nextProgress : current));
      animationFrame = window.requestAnimationFrame(animateProgress);
    };

    animationFrame = window.requestAnimationFrame(animateProgress);

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [isPending]);

  useEffect(() => {
    if (!isPending) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const loadingCard = loadingCardRef.current;
      if (!loadingCard) return;

      const targetTop = Math.max(0, window.scrollY + loadingCard.getBoundingClientRect().top - 20);
      window.scrollTo({
        top: targetTop,
        behavior: "smooth"
      });
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [isPending]);

  useEffect(() => {
    if (stepIndex > visibleSteps.length - 1) {
      setStepIndex(Math.max(0, visibleSteps.length - 1));
    }
  }, [stepIndex]);

  useEffect(() => {
    if (!hasMountedStepRef.current) {
      hasMountedStepRef.current = true;
      return;
    }

    if (!shouldScrollToStepRef.current) {
      return;
    }

    shouldScrollToStepRef.current = false;

    const frame = window.requestAnimationFrame(() => {
      const card = formCardRef.current;
      if (!card) return;

      const targetTop = Math.max(0, window.scrollY + card.getBoundingClientRect().top - 16);
      window.scrollTo({
        top: targetTop,
        behavior: "smooth"
      });
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [safeStepIndex]);

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

    if (step.type === "chips") {
      return Number.isFinite(Number(value));
    }

    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value === "string") return value.trim().length > 0;
    return Boolean(value);
  }, [acceptedTerms, account, answers, step]);

  const roundedLoadingProgress = Math.round(loadingProgress);
  const loadingStageIndex = getLoadingStageIndex(roundedLoadingProgress);
  const loadingStages = useMemo(() => getLoadingStages(answers), [answers]);
  function trackStart(stepNumber: number) {
    if (!hasTrackedStart) {
      trackAppEvent("quiz_started", null, { step: stepNumber });
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

  function handleChoice(option: { value: string; experience?: string }) {
    updateCurrentAnswer(option.value);
    // Pergunta de nível: além da resposta detalhada, grava o nível
    // ("experience") que a geração de treino usa.
    if (option.experience) {
      updateAnswer("experience", option.experience);
    }
  }

  function toggleInfo(key: string) {
    setOpenInfo((current) => (current === key ? null : key));
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

  async function completeLoadingProgress() {
    setLoadingProgress(100);
    await new Promise((resolve) => window.setTimeout(resolve, 280));
  }

  function goBack() {
    setOpenInfo(null);
    shouldScrollToStepRef.current = true;
    setStepIndex((current) => Math.max(0, current - 1));
  }

  function goNext() {
    if (!canContinue) {
      setError("Preencha esta etapa antes de continuar.");
      return;
    }

    if (safeStepIndex === visibleSteps.length - 1) {
      if (isSubmittingRef.current) {
        return;
      }

      isSubmittingRef.current = true;

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

          trackAppEvent("signup", payload.data.userId ?? null, {
            goal: answers.goal ?? null,
            location: "home"
          });
          trackMetaCompleteRegistration();
          trackOpenAiRegistration();
          trackAppEvent("workout_generated", payload.data.userId ?? null, {
            goal: answers.goal ?? null,
            source: "quiz_submit"
          });

          if (referralCode.trim()) {
            try {
              await fetchWithAuth("/api/referral/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code: referralCode.trim() }),
              });
            } catch {
              // ignora silenciosamente — cupom é bônus, não deve travar o onboarding
            } finally {
              // Limpa o cupom guardado para não atribuir indicação a um
              // próximo cadastro feito no mesmo dispositivo.
              try {
                window.localStorage.removeItem("hdt_referral_code");
              } catch {
                // ignora
              }
            }
          }

          await completeLoadingProgress();
          setSuccessMessage("Conta criada com sucesso.");
          const nextParam = new URLSearchParams(window.location.search).get("next");
          const destination =
            nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
              ? nextParam
              : "/escolher-plano";
          router.push(destination);
          router.refresh();
        } catch (submissionError) {
          clientLogError("QUIZ SIGN UP FLOW ERROR", submissionError);
          const authMessage = getFriendlyAuthErrorMessage(submissionError);
          setError(getRequestErrorMessage(new Error(authMessage), authMessage));
        } finally {
          isSubmittingRef.current = false;
        }
      });

      return;
    }

    setOpenInfo(null);
    shouldScrollToStepRef.current = true;
    setStepIndex((current) => Math.min(current + 1, visibleSteps.length - 1));
  }

  return (
    <div ref={formCardRef}>
      <Card className="fade-in mx-auto w-full max-w-3xl rounded-[32px] border-white/12 bg-[#101010]/88 p-5 sm:p-7">
      <div className="mb-8 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">Avaliação inicial</p>
            <p className="mt-2 text-sm text-white/60">
              Etapa {safeStepIndex + 1} de {visibleSteps.length}
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
          <div className="flex items-start gap-3">
            <h2 className="text-2xl font-semibold sm:text-3xl">{step.title}</h2>
            {"info" in step && step.info ? (
              <InfoButton
                className="mt-0.5 sm:mt-1"
                open={openInfo === `${step.key}:step`}
                onClick={() => toggleInfo(`${step.key}:step`)}
                label="Por que eu pergunto isso?"
              />
            ) : null}
          </div>
          {"info" in step && step.info && openInfo === `${step.key}:step` ? <InfoBox text={step.info} /> : null}
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
              const optionInfo = "info" in option ? option.info : undefined;
              const infoKey = `${step.key}:${option.value}`;
              const infoOpen = openInfo === infoKey;

              return (
                <div key={`${step.key}-${option.value}`} className="relative">
                  <button
                    type="button"
                    onClick={() => handleChoice(option)}
                    className={`min-h-16 w-full rounded-[24px] border px-5 py-5 text-left text-base transition duration-200 ${
                      optionInfo ? "pr-16" : ""
                    } ${
                      selected
                        ? "border-primary bg-primary/15 text-white shadow-glow"
                        : "border-white/10 bg-white/[0.03] text-white/78 hover:border-white/20 hover:bg-white/[0.05]"
                    }`}
                  >
                    <span className="block">{option.label}</span>
                    {optionInfo && infoOpen ? (
                      <span className="mt-2 block text-sm leading-6 text-white/66">{optionInfo}</span>
                    ) : null}
                  </button>
                  {optionInfo ? (
                    <InfoButton
                      className="absolute right-4 top-4"
                      open={infoOpen}
                      onClick={() => toggleInfo(infoKey)}
                      label={`O que é ${option.label}?`}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : step.type === "physical" ? (
          <div className="mt-8">
            <PhysicalWheels
              age={Number(answers.age ?? 25)}
              weight={Number(answers.weight ?? 70)}
              height={Number(answers.height ?? 170)}
              onChange={(field, value) => updateAnswer(field, value)}
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
          <div className="mt-8 grid grid-cols-1 gap-3">
            <PlanSummary answers={answers} studentName={account.name.trim()} />
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
              placeholder="Senha (mínimo 6 caracteres)"
              className={`min-h-16 w-full rounded-[24px] border bg-white/[0.03] px-5 text-white outline-none transition focus:border-primary ${
                account.password.length > 0 && account.password.trim().length < 6
                  ? "border-red-500"
                  : "border-white/10"
              }`}
            />
            {account.password.length > 0 && account.password.trim().length < 6 && (
              <p className="text-sm text-red-400 px-2 -mt-2">Senha muito curta. Use pelo menos 6 caracteres.</p>
            )}
            <div className="rounded-[24px] border border-white/10 bg-white/[0.03] px-5 py-4 space-y-2">
              <p className="text-sm font-medium text-white/80">🎁 Tem um cupom de indicação? <span className="text-white/40 font-normal">(opcional)</span></p>
              <input
                type="text"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                placeholder="Ex: HDT-X7K2"
                maxLength={8}
                className="min-h-12 w-full rounded-[16px] border border-white/10 bg-white/[0.03] px-4 text-white outline-none transition focus:border-primary"
              />
            </div>
          </div>
        ) : step.type === "chips" ? (
          <div className="mt-8 space-y-5">
            <div className="rounded-[24px] border border-white/10 bg-white/[0.03] px-5 py-6 text-center">
              <p className="text-3xl font-semibold text-white">
                {step.formatValue(Number(answers[step.key] ?? step.values[0]))}
              </p>
            </div>
            <div className={`grid gap-2 ${step.values.length === 7 ? "grid-cols-7" : "grid-cols-3"}`}>
              {(step.values as readonly number[]).map((value) => {
                const selected = Number(answers[step.key]) === value;

                return (
                  <button
                    key={`${step.key}-${value}`}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => updateCurrentAnswer(value)}
                    className={`min-h-14 rounded-[18px] border text-base font-semibold tabular-nums transition duration-200 ${
                      selected
                        ? "border-primary bg-primary/15 text-white shadow-glow"
                        : "border-white/10 bg-white/[0.03] text-white/70 hover:border-white/20 hover:bg-white/[0.05]"
                    }`}
                  >
                    {step.chipLabel(value)}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {safeStepIndex === visibleSteps.length - 1 && (
        <label className="mt-6 flex cursor-pointer items-start gap-3 text-sm leading-6 text-white/76">
          <input
            type="checkbox"
            checked={acceptedTerms}
            onChange={(event) => updateAcceptedTerms(event.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 rounded border-white/20 accent-[#22c55e]"
          />
          <span>
            Li e concordo com os{" "}
            <Link href="/termos-de-uso" className="font-semibold text-primary transition hover:text-primaryStrong">
              Termos de Uso
            </Link>
            .
          </span>
        </label>
      )}

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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
              ? "Montando seu treino..."
              : safeStepIndex === visibleSteps.length - 1
                ? "Criar conta e ver meu treino"
                : "Continuar"}
          </Button>
        </div>
      </div>

      {safeStepIndex === visibleSteps.length - 1 && (
        <p className="mt-3 text-sm text-white/60">
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
      )}

      {isPending ? (
        <div
          ref={loadingCardRef}
          className="mt-6 overflow-hidden rounded-[28px] border border-primary/20 bg-gradient-to-br from-primary/14 via-[#0f0f0f] to-[#151515] p-5 shadow-glow sm:p-6"
        >
          <div className="flex flex-col gap-5">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary/90">Montagem do treino</p>
              <div className="space-y-2">
                <p className="text-xl font-semibold text-white sm:text-2xl">Montando seu treino personalizado...</p>
                <p className="max-w-2xl text-sm leading-6 text-white/66">
                  Estou analisando suas respostas para montar um treino alinhado ao seu objetivo, rotina e nível.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-end gap-4">
                <div>
                  <p className="text-4xl font-semibold text-white sm:text-5xl">{roundedLoadingProgress}%</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.24em] text-white/38">Progresso estimado</p>
                </div>
              </div>
              <div className="rounded-full border border-white/8 bg-white/[0.06] p-1">
                <div
                  className="h-2.5 rounded-full bg-gradient-to-r from-primary via-primaryStrong to-[#7BF1A8] transition-[width] duration-500 ease-out"
                  style={{ width: `${roundedLoadingProgress}%` }}
                />
              </div>
            </div>

            <div className="grid gap-2">
              {loadingStages.map((stage, index) => {
                const isDone = index < loadingStageIndex;
                const isCurrent = index === loadingStageIndex;

                return (
                  <div
                    key={stage.label}
                    className={`flex items-center gap-3 rounded-[20px] border px-4 py-3 transition ${
                      isCurrent
                        ? "border-primary/30 bg-primary/12 text-white"
                        : isDone
                          ? "border-primary/18 bg-white/[0.03] text-white/78"
                          : "border-white/8 bg-white/[0.02] text-white/52"
                    }`}
                  >
                    <span
                      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${
                        isCurrent
                          ? "border-primary bg-primary/18 text-primary"
                          : isDone
                            ? "border-primary/40 bg-primary text-[#052b12]"
                            : "border-white/12 text-white/38"
                      }`}
                    >
                      {isDone ? "\u2713" : index + 1}
                    </span>
                    <p className={`min-w-0 flex-1 text-sm font-medium ${isCurrent ? "text-white" : ""}`}>{stage.label}</p>
                  </div>
                );
              })}
            </div>

            <div className="space-y-2 pt-1 text-center">
              <p className="text-sm italic leading-6 text-white/68">
                Método, experiência e inteligência artificial ajudam a criar o plano. A consistência é o que transforma
                isso em resultado.
              </p>
              <p className="text-xs font-medium tracking-[0.08em] text-white/34">&mdash; Renato Santiago, Personal Trainer</p>
            </div>
          </div>
        </div>
      ) : null}
      </Card>
    </div>
  );
}

const LEVEL_LABELS: Record<string, string> = {
  no_training: "Iniciante",
  lt_6_months: "Iniciante",
  "6_to_12_months": "Intermediário",
  gt_1_year: "Avançado"
};

const GOAL_FOCUS: Record<string, string> = {
  lose_weight: "emagrecimento",
  gain_muscle: "ganho de massa muscular",
  body_recomposition: "definição",
  improve_conditioning: "condicionamento"
};

// Pega o texto da opção que a pessoa escolheu (ex.: "legs_glutes" -> "Pernas e Glúteo").
function getOptionLabel(key: string, value: unknown): string | null {
  const quizStep = quizSteps.find((item) => item.key === key);
  if (!quizStep || !("options" in quizStep)) return null;
  const option = (quizStep.options as readonly { label: string; value: string }[]).find((item) => item.value === value);
  return option?.label ?? null;
}

// Etapas da tela "Montando seu treino", escritas com as respostas da pessoa.
function getLoadingStages(answers: Partial<QuizAnswers>) {
  const level = answers.experience ? LEVEL_LABELS[answers.experience] : null;
  const equipmentLabels = (answers.equipment ?? [])
    .filter((item) => item !== "nenhum")
    .map((item) => getOptionLabel("equipment", item)?.toLowerCase())
    .filter((item): item is string => Boolean(item));

  let exercises: string;
  if (answers.location === "condo_gym") {
    exercises = "Selecionando exercícios para a academia do condomínio";
  } else if (equipmentLabels.length === 0) {
    exercises = "Selecionando exercícios com o peso do corpo";
  } else if (equipmentLabels.length <= 2) {
    exercises = `Selecionando exercícios com ${equipmentLabels.join(" e ")}`;
  } else {
    exercises = `Selecionando exercícios com seus ${equipmentLabels.length} materiais`;
  }

  const goal = answers.goal ? GOAL_FOCUS[answers.goal] : null;
  const days = Number(answers.days);
  const time = Number(answers.time);

  return [
    { label: level ? `Analisando seu perfil de nível ${level}` : "Analisando seu perfil" },
    { label: exercises },
    { label: goal ? `Ajustando séries e descanso para ${goal}` : "Ajustando séries e descanso" },
    {
      label:
        days && time
          ? `Distribuindo ${days} ${days === 1 ? "treino" : "treinos"} de ${time} min na sua semana`
          : "Montando sua semana de treinos"
    },
    { label: "Bom treino!" }
  ];
}

// Resumo das respostas antes de criar a conta, no formato de uma prancheta
// com a ficha de avaliação preenchida à mão pelo personal.
function PlanSummary({ answers, studentName }: { answers: Partial<QuizAnswers>; studentName: string }) {
  const items = [
    { label: "Objetivo", value: getOptionLabel("goal", answers.goal) },
    { label: "Nível", value: answers.experience ? LEVEL_LABELS[answers.experience] : null },
    { label: "Local", value: getOptionLabel("location", answers.location) },
    { label: "Frequência", value: answers.days ? `${answers.days}x por semana` : null },
    { label: "Duração", value: answers.time ? `${answers.time} min por treino` : null },
    { label: "Ênfase", value: getOptionLabel("focusRegion", answers.focusRegion) },
    { label: "Método", value: getOptionLabel("trainingStyle", answers.trainingStyle) }
  ].filter((item): item is { label: string; value: string } => Boolean(item.value));

  const today = new Date().toLocaleDateString("pt-BR");
  const rows = [{ label: "Aluno(a)", value: studentName }, ...items];

  return (
    <div className="relative mx-auto mb-4 mt-5 w-full min-w-0 max-w-md">
      {/* prendedor de metal */}
      <div
        aria-hidden
        className="absolute left-1/2 top-0 z-10 h-9 w-28 -translate-x-1/2 -translate-y-1/2 rounded-[10px] border border-white/40 bg-gradient-to-b from-[#f3f4f6] via-[#9ca3af] to-[#4b5563] shadow-[0_4px_10px_rgba(0,0,0,0.45)]"
      >
        <div className="mx-auto mt-2.5 h-2 w-12 rounded-full bg-[#1f2937]/70" />
      </div>

      {/* prancheta */}
      <div className="rounded-[22px] bg-gradient-to-br from-[#2c2f33] via-[#1d1f22] to-[#121314] p-3 pt-7 shadow-[0_18px_40px_rgba(0,0,0,0.55)] ring-1 ring-white/10">
        {/* folha */}
        <div className="rounded-[10px] bg-[#f7f5ef] px-5 pb-5 pt-5 text-[#1f2937] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]">
          <div className="flex items-start justify-between gap-3 border-b-2 border-[#1f2937]/80 pb-2">
            <div>
              <p className="text-[0.62rem] font-bold uppercase tracking-[0.22em] text-[#16a34a]">Hora do Treino</p>
              <p className="text-base font-extrabold uppercase tracking-[0.06em]">Ficha de avaliação</p>
            </div>
            <div className="text-right">
              <p className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-[#6b7280]">Data</p>
              <p className={`${handwriting.className} text-lg leading-none text-[#1e3a8a]`}>{today}</p>
            </div>
          </div>

          <dl className="mt-2">
            {rows.map((row) => (
              <div key={row.label} className="flex min-h-[38px] items-end gap-3 border-b border-dashed border-[#9ca3af]/70 pb-1 pt-2">
                <dt className="w-[5.5rem] shrink-0 pb-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-[#6b7280]">
                  {row.label}
                </dt>
                <dd className={`${handwriting.className} min-w-0 flex-1 truncate text-[1.4rem] font-medium leading-none text-[#1e3a8a]`}>
                  {row.value}
                </dd>
                {row.value ? (
                  <span aria-hidden className="pb-0.5 text-sm font-bold text-[#16a34a]">
                    {"\u2713"}
                  </span>
                ) : null}
              </div>
            ))}
          </dl>

          <div className="mt-5 flex flex-col items-center gap-4 text-center">
            <p className={`${handwriting.className} max-w-[16rem] text-[1.2rem] leading-snug text-[#1e3a8a]/90`}>
              Quanto mais você treina, mais eu ajusto os seus próximos treinos.
            </p>
            <div>
              <p className="text-[0.55rem] font-semibold uppercase tracking-[0.22em] text-[#16a34a]">Método</p>
              <p className={`${handwriting.className} text-2xl font-bold leading-none text-[#111827]`}>Renato Santiago</p>
              <p className="mt-1 border-t border-[#1f2937]/60 pt-1 text-[0.55rem] font-semibold uppercase tracking-[0.18em] text-[#6b7280]">
                Personal Trainer
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const initialLoadingProgress = 4;
const maxVisualLoadingProgress = 97;
const loadingDecayMs = 8000;

function getLoadingStageIndex(progress: number) {
  if (progress >= 100) return 4;
  if (progress >= 75) return 3;
  if (progress >= 50) return 2;
  if (progress >= 25) return 1;
  return 0;
}

function getLoadingProgressForElapsedTime(elapsed: number) {
  if (elapsed <= 0) {
    return initialLoadingProgress;
  }

  return initialLoadingProgress + (maxVisualLoadingProgress - initialLoadingProgress) * (1 - Math.exp(-elapsed / loadingDecayMs));
}

function numberRange(min: number, max: number) {
  return Array.from({ length: max - min + 1 }, (_, i) => min + i);
}

// Mesmos limites validados em canContinue (isBetween).
const AGE_VALUES = numberRange(12, 80);
const WEIGHT_VALUES = numberRange(40, 150);
const HEIGHT_VALUES = numberRange(140, 210);

// Etapa "Seus dados físicos": 3 roletas lado a lado (mesma roleta do cronômetro),
// separadas por linhas para mostrar que são medidas diferentes.
function PhysicalWheels({
  age,
  weight,
  height,
  onChange
}: {
  age: number;
  weight: number;
  height: number;
  onChange: (field: "age" | "weight" | "height", value: number) => void;
}) {
  const columns = [
    { field: "age" as const, label: "Idade", unit: "anos", items: AGE_VALUES, value: age },
    { field: "weight" as const, label: "Peso", unit: "kg", items: WEIGHT_VALUES, value: weight },
    { field: "height" as const, label: "Altura", unit: "cm", items: HEIGHT_VALUES, value: height }
  ];

  return (
    <div className="grid grid-cols-3 divide-x divide-white/10 rounded-[24px] border border-white/10 bg-white/[0.03] py-5">
      {columns.map((column) => (
        <PhysicalWheelColumn
          key={column.field}
          label={column.label}
          unit={column.unit}
          items={column.items}
          value={column.value}
          onChange={(v) => onChange(column.field, v)}
        />
      ))}
    </div>
  );
}

function PhysicalWheelColumn({
  label,
  unit,
  items,
  value,
  onChange
}: {
  label: string;
  unit: string;
  items: number[];
  value: number;
  onChange: (value: number) => void;
}) {
  const pad = Math.floor(WHEEL_VISIBLE / 2);

  return (
    <div className="flex flex-col items-center px-1">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/55">
        {label} <span className="font-normal normal-case tracking-normal text-white/40">({unit})</span>
      </p>
      <div className="relative mt-3 w-full" style={{ height: WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE }} data-no-swipe>
        {/* faixa que marca o número escolhido */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-2 rounded-xl border border-primary/25 bg-white/[0.06]"
          style={{ top: WHEEL_ITEM_HEIGHT * pad, height: WHEEL_ITEM_HEIGHT }}
        />
        <div className="flex justify-center">
          <WheelColumn label={`${label} (${unit})`} items={items} value={value} onChange={onChange} />
        </div>
      </div>
    </div>
  );
}

// Botão "i" que abre/fecha uma explicação curta.
function InfoButton({
  open,
  onClick,
  label,
  className = ""
}: {
  open: boolean;
  onClick: () => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={open}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-serif text-base font-semibold italic transition ${
        open
          ? "border-primary bg-primary/20 text-primary"
          : "border-white/20 bg-white/[0.04] text-white/60 hover:border-white/35 hover:text-white"
      } ${className}`}
    >
      i
    </button>
  );
}

function InfoBox({ text }: { text: string }) {
  return (
    <p className="max-w-xl rounded-[18px] border border-primary/20 bg-primary/10 px-4 py-3 text-sm leading-6 text-white/80">
      {text}
    </p>
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
