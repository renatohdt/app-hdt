"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button, Card, Container, PageShell } from "@/components/ui";
import { useConsentPreferences } from "@/components/consent-provider";
import { parseJsonResponse } from "@/lib/api";
import { fetchWithAuth } from "@/lib/authenticated-fetch";
import { signOutAndRedirect } from "@/lib/client-signout";
import { supabase } from "@/lib/supabase";
import type { ConsentPreferenceMap, ConsentScope } from "@/lib/consent-types";

type ConsentApiPayload = {
  version: string;
  consents: Partial<Record<ConsentScope, boolean>>;
  hasStoredConsents: boolean;
};

type FeedbackState = {
  tone: "success" | "error" | "info";
  text: string;
};

export function PrivacyCenter() {
  const { ready, preferences, savePreferences } = useConsentPreferences();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [consentPayload, setConsentPayload] = useState<ConsentApiPayload | null>(null);
  const [draftPreferences, setDraftPreferences] = useState<ConsentPreferenceMap>(preferences);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [savingConsents, setSavingConsents] = useState(false);
  const [exportingData, setExportingData] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    setDraftPreferences(preferences);
  }, [preferences]);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      if (!supabase) {
        if (active) {
          setIsAuthenticated(false);
          setIsLoading(false);
        }
        return;
      }

      try {
        const {
          data: { user }
        } = await supabase.auth.getUser();

        if (!active) {
          return;
        }

        if (!user?.id) {
          setIsAuthenticated(false);
          setIsLoading(false);
          return;
        }

        setIsAuthenticated(true);

        const response = await fetchWithAuth("/api/consents");
        if (!response.ok) {
          throw new Error("Não foi possível carregar suas preferências de privacidade.");
        }

        const result = await parseJsonResponse<{ success: true; data: ConsentApiPayload }>(response);

        if (!active) {
          return;
        }

        setConsentPayload(result.data);
        setDraftPreferences({
          ads: Boolean(result.data.consents.ads),
          marketing: Boolean(result.data.consents.marketing)
        });
      } catch (error) {
        if (active) {
          setFeedback({
            tone: "error",
            text: error instanceof Error ? error.message : "Não foi possível carregar sua central de privacidade."
          });
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, []);

  const hasConsentChanges =
    draftPreferences.ads !== preferences.ads || draftPreferences.marketing !== preferences.marketing;

  const consentCards = useMemo(
    () => [
      {
        key: "ads",
        title: "Ads",
        description: "Usado para Google AdSense e recursos publicitarios opcionais."
      },
      {
        key: "marketing",
        title: "Marketing",
        description: "Usado para Meta Pixel, automações e integrações de remarketing, como LeadLovers."
      }
    ],
    []
  );

  async function handleSaveConsents() {
    if (!hasConsentChanges) {
      setFeedback({ tone: "info", text: "Não há alterações pendentes nos consentimentos opcionais." });
      return;
    }

    const previousPreferences = preferences;
    setSavingConsents(true);
    setFeedback(null);
    savePreferences(draftPreferences);

    try {
      const response = await fetchWithAuth("/api/consents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          consents: draftPreferences,
          source: "privacy_center"
        })
      });

      const result = await parseJsonResponse<{
        success: boolean;
        data?: ConsentApiPayload;
        error?: string;
      }>(response);

      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.error ?? "Não foi possível atualizar seus consentimentos.");
      }

      setConsentPayload(result.data);
      setFeedback({ tone: "success", text: "Preferências de privacidade atualizadas com sucesso." });
    } catch (error) {
      savePreferences(previousPreferences);
      setDraftPreferences(previousPreferences);
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Não foi possível atualizar seus consentimentos."
      });
    } finally {
      setSavingConsents(false);
    }
  }

  async function handleExportData() {
    setExportingData(true);
    setFeedback(null);

    try {
      const response = await fetchWithAuth("/api/privacy/export");
      if (!response.ok) {
        const result = await parseJsonResponse<{ success: false; error?: string }>(response);
        throw new Error(result.error ?? "Não foi possível exportar seus dados.");
      }

      const text = await response.text();
      const blob = new Blob([text], { type: "application/json;charset=utf-8" });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const fileDate = new Date().toISOString().slice(0, 10);

      anchor.href = url;
      anchor.download = `hora-do-treino-dados-${fileDate}.json`;
      anchor.click();
      window.URL.revokeObjectURL(url);

      setFeedback({ tone: "success", text: "Exportação iniciada. O arquivo JSON foi preparado para download." });
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Não foi possível exportar seus dados."
      });
    } finally {
      setExportingData(false);
    }
  }

  async function handleDeleteAccount() {
    setDeletingAccount(true);
    setFeedback(null);

    try {
      const response = await fetchWithAuth("/api/account/delete", {
        method: "DELETE"
      });

      const result = await parseJsonResponse<{
        success: boolean;
        data?: { message?: string };
        error?: string;
      }>(response);

      if (!response.ok || !result.success) {
        throw new Error(result.error ?? "Não foi possível excluir sua conta.");
      }

      setFeedback({
        tone: "success",
        text: result.data?.message ?? "Sua conta foi excluida com sucesso."
      });

      await signOutAndRedirect({
        supabaseClient: supabase,
        redirectTo: "/"
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Não foi possível excluir sua conta."
      });
      setDeletingAccount(false);
    }
  }

  if (isLoading || !ready) {
    return (
      <PageShell>
        <Container className="py-12">
          <Card className="mx-auto max-w-4xl">
            <div className="flex min-h-[260px] items-center justify-center text-sm text-white/64">
              Carregando central de privacidade...
            </div>
          </Card>
        </Container>
      </PageShell>
    );
  }

  if (!isAuthenticated) {
    return (
      <PageShell>
        <Container className="max-w-3xl py-12">
          <Card className="space-y-4">
            <p className="text-sm uppercase tracking-[0.24em] text-primary">Privacidade</p>
            <h1 className="text-3xl font-semibold text-white">Entre para acessar sua central de privacidade</h1>
            <p className="text-sm text-white/66">
              Aqui você pode exportar seus dados, revisar consentimentos opcionais e solicitar a exclusão da conta.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/login" className="inline-flex">
                <Button className="w-full sm:w-auto">Entrar</Button>
              </Link>
              <Link href="/politica-de-privacidade" className="inline-flex">
                <Button variant="secondary" className="w-full sm:w-auto">
                  Ver política de privacidade
                </Button>
              </Link>
            </div>
          </Card>
        </Container>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <Container className="max-w-5xl space-y-5 py-6">
        <Link
          href="/perfil"
          className="inline-flex items-center gap-1.5 text-sm text-white/52 transition hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>
        <div className="space-y-3">
          <p className="text-sm uppercase tracking-[0.24em] text-primary">Privacidade</p>
          <h1 className="text-3xl font-semibold text-white">Central de privacidade e direitos do titular</h1>
          <p className="max-w-3xl text-sm leading-6 text-white/66">
            O treino é sugerido com base nas respostas fornecidas e deve ser utilizado como uma opção de referência.
          </p>
          <div className="flex flex-wrap gap-3 text-sm text-white/68">
            <Link href="/politica-de-privacidade" className="font-semibold text-primary transition hover:text-primaryStrong">
              Ver política de privacidade
            </Link>
            <Link href="/perfil" className="font-semibold text-white/72 transition hover:text-white">
              Voltar ao perfil
            </Link>
          </div>
        </div>

        {feedback ? <FeedbackBanner feedback={feedback} /> : null}

        <Card className="space-y-4">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-white">Consentimentos atuais</h2>
            <p className="text-sm text-white/64">
              Atualize os consentimentos opcionais sempre que quiser. A revogação passa a valer imediatamente para novas execuções do app.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {consentCards.map((item) => (
              <label key={item.key} className="rounded-[22px] border border-white/10 bg-black/20 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-white">{item.title}</p>
                    <p className="text-sm leading-6 text-white/62">{item.description}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={draftPreferences[item.key as keyof ConsentPreferenceMap]}
                    onChange={(event) =>
                      setDraftPreferences((current) => ({
                        ...current,
                        [item.key]: event.target.checked
                      }))
                    }
                    className="mt-1 h-4 w-4 rounded border-white/20 accent-[#22c55e]"
                  />
                </div>
              </label>
            ))}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button onClick={handleSaveConsents} disabled={savingConsents || !hasConsentChanges}>
              {savingConsents ? "Salvando..." : "Salvar consentimentos"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setDraftPreferences(preferences)}
              disabled={savingConsents || !hasConsentChanges}
            >
              Descartar alterações
            </Button>
          </div>
        </Card>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="space-y-4">
            <h2 className="text-xl font-semibold text-white">Uso dos dados no app</h2>
            <p className="text-sm text-white/72">
              O Hora do Treino usa respostas gerais de treino, como objetivo, nível, frequência, disponibilidade e preferências, para montar sugestões de treino.
            </p>
            <p className="text-sm text-white/58">
              Os consentimentos opcionais desta tela cobrem apenas anúncios e marketing.
            </p>
            <p className="text-sm text-white/58">
              Versão atual dos consentimentos: {consentPayload?.version ?? "não identificada"}.
            </p>
          </Card>

          <Card className="space-y-4">
            <h2 className="text-xl font-semibold text-white">Exportação de dados</h2>
            <p className="text-sm text-white/64">
              Gere um arquivo JSON com perfil, respostas do quiz, treinos, consentimentos, eventos e metadados relevantes da sua conta.
            </p>
            <Button onClick={handleExportData} disabled={exportingData}>
              {exportingData ? "Preparando exportação..." : "Baixar meus dados"}
            </Button>
          </Card>
        </div>

        <Card className="space-y-4 border-red-400/20">
          <h2 className="text-xl font-semibold text-white">Excluir conta</h2>
          <p className="text-sm text-white/72">
            Ao excluir sua conta, apagaremos seus dados de acesso, respostas do quiz, treinos e histórico interno, salvo o que precisarmos manter por obrigação legal ou segurança.
          </p>
          <p className="text-sm text-white/58">
            Integrações externas de marketing e anúncios podem exigir tratamento operacional complementar fora do app.
          </p>
          <Button variant="secondary" onClick={handleDeleteAccount} disabled={deletingAccount}>
            {deletingAccount ? "Excluindo conta..." : "Excluir minha conta"}
          </Button>
        </Card>
      </Container>
    </PageShell>
  );
}

function FeedbackBanner({ feedback }: { feedback: FeedbackState }) {
  const toneClassName =
    feedback.tone === "success"
      ? "border-primary/30 bg-primary/12 text-primary"
      : feedback.tone === "info"
        ? "border-white/15 bg-white/[0.04] text-white/80"
        : "border-red-400/30 bg-red-500/10 text-red-200";

  return <div className={`rounded-2xl border px-4 py-3 text-sm ${toneClassName}`}>{feedback.text}</div>;
}
